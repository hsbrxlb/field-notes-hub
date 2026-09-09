import type { StudyAnchor, StudyManifest } from "./study-schema";
import { questionPolicyViolation } from "./question-policy";
import type {
  ActiveMove,
  FieldUpdate,
  ModeratorAssessment,
  ModeratorState,
  PendingGap,
  RejectedFieldUpdate,
  ServerAction,
  UnresolvedPoint,
} from "./conversation-types";

const confidenceValue = { high: 0.9, medium: 0.65, low: 0.35 } as const;
const unsafeFactIntents = new Set(["prompt_attack", "off_topic", "gibberish", "asks_clarification", "already_answered", "frustration", "refusal", "skip", "stop"]);
const unsafeGapIntents = new Set(["prompt_attack", "off_topic", "gibberish"]);
const stayActions = new Set<ServerAction>(["probe_now", "immediate_clarify", "repair_conversation", "soft_redirect"]);

const unique = <T>(items: T[]) => [...new Set(items)];
const compact = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");

export const createModeratorState = (study: StudyManifest): ModeratorState => {
  const first = study.anchors[0];
  return {
    schemaVersion: "moderator-2.0",
    policyVersion: study.moderation.policyVersion,
    promptVersion: study.model.promptVersion,
    revision: 0,
    activeAnchorId: first.id,
    activePrompt: first.question,
    activeMove: { kind: "anchor", anchorId: first.id },
    activeLanguage: study.study.languagePolicy.entryLanguage,
    completedAnchors: [],
    facts: {},
    pendingGaps: [],
    contradictions: [],
    probeCounts: {},
    totalProbeCount: 0,
    repairCount: 0,
    anchorsSinceCheckpoint: 0,
    checkpointQuestions: 0,
    finalAuditQuestions: 0,
    turnCount: 0,
    riskFlags: [],
    completionQuality: null,
  };
};

const hasFact = (state: ModeratorState, fieldId: string) => {
  const fact = state.facts[fieldId];
  if (!fact || fact.status !== "confirmed") return false;
  if (Array.isArray(fact.value)) return fact.value.length > 0;
  return String(fact.value ?? "").trim().length > 0;
};

export const isAnchorCovered = (study: StudyManifest, state: ModeratorState, anchorId: string) => {
  const anchor = study.anchors.find((item) => item.id === anchorId);
  return Boolean(anchor && anchor.requiredFields.length > 0 && anchor.requiredFields.every((field) => hasFact(state, field)));
};

const nextAnchor = (study: StudyManifest, state: ModeratorState, currentId: string): StudyAnchor | null => {
  const currentIndex = study.anchors.findIndex((anchor) => anchor.id === currentId);
  for (let index = currentIndex + 1; index < study.anchors.length; index += 1) {
    const candidate = study.anchors[index];
    if (state.completedAnchors.includes(candidate.id)) continue;
    if (candidate.skipWhenCovered && isAnchorCovered(study, state, candidate.id)) {
      state.completedAnchors = unique([...state.completedAnchors, candidate.id]);
      continue;
    }
    return candidate;
  }
  return null;
};

const anchorForField = (study: StudyManifest, fieldId: string) =>
  study.anchors.find((anchor) => anchor.requiredFields.includes(fieldId));

const anchorOwnsGapField = (study: StudyManifest, anchorId: string, fieldId: string | null) => {
  if (!fieldId) return true;
  const owner = study.anchors.find((anchor) => anchor.id === anchorId);
  return Boolean(owner && (owner.evidenceFields ?? owner.requiredFields).includes(fieldId));
};

const participantExpectsLaterAnswer = (rawText: string) =>
  /(?:稍后|后面|结束前|结束时|快结束|最后).{0,18}(?:再问|再确认|提醒|再说|回答)|(?:ask|remind).{0,24}(?:later|at the end)|(?:answer|respond).{0,18}later|(?:pregunt|recuérd).{0,24}(?:después|al final)|(?:responder|contestar).{0,18}(?:después|más tarde)/iu.test(compact(rawText));

