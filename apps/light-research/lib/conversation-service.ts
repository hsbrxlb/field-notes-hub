import { getStudyConfig, localized } from "./study-config";
import { applyAssessment, createModeratorState } from "./moderator-state";
import { resolvePlannedReply } from "./moderator-dialogue";
import { evaluateTurn, ProviderError } from "./moderator-provider";
import { commitTurn, createSession, failTurn, getSessionByToken, listTurns, pauseSession, reserveTurn, sameInputPayload, StorageAccessError } from "./storage";
import type { ConversationTurn, FieldUpdate, ModeratorAssessment, ModeratorState } from "./conversation-types";
import type { StudyAnchor, StudyManifest } from "./study-schema";

export class ConversationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly answerSaved = false,
    public readonly diagnostic?: string,
  ) {
    super(message);
  }
}

const getActiveAnchor = (study: StudyManifest, state: ModeratorState): StudyAnchor | null =>
  state.activeAnchorId ? study.anchors.find((anchor) => anchor.id === state.activeAnchorId) ?? null : null;

export const validateInputPayload = (anchor: StudyAnchor, state: ModeratorState, payload: { type: string; selectedValues?: string[]; freeText?: string }) => {
  const expected = state.activeMove?.kind === "anchor" && !state.activeMove.responseType ? anchor.input.type : "text";
  if (payload.type !== expected) throw new ConversationError(400, "input_type", "The submitted input does not match the current question.");
  const selected = payload.selectedValues ?? [];
  if (new Set(selected).size !== selected.length) throw new ConversationError(400, "input_option", "Duplicate choices are not allowed.");
  if (expected === "text" && selected.length) throw new ConversationError(400, "input_option", "Text questions do not accept structured choices.");
  if (expected === "text") return;
  if (anchor.input.type === "single_choice" || anchor.input.type === "multiple_choice") {
    const allowed = new Set(anchor.input.options.map((option) => option.id));
    if (selected.some((value) => !allowed.has(value))) throw new ConversationError(400, "input_option", "The submitted choice is not available for this question.");
    if (anchor.input.type === "single_choice" && selected.length > 1) throw new ConversationError(400, "input_option", "This question accepts one choice.");
    if (anchor.input.type === "multiple_choice" && anchor.input.maxSelections && selected.length > anchor.input.maxSelections) {
      throw new ConversationError(400, "input_option", "Too many choices were submitted.");
    }
    if (!anchor.input.allowOther && payload.freeText?.trim()) throw new ConversationError(400, "input_option", "This question does not accept an additional free-text choice.");
    if (!selected.length && !(anchor.input.allowOther && payload.freeText?.trim())) throw new ConversationError(400, "input_option", "Choose an available option or provide an allowed other answer.");
  }
  if (anchor.input.type === "scale") {
    if (selected.length !== 1 || payload.freeText?.trim()) throw new ConversationError(400, "input_scale", "Scale questions require exactly one scale value.");
    const value = Number(selected[0]);
    if (!Number.isInteger(value) || value < anchor.input.min || value > anchor.input.max) throw new ConversationError(400, "input_scale", "The submitted scale value is outside the allowed range.");
  }
};

const structuredUpdates = (anchor: StudyAnchor, state: ModeratorState, payload: { selectedValues?: string[] }, turnId: string): FieldUpdate[] => {
  if (state.activeMove?.kind !== "anchor" || state.activeMove.responseType) return [];
  const selected = payload.selectedValues ?? [];
  const fieldId = anchor.requiredFields[0];
  if (!fieldId || !selected.length || anchor.input.type === "text") return [];
  const field = anchor.input.type === "scale" ? Number(selected[0]) : anchor.input.type === "multiple_choice" ? selected : selected[0];
  return [{ fieldId, value: field, confidence: "high", correction: false, evidenceTurnIds: [turnId] }];
};

const mergeAssessment = (assessment: ModeratorAssessment, direct: FieldUpdate[]): ModeratorAssessment => {
  const updates = new Map(assessment.understoodFacts.map((update) => [update.fieldId, update]));
  for (const update of direct) updates.set(update.fieldId, update);
  return {
    ...assessment,
    understoodFacts: [...updates.values()],
    topicCoverage: direct.length ? {
      ...assessment.topicCoverage,
      status: "covered",
      coveredFieldIds: [...new Set([...assessment.topicCoverage.coveredFieldIds, ...direct.map((item) => item.fieldId)])],
      evidenceTurnIds: [...new Set([...assessment.topicCoverage.evidenceTurnIds, ...direct.flatMap((item) => item.evidenceTurnIds)])],
    } : assessment.topicCoverage,
  };
};

