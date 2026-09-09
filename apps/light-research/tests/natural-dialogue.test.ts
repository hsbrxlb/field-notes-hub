import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { getStudyConfig } from "@/lib/study-config";
import { applyAssessment, createModeratorState, semanticSimilarity } from "@/lib/moderator-state";
import { resolvePlannedReply } from "@/lib/moderator-dialogue";
import { evaluateTurn, type ProviderTurnInput } from "@/lib/moderator-provider";
import { questionPolicyViolation } from "@/lib/question-policy";
import type { ConversationTurn, ModeratorAssessment } from "@/lib/conversation-types";

const study = getStudyConfig();
const first = study.anchors[0], next = study.anchors[1];
const base = (overrides: Partial<ModeratorAssessment> = {}): ModeratorAssessment => ({
  candidateAnchorId: first.id, candidateFieldId: null, participantIntent: "gibberish", understoodFacts: [],
  topicCoverage: { anchorId: first.id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "No usable answer." },
  unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "soft_redirect",
  actionReason: "The participant input does not answer this topic.", candidateReply: "I couldn't understand those digits. Which vehicle do you usually drive?",
  provider: "mock", model: "test", promptVersion: study.model.promptVersion, ...overrides,
});
const input = (): ProviderTurnInput => ({ study, anchor: first, state: createModeratorState(study), turnId: "synthetic-1", rawText: "123123123", inputPayload: { type: "text" }, transcript: [] });
const plan = (i: ProviderTurnInput, assessment: ModeratorAssessment) => applyAssessment({ study, previous: i.state, assessment, turnId: i.turnId, turnIndex: 1, rawText: i.rawText, recentPrompts: [i.state.activePrompt!] });

it("keeps canonical English entry and accepts natural contextual repair without a wording whitelist", async () => {
  const i = input(), a = base(), applied = plan(i, a);
  expect(i.state.activePrompt).toBe(first.question);
  expect(applied.displayedReply).toBe(a.candidateReply);
  expect(applied.acceptedUpdates).toEqual([]);
  const generate = vi.fn();
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
  expect(generate).not.toHaveBeenCalled();
});

it("uses the selected current topic for one wording pass and ignores second-pass evidence", async () => {
  const i = input(); i.state.repairCount = study.moderation.maxRepairTurns;
  const a = base({ nextAction: "defer_gap", candidateAnchorId: next.id }), applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.state.activeAnchorId).toBe(first.id);
  expect(applied.displayedReply).toBeNull();
  const wording = base({ nextAction: "soft_redirect", candidateAnchorId: first.id, candidateReply: "Those digits do not tell me about your driving. What do you use the vehicle for after sunset?", understoodFacts: [{ fieldId: first.requiredFields[0], value: "FORGED", confidence: "high", correction: false, evidenceTurnIds: [i.turnId] }] });
  const generate = vi.fn().mockResolvedValue(wording), factsBefore = structuredClone(applied.state.facts);
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].selectedMove).toMatchObject({ action: "soft_redirect", anchorId: first.id, fieldId: null, language: "en" });
  expect(applied.displayedReply).toBe(wording.candidateReply);
  expect(applied.state.facts).toEqual(factsBefore);
  expect(applied.state.revision).toBe(1);
  expect(a.replyGeneration?.candidateReply).toBe(wording.candidateReply);
  expect(a.candidateReply).not.toBe(wording.candidateReply);
});

it.each([
  { candidateReply: "What is your phone number?", candidateAnchorId: first.id },
  { candidateReply: "Which car do you drive? Where do you use it?", candidateAnchorId: first.id },
  { candidateReply: "What was your visibility like?", candidateAnchorId: next.id },
  { candidateReply: "What do you use it for, like driving to work or running errands?", candidateAnchorId: first.id },
])("fails explicitly after one invalid regeneration without fixed substitution: $candidateReply", async (bad) => {
  const i = input(), a = base({ candidateReply: "What is your phone number?" }), applied = plan(i, a);
  const generate = vi.fn().mockResolvedValue(base(bad));
  await expect(resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(applied.displayedReply).toBeNull();
  expect(i.state.revision).toBe(0);
});

it("rejects a model proposal to defer a repeated non-answer without consuming research probes", () => {
  const i = input(); i.state.repairCount = 1;
  const a = base({ nextAction: "defer_gap", candidateAnchorId: next.id, candidateReply: "I still couldn't follow that. How was visibility on your most recent nighttime drive?" });
  const applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.displayedReply).toBeNull();
  expect(applied.state.totalProbeCount).toBe(0);
  expect(applied.state.completedAnchors).not.toContain(first.id);
});