const validateFieldUpdate = (study: StudyManifest, update: FieldUpdate): string | null => {
  const field = study.fields.find((item) => item.id === update.fieldId);
  if (!field) return "field is not declared";
  if (field.type === "text" && typeof update.value !== "string") return "text field requires a string";
  if (field.type === "number" && typeof update.value !== "number") return "number field requires a number";
  if (field.type === "string_list" && (!Array.isArray(update.value) || update.value.some((value) => typeof value !== "string"))) return "string_list field requires strings";
  if (field.type === "choice" && typeof update.value !== "string") return "choice field requires one value";
  if (field.type === "scale" && typeof update.value !== "number") return "scale field requires a number";
  const anchor = anchorForField(study, update.fieldId);
  if (!anchor) return null;
  if (field.type === "choice" && anchor.input.type === "single_choice") {
    if (!anchor.input.options.some((option) => option.id === update.value)) return "choice is outside the declared options";
  }
  if (field.type === "scale" && anchor.input.type === "scale" && typeof update.value === "number") {
    if (update.value < anchor.input.min || update.value > anchor.input.max) return "scale value is outside the declared range";
  }
  return null;
};

const gapScore = (point: UnresolvedPoint, state: ModeratorState) => {
  const priority = point.priority === "critical" ? 5 : point.priority === "important" ? 3 : 1;
  const fatiguePenalty = Math.min(2, state.totalProbeCount * 0.2 + state.finalAuditQuestions * 0.4);
  return Number((priority + point.uncertainty * 2 + point.answerability * 2 - fatiguePenalty).toFixed(2));
};

const mergePendingGaps = (state: ModeratorState, points: UnresolvedPoint[], turnId: string, turnIndex: number) => {
  for (const point of points) {
    const existing = state.pendingGaps.find((gap) => {
      if (gap.status === "resolved" || gap.status === "dropped" || gap.anchorId !== point.anchorId) return false;
      const sameField = Boolean(gap.fieldId && point.fieldId && gap.fieldId === point.fieldId);
      const activeAskedGap = gap.status === "asked" && state.activeMove?.gapId === gap.id && (!gap.fieldId || !point.fieldId || gap.fieldId === point.fieldId);
      const similarUnscopedGap = !gap.fieldId && !point.fieldId && semanticSimilarity(gap.question, point.question) >= 0.55;
      return sameField || activeAskedGap || similarUnscopedGap;
    });
    if (existing) {
      existing.evidenceTurnIds = unique([...existing.evidenceTurnIds, ...point.evidenceTurnIds]);
      existing.uncertainty = Math.max(existing.uncertainty, point.uncertainty);
      existing.answerability = Math.max(existing.answerability, point.answerability);
      existing.score = gapScore(existing, state);
      continue;
    }
    state.pendingGaps.push({
      ...point,
      id: `gap-${turnIndex}-${state.pendingGaps.length + 1}`,
      status: "pending",
      createdTurnId: turnId,
      createdTurnIndex: turnIndex,
      attempts: 0,
      score: gapScore(point, state),
    });
  }
};

const ngrams = (value: string) => {
  const normalized = compact(value).toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
  if (normalized.length < 3) return new Set([normalized]);
  return new Set(Array.from({ length: normalized.length - 2 }, (_, index) => normalized.slice(index, index + 3)));
};

export const semanticSimilarity = (left: string, right: string) => {
  const a = ngrams(left);
  const b = ngrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
};

const safeReply = (candidate: string, recentPrompts: string[], allowNoQuestion = false, allowSemanticRepeat = false) => {
  const cleaned = compact(candidate).slice(0, 480);
  const questionCount = cleaned.match(/[?？؟]/g)?.length ?? 0;
  const praise = /\b(great|excellent|insightful|smart|good answer|well said)\b|很有意思|说得很好|非常棒|excelente|interesante/iu.test(cleaned);
  const generic = /\b(tell me more|elaborate|provide more detail)\b|详细说说|展开一下|多说一点/iu.test(cleaned);
  const leading = /\b(is it because|would you say|does that mean|for example|such as|if (?:price|cost|installation) (?:isn't|is not|weren't|were not))\b|是不是.{0,40}[?？]|也就是说|比如|例如|对吗[?？]|如果.{0,30}(?:不是问题|没有限制|不考虑).{0,20}[?？]|超过.{0,12}(美元|dollars?)/iu.test(cleaned);
  const repeated = !allowSemanticRepeat && recentPrompts.some((prompt) => semanticSimilarity(cleaned, prompt) >= 0.82);
  const questionSafe = allowNoQuestion ? questionCount <= 1 : questionCount === 1;
  return cleaned && questionSafe && !questionPolicyViolation(cleaned) && !praise && !generic && !leading && !repeated ? cleaned : null;
};