type StoredTurnView = Awaited<ReturnType<typeof listTurns>>[number];

const toConversationTurn = (turn: StoredTurnView): ConversationTurn | null => {
  if (turn.processing_status !== "completed" || !turn.assessment || !turn.server_action || !turn.displayed_reply) return null;
  return {
    id: turn.id,
    turnIndex: turn.turn_index,
    anchorId: turn.anchor_id,
    moveKind: turn.move_kind ?? "anchor",
    canonicalPrompt: turn.canonical_prompt,
    localizedPrompt: turn.localized_prompt,
    rawText: turn.raw_text,
    inputPayload: turn.input_payload,
    replyLanguage: turn.reply_language || turn.assessment.replyLanguage,
    participantIntent: turn.assessment.participantIntent,
    topicCoverage: turn.assessment.topicCoverage,
    unresolvedPoints: turn.assessment.unresolvedPoints,
    contradictions: turn.assessment.contradictions,
    extractedFields: turn.extracted_fields ?? [],
    rejectedFieldUpdates: turn.rejected_field_updates ?? [],
    aiSuggestedAction: turn.assessment.nextAction,
    serverAction: turn.server_action,
    actionReason: turn.action_reason ?? turn.assessment.actionReason,
    candidateReply: turn.assessment.candidateReply,
    displayedReply: turn.displayed_reply,
    provider: turn.assessment.provider,
    model: turn.assessment.model,
    promptVersion: turn.assessment.promptVersion,
    policyVersion: turn.policy_version ?? "unknown",
  };
};

const failureNotice = (language: string) => {
  if (language.startsWith("zh")) return "你的回答已经保存，但 AI 暂时没能处理。你可以保留原回答并重试。";
  if (language.startsWith("es")) return "Tu respuesta se guardó, pero la IA no pudo procesarla. Puedes conservarla e intentarlo de nuevo.";
  return "Your answer was saved, but the AI could not process it. You can keep it and try again.";
};

const conversationView = async (entryToken: string) => {
  const study = getStudyConfig();
  const session = await getSessionByToken(entryToken);
  if (!session) throw new ConversationError(404, "not_found", "Study session not found.");
  if (session.study_id !== study.study.id || session.study_version !== study.study.version) {
    throw new ConversationError(409, "version_mismatch", "This session belongs to an older study version.");
  }
  const storedTurns = await listTurns(session.id, true);
  const messages = storedTurns.flatMap((stored) => {
    if (stored.processing_status === "completed") {
      return [
        { id: `q-${stored.id}`, role: "assistant" as const, text: stored.localized_prompt },
        { id: `a-${stored.id}`, role: "user" as const, text: stored.raw_text },
      ];
    }
    if (stored.processing_status === "failed" || stored.processing_status === "received") {
      return [
        { id: `q-${stored.id}`, role: "assistant" as const, text: stored.localized_prompt },
        { id: `a-${stored.id}`, role: "user" as const, text: stored.raw_text },
        ...(stored.processing_status === "failed" ? [{ id: `f-${stored.id}`, role: "assistant" as const, text: failureNotice(session.state.activeLanguage) }] : []),
      ];
    }
    return [];
  });
  const failedTurns = storedTurns.filter((turn) => turn.processing_status === "failed");
  const activeAnchor = getActiveAnchor(study, session.state);
  const lastStored = storedTurns.at(-1);
  const lastFailed = lastStored && lastStored.processing_status !== "completed";
  if (activeAnchor && session.state.activePrompt && !lastFailed) messages.push({ id: `q-active-${session.state.revision}`, role: "assistant", text: session.state.activePrompt });
  const completed = session.status === "completed" || session.status === "completed_with_gaps" || session.state.activeAnchorId === null;
  const gapMove = session.state.activeMove?.kind !== "anchor" || Boolean(session.state.activeMove?.responseType);
  return {
    status: completed ? "completed" as const : session.status,
    completionQuality: session.state.completionQuality,
    stateRevision: session.state.revision,
    anchorId: session.state.activeAnchorId,
    prompt: session.state.activePrompt,
    replyLanguage: session.state.activeLanguage,
    messages,
    input: gapMove ? { type: "text" as const } : activeAnchor?.input ?? null,
    media: gapMove ? [] : activeAnchor?.media ?? [],
    progress: {
      current: Math.min(study.anchors.length, session.state.completedAnchors.length + (completed ? 0 : 1)),
      total: study.anchors.length,
      label: activeAnchor?.label ?? "",
    },
    savedProviderFailures: failedTurns.length,
    processingStatus: lastStored?.processing_status ?? null,
    retryExhausted: lastStored?.processing_status === "failed" && lastStored.processing_attempts >= 3,
    retry: session.status === "active" && lastStored?.processing_status === "failed" && lastStored.anchor_id === session.state.activeAnchorId && lastStored.state_before.revision === session.state.revision && lastStored.processing_attempts < 3 ? {
      clientAttemptId: lastStored.client_attempt_id,
      text: lastStored.raw_text,
      inputPayload: lastStored.input_payload,
      intent: lastStored.request_intent,
    } : null,
    pendingGapCount: session.state.pendingGaps.filter((gap) => gap.status === "pending" || gap.status === "asked").length,
    completion: completed ? {
      participationCode: session.participation_code,
      message: localized(study.completion.messages, session.state.activeLanguage),
      rewardStatus: "not_connected",
    } : null,
  };
};