it("keeps consecutive gibberish on the current topic even when the model proposes a research probe", () => {
  const i = input(); i.state.lastParticipantIntent = "gibberish"; i.state.repairCount = 1;
  const a = base({ nextAction: "probe_now" }), applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.state.activeAnchorId).toBe(first.id);
  expect(applied.displayedReply).toBeNull();
  expect(applied.state.totalProbeCount).toBe(0);
});

it("keeps a medium-confidence entity unresolved when its field is still ambiguous", () => {
  const i = input(); i.rawText = "Tesla Y, ask me later to confirm the model";
  const fieldId = first.requiredFields[0];
  const a = base({ participantIntent: "partial_answer", nextAction: "defer_gap", understoodFacts: [{ fieldId, value: "Tesla Y", confidence: "medium", correction: false, evidenceTurnIds: [i.turnId] }], unresolvedPoints: [{ anchorId: first.id, fieldId, question: "Which vehicle model did you mean?", reason: "Model remains ambiguous", priority: "important", uncertainty: 0.7, answerability: 0.3, evidenceTurnIds: [i.turnId] }] });
  const applied = plan(i, a);
  expect(applied.state.facts[fieldId].status).toBe("candidate");
  expect(applied.state.facts[fieldId].rawValue).toBe(i.rawText);
});

it("regenerates a short Chinese clarification with one question and no suggested answers", async () => {
  const i = input(); i.rawText = "你说啥";
  const a = base({ participantIntent: "asks_clarification", nextAction: "soft_redirect", replyLanguage: "zh-CN", candidateReply: "我是想问，你天黑以后开车出去，通常是去做什么？比如上班、买东西，还是办别的事？" });
  const applied = plan(i, a);
  expect(applied.displayedReply).toBeNull();
  const wording = base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", replyLanguage: "zh-CN", candidateReply: "我想了解的是夜间用车的目的。天黑以后，你通常开车去做什么？" });
  const generate = vi.fn().mockResolvedValue(wording);
  await resolvePlannedReply(i, applied, a, [], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].selectedMove).toMatchObject({ action: "immediate_clarify", language: "zh-CN", anchorId: first.id });
  expect(generate.mock.calls[0][0].selectedMove.wordingFeedback).toContain("no example answers");
  expect(applied.displayedReply).toBe(wording.candidateReply);
  expect(applied.state.activeAnchorId).toBe(first.id);
});

it.each([
  ["gibberish", "soft_redirect"],
  ["asks_clarification", "immediate_clarify"],
  ["frustration", "repair_conversation"],
] as const)("accepts naturally different same-objective wording for %s", async (participantIntent, nextAction) => {
  const i = input();
  i.state.activePrompt = "I couldn't understand your last message because it was just numbers. Could you tell me in your own words what you usually do with your vehicle after dark?";
  const candidateReply = "I couldn't understand those numbers in your last message. Could you tell me in your own words what you usually do with your vehicle after dark?";
  expect(semanticSimilarity(i.state.activePrompt, candidateReply)).toBeGreaterThanOrEqual(0.82);
  expect(semanticSimilarity(i.state.activePrompt, candidateReply)).toBeLessThan(0.97);
  const a = base({ participantIntent, nextAction, candidateReply });
  const applied = plan(i, a);
  expect(applied.displayedReply).toBe(candidateReply);
  expect(applied.state.activeAnchorId).toBe(first.id);
  const generate = vi.fn();
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt], generate);
  expect(generate).not.toHaveBeenCalled();
});