const repairCandidate = (candidate: string) => {
  const cleaned = compact(candidate);
  const marker = cleaned.search(/\b(for example|such as)\b|比如|例如/iu);
  const withoutExamples = marker >= 0 ? cleaned.slice(0, marker).trim() : cleaned;
  const endings = [...withoutExamples.matchAll(/[?？؟]/g)];
  if (endings.length <= 1) return withoutExamples;
  return withoutExamples.slice(0, (endings[0]?.index ?? withoutExamples.length) + 1);
};

const normalizeQuestionCandidate = (candidate: string) => {
  const cleaned = repairCandidate(candidate);
  return /[?？؟]/.test(cleaned) ? cleaned : `${cleaned.replace(/[.!。！]+$/u, "")}？`;
};

const normalizeLocalizedPunctuation = (prompt: string, language: string) => language.startsWith("zh")
  ? prompt.replace(/,/g, "，").replace(/\?/g, "？").replace(/:/g, "：")
  : prompt;

const questionMatchesLanguage = (question: string, language: string) => {
  if (language.startsWith("zh")) return /\p{Script=Han}/u.test(question);
  if (language.startsWith("es")) return /[¿¡]|\b(que|qué|cuál|cómo|cuándo|dónde|por qué)\b/iu.test(question);
  return true;
};

const localizedAnchorCopy = (values: Record<string, string> | undefined, language: string, fallback: string) => {
  if (!values) return fallback;
  const base = language.split("-")[0];
  return values[language] || values[base] || fallback;
};

const localizedAnchorQuestion = (anchor: StudyAnchor, language: string) =>
  localizedAnchorCopy(anchor.questionLocales, language, anchor.question);

const localizedAnchorClarification = (anchor: StudyAnchor, language: string) =>
  localizedAnchorCopy(anchor.clarificationLocales, language, anchor.clarification);

const resolvedReplyLanguage = (rawText: string, assessment: ModeratorAssessment, previousLanguage: string) => {
  const text = compact(rawText);
  if (["gibberish", "prompt_attack", "off_topic"].includes(assessment.participantIntent)) return previousLanguage;
  if (text.length < 4) return previousLanguage;
  if ((text.match(/\p{Script=Han}/gu)?.length ?? 0) >= 2) return "zh-CN";
  if (/[¿¡]|\b(qué|cuál|cómo|cuándo|dónde|porque|pero|para|precio|coche|bosque|instalación)\b/iu.test(text)) return "es";
  const latinWords = text.match(/[A-Za-zÀ-ÿ]+/g)?.length ?? 0;
  if (latinWords >= 3 && assessment.replyLanguageConfidence !== "low") return assessment.replyLanguage || previousLanguage;
  return assessment.replyLanguageConfidence === "high" ? assessment.replyLanguage || previousLanguage : previousLanguage;
};

const localizedStop = (language: string) => {
  if (language.startsWith("zh")) return "访谈已经停止。已有回答会保留，系统不会继续提问。";
  if (language.startsWith("es")) return "La entrevista se ha detenido. Las respuestas existentes se conservan y no se harán más preguntas.";
  return "The interview has stopped. Existing answers are retained and no more questions will be asked.";
};

const topPendingGap = (state: ModeratorState, anchorId?: string, excludeAnchorId?: string, stage: "checkpoint_gap" | "final_audit" = "checkpoint_gap") => state.pendingGaps
  .filter((gap) => gap.status === "pending" && gap.attempts < 2 && (stage === "final_audit" || !gap.notBeforeStage) && gap.answerability >= 0.45 && gap.priority !== "nice_to_have" && (!anchorId || gap.anchorId === anchorId) && (!excludeAnchorId || gap.anchorId !== excludeAnchorId))
  .sort((left, right) => right.score - left.score)[0] ?? null;