export const startConversation = async (consentVersion?: string, consentLocale?: string) => {
  const study = getStudyConfig();
  const requireConsent = process.env.SURVEY_CONSENT_MODE === "1";
  if (requireConsent) {
    if (consentVersion !== study.consent.version) throw new ConversationError(400, "consent_version", "Consent version is missing or outdated.");
    if (!consentLocale || !study.consent.locales[consentLocale]) throw new ConversationError(400, "consent_locale", "Consent locale is not supported.");
  } else {
    consentVersion = undefined;
    consentLocale = study.study.languagePolicy.entryLanguage;
  }
  const state = createModeratorState(study);
  const created = await createSession({
    study,
    state,
    consentVersion: consentVersion ?? null,
    consentLocale: requireConsent ? consentLocale ?? null : null,
    consentedAt: requireConsent ? new Date().toISOString() : null,
  });
  return { ...created, conversation: await conversationView(created.entryToken) };
};

export const getConversation = conversationView;

export const respondToConversation = async ({
  entryToken,
  clientAttemptId,
  stateRevision,
  anchorId,
  text,
  inputPayload,
  intent = "answer",
}: {
  entryToken: string;
  clientAttemptId: string;
  stateRevision: number;
  anchorId: string;
  text: string;
  inputPayload: { type: string; selectedValues?: string[]; freeText?: string };
  intent?: "answer" | "skip";
}) => {
  const study = getStudyConfig();
  let session = await getSessionByToken(entryToken);
  if (!session) throw new ConversationError(404, "not_found", "Study session not found.");
  if (session.study_id !== study.study.id || session.study_version !== study.study.version) throw new ConversationError(409, "version_mismatch", "This session belongs to another study or version.");
  const existing = (await listTurns(session.id, true)).find((turn) => turn.client_attempt_id === clientAttemptId);
  if (existing) {
    if (existing.raw_text !== text || existing.anchor_id !== anchorId || existing.state_before.revision !== stateRevision || existing.request_intent !== intent || !sameInputPayload(existing.input_payload, inputPayload)) throw new ConversationError(409, "attempt_conflict", "This attempt belongs to a different saved answer.", true);
    if (existing.processing_status === "completed") return conversationView(entryToken);
  }
  if (session.status !== "active") return conversationView(entryToken);
  const anchor = getActiveAnchor(study, session.state);
  if (!anchor || anchor.id !== anchorId) throw new ConversationError(409, "anchor_conflict", "The interview moved to another question.");
  if (intent !== "skip") validateInputPayload(anchor, session.state, inputPayload);
  const canonicalPrompt = anchor.question;
  const localizedPrompt = session.state.activePrompt || anchor.question;
  const reservation = await reserveTurn({
    entryToken,
    clientAttemptId,
    expectedRevision: stateRevision,
    anchorId,
    moveKind: session.state.activeMove?.kind ?? "anchor",
    canonicalPrompt,
    localizedPrompt,
    rawText: text,
    inputPayload,
    intent,
  });
  if (reservation.kind === "not_found") throw new ConversationError(404, "not_found", "Study session not found.");
  if (reservation.kind === "conflict") throw new ConversationError(409, "revision_conflict", "The interview changed in another tab.");
  if (reservation.kind === "in_progress") throw new ConversationError(409, "in_progress", "Your saved answer is still being processed.", true);
  if (reservation.kind === "attempt_conflict") throw new ConversationError(409, "attempt_conflict", "This attempt belongs to a different saved answer.", true);
  if (reservation.kind === "retry_exhausted") throw new ConversationError(429, "retry_exhausted", "This answer is saved. The retry limit has been reached; please stop or skip this question.", true);
  if (reservation.kind === "complete") return conversationView(entryToken);
  if (reservation.kind === "duplicate") return conversationView(entryToken);
  session = reservation.session;
  const priorTurns = (await listTurns(session.id)).map(toConversationTurn).filter((turn): turn is ConversationTurn => Boolean(turn));
  const providerDiagnostics: unknown[] = [];
  try {
    const assessed: ModeratorAssessment = intent === "skip" ? {
      participantIntent: "skip",
      understoodFacts: [],
      topicCoverage: { anchorId, status: "missing", coveredFieldIds: [], evidenceTurnIds: [reservation.turnId], note: "Participant skipped the question." },
      unresolvedPoints: [],
      contradictions: [],
      replyLanguage: session.state.activeLanguage,
      replyLanguageConfidence: "high",
      nextAction: "defer_gap",
      actionReason: "The participant explicitly skipped this question.",
      candidateReply: study.anchors.find((item) => item.id !== anchor.id && !session.state.completedAnchors.includes(item.id))?.question || localized(study.completion.messages, session.state.activeLanguage),
      provider: "system",
      model: "deterministic-skip-v2",
      promptVersion: study.model.promptVersion,
    } : await evaluateTurn({
      study,
      anchor,
      state: session.state,
      turnId: reservation.turnId,
      rawText: text,
      inputPayload,
      transcript: priorTurns,
      onDiagnostic: (diagnostic) => providerDiagnostics.push(diagnostic),
    });
    const direct = intent === "skip" ? [] : structuredUpdates(anchor, session.state, inputPayload, reservation.turnId);
    const assessment = mergeAssessment(assessed, direct);
    const applied = applyAssessment({
      study,
      previous: session.state,
      assessment,
      turnId: reservation.turnId,
      turnIndex: reservation.turnIndex,
      rawText: text,
      recentPrompts: [...priorTurns.map((turn) => turn.localizedPrompt), localizedPrompt],
      structuredFieldIds: direct.map((item) => item.fieldId),
      forceAdvance: intent === "skip",
    });
    await resolvePlannedReply({ study, anchor, state: session.state, turnId: reservation.turnId, rawText: text, inputPayload, transcript: priorTurns,
      onDiagnostic: (diagnostic) => providerDiagnostics.push({ ...diagnostic, phase: "selected_move_wording" }),
    }, applied, assessment, [...priorTurns.map((turn) => turn.localizedPrompt), localizedPrompt]);
    const turn: ConversationTurn = {
      id: reservation.turnId,
      turnIndex: reservation.turnIndex,
      anchorId,
      moveKind: session.state.activeMove?.kind ?? "anchor",
      canonicalPrompt,
      localizedPrompt,
      rawText: text,
      inputPayload,
      replyLanguage: applied.state.activeLanguage,
      participantIntent: assessment.participantIntent,
      topicCoverage: assessment.topicCoverage,
      unresolvedPoints: assessment.unresolvedPoints,
      contradictions: assessment.contradictions,
      extractedFields: applied.acceptedUpdates,
      rejectedFieldUpdates: applied.rejectedUpdates,
      aiSuggestedAction: assessment.nextAction,
      serverAction: applied.serverAction,
      actionReason: applied.actionReason,
      candidateReply: assessment.candidateReply,
      displayedReply: applied.displayedReply,
      provider: assessment.provider,
      model: assessment.model,
      promptVersion: assessment.promptVersion,
      policyVersion: study.moderation.policyVersion,
    };
    await commitTurn({ sessionId: session.id, turnId: reservation.turnId, expectedRevision: stateRevision, state: applied.state, turn, assessment, processingAttempt: reservation.processingAttempt, providerDiagnostics });
    return conversationView(entryToken);
  } catch (error) {
    if (error instanceof StorageAccessError) throw error;
    const code = error instanceof ProviderError ? error.code : "processing_failed";
    await failTurn(reservation.turnId, code, reservation.processingAttempt, providerDiagnostics);
    if (error instanceof ProviderError) {
      const diagnostic = process.env.NODE_ENV === "production" ? undefined : error.message.slice(0, 320);
      throw new ConversationError(503, code, "Your answer was saved, but the AI could not process it. Please try again later.", true, diagnostic);
    }
    if (error instanceof Error && error.message.includes("revision")) throw new ConversationError(409, "revision_conflict", "The interview changed before this answer could be processed.", true);
    throw new ConversationError(500, "processing_failed", "Your answer was saved, but the interview could not continue.", true);
  }
};

export const stopConversation = async (entryToken: string) => {
  const paused = await pauseSession(entryToken);
  if (!paused) throw new ConversationError(404, "not_found", "Active study session not found.");
  return { status: "paused" as const, participationCode: paused.participation_code };
};