it.each(["exact", "punctuation"])("rejects %s copies during repair and keeps regeneration bounded", async (variant) => {
  const i = input(); i.state.activePrompt = base().candidateReply;
  const candidateReply = variant === "exact" ? i.state.activePrompt : i.state.activePrompt.replace("?", " ?").toUpperCase();
  const a = base({ candidateReply }), applied = plan(i, a);
  expect(applied.displayedReply).toBeNull();
  const generate = vi.fn().mockResolvedValue(a);
  await expect(resolvePlannedReply(i, applied, a, [i.state.activePrompt], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(applied.displayedReply).toBeNull();
});

const records: unknown[] = [];
describe.skipIf(process.env.SURVEY_REAL_NATURAL !== "1")("real sequential natural dialogue", () => {
  afterAll(() => { mkdirSync("output", { recursive: true }); writeFileSync("output/natural-dialogue-real.json", JSON.stringify({ scope: "One synthetic sequential provider/state/wording run; no HTTP or database acceptance", studyVersion: study.study.version, policyVersion: study.moderation.policyVersion, promptVersion: study.model.promptVersion, records }, null, 2)); });
  it("understands gibberish, repeated non-answer, then substantive Chinese normally", async () => {
    let state = createModeratorState(study);
    const transcript: ConversationTurn[] = [];
    for (const [index, rawText] of ["123123123", "1212", "你说啥", "上次晚上在乡间道路开车，原车灯能看清楚，没有看不清的地方，也不需要额外装灯。"].entries()) {
      const previous = structuredClone(state), anchor = study.anchors.find((item) => item.id === state.activeAnchorId)!;
      const turnId = `synthetic-natural-${index + 1}`;
      const i: ProviderTurnInput = { study, anchor, state, turnId, rawText, inputPayload: { type: "text", freeText: rawText }, transcript };
      const a = await evaluateTurn(i);
      const recentPrompts = [...transcript.map((turn) => turn.localizedPrompt), state.activePrompt!];
      const applied = applyAssessment({ study, previous: state, assessment: a, turnId, turnIndex: index + 1, rawText, recentPrompts });
      try {
        await resolvePlannedReply(i, applied, a, recentPrompts, async (selected) => {
          const wording = await evaluateTurn(selected);
          records.push({ phase: "wording", selectedMove: selected.selectedMove, wording });
          return wording;
        });
      } catch (error) {
        records.push({ phase: "failed", rawText, assessment: a, serverAction: applied.serverAction, nextAnchorId: applied.state.activeAnchorId });
        throw error;
      }
      records.push({ rawText, anchorId: anchor.id, assessment: a, serverAction: applied.serverAction, displayedReply: applied.displayedReply, nextAnchorId: applied.state.activeAnchorId, facts: applied.state.facts, riskFlags: applied.state.riskFlags });
      expect(a.provider).toBe("deepseek");
      expect(applied.displayedReply).toBeTruthy();
      expect(questionPolicyViolation(applied.displayedReply!)).toBeNull();
      expect(applied.displayedReply!.match(/[?？؟]/g)).toHaveLength(1);
      if (index < 2) { expect(a.participantIntent).toBe("gibberish"); expect(applied.acceptedUpdates).toHaveLength(0); }
      if (index === 1) { expect(applied.state.activeAnchorId).toBe(first.id); expect(applied.serverAction).toBe("soft_redirect"); }
      if (index === 2) { expect(a.participantIntent).toBe("asks_clarification"); expect(applied.state.activeAnchorId).toBe(first.id); expect(applied.state.activeLanguage).toBe("zh-CN"); }
      if (index === 3) { expect(a.participantIntent).toBe("answer"); expect(applied.state.activeLanguage).toBe("zh-CN"); expect(applied.displayedReply).toMatch(/\p{Script=Han}/u); }
      transcript.push({ id: turnId, turnIndex: index + 1, anchorId: anchor.id, moveKind: previous.activeMove!.kind, canonicalPrompt: anchor.question, localizedPrompt: previous.activePrompt!, rawText, inputPayload: i.inputPayload, replyLanguage: applied.state.activeLanguage, participantIntent: a.participantIntent, topicCoverage: a.topicCoverage, unresolvedPoints: a.unresolvedPoints, contradictions: a.contradictions, extractedFields: applied.acceptedUpdates, rejectedFieldUpdates: applied.rejectedUpdates, aiSuggestedAction: a.nextAction, serverAction: applied.serverAction, actionReason: applied.actionReason, candidateReply: a.candidateReply, displayedReply: applied.displayedReply, provider: a.provider, model: a.model, promptVersion: a.promptVersion, policyVersion: study.moderation.policyVersion });
      state = applied.state;
    }
  }, 180000);
});