const scheduleGap = (study: StudyManifest, state: ModeratorState, gap: PendingGap, kind: ActiveMove["kind"], resumeAnchorId: string | null, askedTurnId: string) => {
  gap.status = "asked";
  gap.attempts += 1;
  gap.askedTurnId = askedTurnId;
  state.activeAnchorId = gap.anchorId;
  state.activeMove = { kind, anchorId: gap.anchorId, gapId: gap.id, resumeAnchorId };
  const gapAnchor = study.anchors.find((anchor) => anchor.id === gap.anchorId);
  const reviewedFieldQuestion = gap.fieldId && gapAnchor?.followUpQuestions?.[gap.fieldId];
  if (!gapAnchor) throw new Error("gap anchor is not declared");
  const question = reviewedFieldQuestion ? localizedAnchorCopy(reviewedFieldQuestion, state.activeLanguage, reviewedFieldQuestion.en || gapAnchor.question) : localizedAnchorClarification(gapAnchor, state.activeLanguage);
  state.activePrompt = normalizeLocalizedPunctuation(normalizeQuestionCandidate(question), state.activeLanguage);
  if (kind === "checkpoint_gap") state.checkpointQuestions += 1;
  if (kind === "final_audit") state.finalAuditQuestions += 1;
};

const completeState = (study: StudyManifest, state: ModeratorState, language: string) => {
  for (const gap of state.pendingGaps) if (gap.status === "pending" || gap.status === "asked") gap.status = "unresolved";
  const hasGaps = state.pendingGaps.some((gap) => gap.status === "unresolved") || study.completion.requiredAnchors.some((id) => !isAnchorCovered(study, state, id));
  state.activeAnchorId = null;
  state.activeMove = null;
  state.activePrompt = null;
  state.completionQuality = hasGaps ? "with_evidence_gaps" : "complete";
  const configured = study.completion.messages[language] || study.completion.messages[study.study.languagePolicy.fallbackLanguage];
  return configured || Object.values(study.completion.messages)[0] || "Thank you. The interview is complete.";
};

export type AppliedTurn = {
  state: ModeratorState;
  serverAction: ServerAction;
  prompt: string | null;
  displayedReply: string | null;
  acceptedUpdates: FieldUpdate[];
  rejectedUpdates: RejectedFieldUpdate[];
  actionReason: string;
};

const planAssessment = ({
  study,
  previous,
  assessment,
  turnId,
  turnIndex,
  rawText,
  recentPrompts,
  structuredFieldIds = [],
  forceAdvance = false,
}: {
  study: StudyManifest;
  previous: ModeratorState;
  assessment: ModeratorAssessment;
  turnId: string;
  turnIndex: number;
  rawText: string;
  recentPrompts: string[];
  structuredFieldIds?: string[];
  forceAdvance?: boolean;
}): AppliedTurn => {
  if (!previous.activeAnchorId || !previous.activeMove) throw new Error("session is already complete");
  const state = structuredClone(previous);
  const anchor = study.anchors.find((item) => item.id === previous.activeAnchorId);
  if (!anchor) throw new Error("active anchor is not in the study manifest");
  const acceptedUpdates: FieldUpdate[] = [];
  const rejectedUpdates: RejectedFieldUpdate[] = [];
  const updates = unsafeFactIntents.has(assessment.participantIntent) ? [] : assessment.understoodFacts;
  if (unsafeFactIntents.has(assessment.participantIntent) && assessment.understoodFacts.length) {
    for (const update of assessment.understoodFacts) rejectedUpdates.push({ fieldId: update.fieldId, reason: `updates are blocked for ${assessment.participantIntent}` });
  }
  for (const [index, update] of updates.entries()) {
    const reason = validateFieldUpdate(study, update);
    if (reason) {
      rejectedUpdates.push({ fieldId: update.fieldId, reason });
      continue;
    }
    const existing = state.facts[update.fieldId];
    if (existing?.status === "confirmed" && JSON.stringify(existing.value) !== JSON.stringify(update.value) && (!update.correction || update.confidence === "low")) {
      rejectedUpdates.push({ fieldId: update.fieldId, reason: "conflicting value requires an explicit confident correction" });
      state.contradictions.push({ fieldId: update.fieldId, description: "A new interpretation conflicts with an earlier confirmed statement; the original is retained until clarification.", evidenceTurnIds: unique([...existing.evidenceTurnIds, ...update.evidenceTurnIds, turnId]) });
      continue;
    }
    state.facts[update.fieldId] = {
      factId: `${turnId}:${update.fieldId}:${index}`,
      fieldId: update.fieldId,
      value: update.value,
      rawValue: rawText,
      confidence: confidenceValue[update.confidence],
      status: update.confidence === "low" || (update.confidence === "medium" && assessment.unresolvedPoints.some((point) => point.fieldId === update.fieldId)) ? "candidate" : "confirmed",
      source: update.correction ? "participant_correction" : structuredFieldIds.includes(update.fieldId) ? "structured_input" : "model",
      sourceTurnId: turnId,
      sourceTurnIndex: turnIndex,
      evidenceTurnIds: unique([...update.evidenceTurnIds, turnId]),
      supersedesFactId: existing?.factId,
      updatedAt: new Date().toISOString(),
    };
    acceptedUpdates.push(update);
  }

  // Confirmed evidence closes missing-information gaps. Only a source-linked
  // contradiction raised by this answer can reopen that same declared field.
  // Historical contradiction records alone must not keep reopening resolved facts.
  const currentContradictionFields = new Set([
    ...state.contradictions.slice(previous.contradictions.length),
    ...assessment.contradictions,
  ].filter((item) => item.fieldId && item.evidenceTurnIds.includes(turnId)).map((item) => item.fieldId!));
  for (const update of acceptedUpdates) {
    if (update.correction && update.confidence !== "low" && hasFact(state, update.fieldId)) currentContradictionFields.delete(update.fieldId);
  }

  state.revision += 1;
  state.turnCount += 1;
  state.lastParticipantIntent = assessment.participantIntent;
  state.activeLanguage = resolvedReplyLanguage(rawText, assessment, previous.activeLanguage);
  state.contradictions = [...state.contradictions, ...assessment.contradictions].slice(-30);
  for (const gap of state.pendingGaps) {
    if (gap.status !== "pending") continue;
    const resolvedByFact = Boolean(gap.fieldId && acceptedUpdates.some((update) => update.fieldId === gap.fieldId) && hasFact(state, gap.fieldId) && !currentContradictionFields.has(gap.fieldId));
    const resolvedByCoverage = !gap.fieldId && gap.anchorId === anchor.id && isAnchorCovered(study, state, anchor.id);
    if (resolvedByFact || resolvedByCoverage) {
      gap.status = "resolved";
      gap.resolvedTurnId = turnId;
    }
  }
  const eligibleGapAnchors = new Set([...previous.completedAnchors, anchor.id]);
  const anchorEligiblePoints = assessment.unresolvedPoints.filter((point) => eligibleGapAnchors.has(point.anchorId));
  if (anchorEligiblePoints.length !== assessment.unresolvedPoints.length) {
    state.riskFlags = unique([...state.riskFlags, "rejected_future_topic_gap"]);
  }
  const fieldEligiblePoints = anchorEligiblePoints.filter((point) => anchorOwnsGapField(study, point.anchorId, point.fieldId));
  if (fieldEligiblePoints.length !== anchorEligiblePoints.length) {
    state.riskFlags = unique([...state.riskFlags, "rejected_mismatched_gap_field"]);
  }
  const missingOrContradictoryPoints = fieldEligiblePoints.filter((point) => !point.fieldId || !hasFact(state, point.fieldId) || currentContradictionFields.has(point.fieldId));
  if (missingOrContradictoryPoints.length !== fieldEligiblePoints.length) {
    state.riskFlags = unique([...state.riskFlags, "rejected_known_field_gap"]);
  }
  const normalizeLaterAnswerability = participantExpectsLaterAnswer(rawText);
  const eligibleUnresolvedPoints = missingOrContradictoryPoints.map((point) => normalizeLaterAnswerability && point.anchorId === anchor.id && point.answerability < 0.55
    ? { ...point, answerability: 0.65 }
    : point);
  if (normalizeLaterAnswerability && eligibleUnresolvedPoints.some((point, index) => point.answerability !== missingOrContradictoryPoints[index]?.answerability)) {
    state.riskFlags = unique([...state.riskFlags, "normalized_later_answerability"]);
  }
  const currentUnresolvedPoints = eligibleUnresolvedPoints.filter((point) => point.anchorId === anchor.id);
  if (!unsafeGapIntents.has(assessment.participantIntent)) mergePendingGaps(state, eligibleUnresolvedPoints, turnId, turnIndex);
  if (rejectedUpdates.length) state.riskFlags = unique([...state.riskFlags, "rejected_model_field_update"]);

  if (assessment.participantIntent === "stop") {
    state.activePrompt = null;
    return { state, serverAction: "stop", prompt: null, displayedReply: localizedStop(state.activeLanguage), acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }

  const currentMove = previous.activeMove;
  if (currentMove.kind !== "anchor") {
    const repairBudgetExhausted = assessment.participantIntent === "asks_clarification" && state.repairCount >= study.moderation.maxRepairTurns;
    const activeGap = state.pendingGaps.find((gap) => gap.id === currentMove.gapId);
    if (activeGap && assessment.participantIntent !== "asks_clarification") {
      const resolvedByFact = Boolean(activeGap.fieldId && acceptedUpdates.some((update) => update.fieldId === activeGap.fieldId) && hasFact(state, activeGap.fieldId) && !currentContradictionFields.has(activeGap.fieldId));
      const covered = !activeGap.fieldId && isAnchorCovered(study, state, anchor.id);
      const deferUntilEnd = currentMove.kind === "checkpoint_gap" && assessment.participantIntent !== "refusal" && assessment.participantIntent !== "skip" && normalizeLaterAnswerability && activeGap.attempts < 2;
      activeGap.status = resolvedByFact || covered ? "resolved" : deferUntilEnd ? "pending" : "unresolved";
      if (deferUntilEnd) activeGap.notBeforeStage = "final_audit";
      else activeGap.resolvedTurnId = turnId;
    }
    if (assessment.participantIntent === "asks_clarification" && state.repairCount < study.moderation.maxRepairTurns) {
      state.repairCount += 1;
      const prompt = localizedAnchorClarification(anchor, state.activeLanguage);
      state.activePrompt = prompt;
      return { state, serverAction: "immediate_clarify", prompt, displayedReply: prompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
    }
    if (repairBudgetExhausted) {
      if (activeGap) {
        activeGap.status = "unresolved";
        activeGap.resolvedTurnId = turnId;
      }
      state.riskFlags = unique([...state.riskFlags, `repair_budget_exhausted:${anchor.id}`]);
    }
    if (currentMove.kind === "checkpoint_gap" && currentMove.resumeAnchorId) {
      const resume = study.anchors.find((item) => item.id === currentMove.resumeAnchorId) ?? null;
      if (resume) {
        state.activeAnchorId = resume.id;
        state.activeMove = { kind: "anchor", anchorId: resume.id };
        const reviewedResume = localizedAnchorQuestion(resume, state.activeLanguage);
        state.activePrompt = normalizeLocalizedPunctuation(reviewedResume, state.activeLanguage);
        state.anchorsSinceCheckpoint = 0;
        return { state, serverAction: "advance", prompt: state.activePrompt, displayedReply: state.activePrompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
      }
    }
    const nextGap = state.finalAuditQuestions < study.moderation.maxFinalAuditQuestions ? topPendingGap(state, undefined, undefined, "final_audit") : null;
    if (nextGap) {
      scheduleGap(study, state, nextGap, "final_audit", null, turnId);
      return { state, serverAction: "advance", prompt: state.activePrompt, displayedReply: state.activePrompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
    }
    const completion = completeState(study, state, state.activeLanguage);
    return { state, serverAction: "complete", prompt: null, displayedReply: completion, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }

  const factsCoverAnchor = isAnchorCovered(study, state, anchor.id);
  const modelCoversAnchor = assessment.topicCoverage.anchorId === anchor.id && assessment.topicCoverage.status === "covered";
  let serverAction: ServerAction;
  if (forceAdvance) serverAction = "skip";
  else if (assessment.participantIntent === "gibberish" && (previous.lastParticipantIntent === "gibberish" || (previous.repairCount > 0 && assessment.nextAction === "defer_gap"))) serverAction = "defer_gap";
  else if (assessment.participantIntent === "prompt_attack" || assessment.participantIntent === "off_topic" || assessment.participantIntent === "gibberish") serverAction = "soft_redirect";
  else if (assessment.participantIntent === "asks_clarification") serverAction = "immediate_clarify";
  else if (assessment.participantIntent === "already_answered" || assessment.participantIntent === "frustration") serverAction = "repair_conversation";
  else if (assessment.participantIntent === "refusal" || assessment.participantIntent === "skip") serverAction = "skip";
  else serverAction = assessment.nextAction;

  const probeBudgetAvailable = (state.probeCounts[anchor.id] ?? 0) < anchor.maxImmediateProbes && state.totalProbeCount < study.moderation.maxTotalProbes;
  if (serverAction === "probe_now" && !currentUnresolvedPoints.length) {
    serverAction = factsCoverAnchor || modelCoversAnchor ? "advance" : "defer_gap";
    state.riskFlags = unique([...state.riskFlags, fieldEligiblePoints.some((point) => point.anchorId === anchor.id) ? "rejected_redundant_probe" : "rejected_cross_topic_probe"]);
  }
  if (serverAction === "probe_now" && normalizeLaterAnswerability && currentUnresolvedPoints.length) {
    serverAction = "defer_gap";
    state.riskFlags = unique([...state.riskFlags, "participant_requested_later_probe"]);
  }
  if (serverAction === "probe_now" && recentPrompts.some((prompt) => semanticSimilarity(assessment.candidateReply, prompt) >= 0.82)) {
    serverAction = "defer_gap";
    state.riskFlags = unique([...state.riskFlags, "repeated_probe_deferred"]);
  }
  if (serverAction === "probe_now" && !probeBudgetAvailable) serverAction = "defer_gap";
  if (serverAction === "probe_now" && (assessment.topicCoverage.status === "covered" || factsCoverAnchor) && !currentUnresolvedPoints.some((point) => point.priority === "critical")) serverAction = "advance";
  if (serverAction === "complete") serverAction = "advance";
  if ((serverAction === "repair_conversation" || serverAction === "immediate_clarify" || serverAction === "soft_redirect") && state.repairCount >= study.moderation.maxRepairTurns) serverAction = factsCoverAnchor || modelCoversAnchor ? "advance" : "defer_gap";

  if (serverAction === "probe_now") {
    state.probeCounts[anchor.id] = (state.probeCounts[anchor.id] ?? 0) + 1;
    state.totalProbeCount += 1;
  }
  if (serverAction === "immediate_clarify" || serverAction === "repair_conversation" || serverAction === "soft_redirect") state.repairCount += 1;

  const repairCanAdvance = serverAction === "repair_conversation" && (factsCoverAnchor || modelCoversAnchor);
  if (stayActions.has(serverAction) && !repairCanAdvance) {
    if (serverAction === "probe_now") state.activeMove = { ...currentMove, responseType: "text" };
    const prompt = localizedAnchorQuestion(anchor, state.activeLanguage);
    state.activePrompt = prompt;
    return { state, serverAction, prompt, displayedReply: prompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }

  state.completedAnchors = unique([...state.completedAnchors, anchor.id]);
  state.anchorsSinceCheckpoint += 1;
  if (serverAction === "skip") for (const gap of state.pendingGaps) {
    if (gap.anchorId === anchor.id && (gap.status === "pending" || gap.status === "asked")) { gap.status = "unresolved"; gap.answerability = 0; }
  }
  if (serverAction === "skip" && !factsCoverAnchor) {
    state.riskFlags = unique([...state.riskFlags, `participant_skipped:${anchor.id}`]);
    if (study.completion.requiredAnchors.includes(anchor.id)) {
      const skippedField = anchor.requiredFields.find((fieldId) => !hasFact(state, fieldId)) ?? null;
      mergePendingGaps(state, [{
        anchorId: anchor.id,
        fieldId: skippedField,
        question: anchor.clarification,
        reason: "The participant skipped a topic required for the research decision.",
        priority: "critical",
        uncertainty: 1,
        answerability: 0,
        evidenceTurnIds: [turnId],
      }], turnId, turnIndex);
      for (const gap of state.pendingGaps) {
        if (gap.anchorId === anchor.id && gap.fieldId === skippedField && gap.status === "pending") gap.status = "unresolved";
      }
    }
  }
  if (serverAction !== "skip" && !factsCoverAnchor) for (const missingField of anchor.requiredFields.filter((field) => !hasFact(state, field))) {
    mergePendingGaps(state, [{
      anchorId: anchor.id,
      fieldId: missingField,
      question: anchor.clarification,
      reason: "The topic advanced without enough decision-relevant evidence.",
      priority: anchor.optional ? "nice_to_have" : "important",
      uncertainty: 0.8,
      answerability: 0.7,
      evidenceTurnIds: [turnId],
    }], turnId, turnIndex);
  }

  const next = nextAnchor(study, state, anchor.id);
  const checkpointGap = state.anchorsSinceCheckpoint >= study.moderation.checkpointEveryAnchors && state.checkpointQuestions < study.moderation.maxCheckpointQuestions
    ? topPendingGap(state, undefined, serverAction === "defer_gap" ? anchor.id : undefined)
    : null;
  if (next && checkpointGap) {
    scheduleGap(study, state, checkpointGap, "checkpoint_gap", next.id, turnId);
    return { state, serverAction, prompt: state.activePrompt, displayedReply: state.activePrompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }
  if (next) {
    state.activeAnchorId = next.id;
    state.activeMove = { kind: "anchor", anchorId: next.id };
    state.activePrompt = localizedAnchorQuestion(next, state.activeLanguage);
    return { state, serverAction, prompt: state.activePrompt, displayedReply: state.activePrompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }

  const alternateFinalGap = normalizeLaterAnswerability ? topPendingGap(state, undefined, anchor.id, "final_audit") : null;
  const finalGap = state.finalAuditQuestions < study.moderation.maxFinalAuditQuestions ? alternateFinalGap ?? topPendingGap(state, undefined, undefined, "final_audit") : null;
  if (finalGap) {
    scheduleGap(study, state, finalGap, "final_audit", null, turnId);
    return { state, serverAction, prompt: state.activePrompt, displayedReply: state.activePrompt, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
  }

  const completion = completeState(study, state, state.activeLanguage);
  return { state, serverAction: "complete", prompt: null, displayedReply: completion, acceptedUpdates, rejectedUpdates, actionReason: assessment.actionReason };
};

// Planning may use canonical scope references internally. Only validated AI wording
// leaves applyAssessment; a rejected candidate requires bounded regeneration.
export const acceptPlannedReply = (study: StudyManifest, applied: AppliedTurn, assessment: ModeratorAssessment, recentPrompts: string[]): boolean => {
  if (applied.serverAction === "stop" || applied.serverAction === "complete") return true;
  const move = applied.state.activeMove;
  const anchor = study.anchors.find((item) => item.id === move?.anchorId);
  const gap = move?.gapId ? applied.state.pendingGaps.find((item) => item.id === move.gapId) : undefined;
  const probeGap = applied.serverAction === "probe_now" ? topPendingGap(applied.state, anchor?.id) : null;
  const fieldId = gap?.fieldId ?? probeGap?.fieldId;
  const actionMatches = assessment.nextAction === applied.serverAction || (applied.serverAction === "skip" && assessment.nextAction === "defer_gap");
  const scopeMatches = Boolean(anchor && assessment.candidateAnchorId === anchor.id && (!fieldId || assessment.candidateFieldId === fieldId) && (!assessment.candidateFieldId || anchorOwnsGapField(study, anchor.id, assessment.candidateFieldId)));
  const candidate = actionMatches && scopeMatches && questionMatchesLanguage(assessment.candidateReply, applied.state.activeLanguage)
    ? safeReply(assessment.candidateReply, recentPrompts) : null;
  applied.prompt = candidate ? normalizeLocalizedPunctuation(candidate, applied.state.activeLanguage) : null;
  applied.displayedReply = applied.prompt;
  applied.state.activePrompt = applied.prompt;
  return Boolean(candidate);
};

export const applyAssessment = (input: Parameters<typeof planAssessment>[0]): AppliedTurn => {
  const applied = planAssessment(input);
  if (applied.serverAction !== input.assessment.nextAction) applied.actionReason = `Server selected ${applied.serverAction} under the interview scope and budgets; model suggested ${input.assessment.nextAction}.`;
  acceptPlannedReply(input.study, applied, input.assessment, input.recentPrompts);
  return applied;
};
