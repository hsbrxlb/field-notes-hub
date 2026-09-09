import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { ActiveMove, ModeratorAssessment, ParticipantIntent } from "@/lib/conversation-types";

const study = getStudyConfig(), anchor = study.anchors[0];
const assessment = (intent: ParticipantIntent): ModeratorAssessment => ({
  participantIntent: intent, understoodFacts: [],
  topicCoverage: { anchorId: anchor.id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "No usable answer." },
  unresolvedPoints: [], contradictions: [], nextAction: "complete", candidateAnchorId: study.anchors[1].id,
  candidateFieldId: null, candidateReply: "Let's move on: how was visibility on your last drive?",
  replyLanguage: "en", replyLanguageConfidence: "high", actionReason: "Legacy budget-based advance suggestion.",
  provider: "mock", model: "gate-regression", promptVersion: study.model.promptVersion,
});
const stateFor = (kind: ActiveMove["kind"]) => {
  const state = createModeratorState(study);
  state.repairCount = study.moderation.maxRepairTurns + 10;
  state.totalProbeCount = study.moderation.maxTotalProbes;
  state.probeCounts[anchor.id] = anchor.maxImmediateProbes;
  state.checkpointQuestions = study.moderation.maxCheckpointQuestions;
  state.finalAuditQuestions = study.moderation.maxFinalAuditQuestions;
  if (kind !== "anchor") {
    state.activeMove = { kind, anchorId: anchor.id, gapId: "open-gap", resumeAnchorId: kind === "checkpoint_gap" ? study.anchors[1].id : null };
    state.pendingGaps.push({ id: "open-gap", anchorId: anchor.id, fieldId: anchor.requiredFields[0], question: "What do you drive?", reason: "Required evidence remains missing.", priority: "critical", uncertainty: 1, answerability: 0.8, evidenceTurnIds: ["old"], status: "asked", createdTurnId: "old", createdTurnIndex: 0, attempts: 2, score: 8 });
  }
  return state;
};
const apply = (state: ReturnType<typeof stateFor>, intent: ParticipantIntent, rawText = "1212", overrides: Partial<ModeratorAssessment> = {}) => applyAssessment({ study, previous: state, assessment: { ...assessment(intent), ...overrides }, turnId: `turn-${state.turnCount + 1}`, turnIndex: state.turnCount + 1, rawText, recentPrompts: [] });

describe.each(["anchor", "checkpoint_gap", "final_audit"] as const)("understanding gate: %s", (kind) => {
  it.each(["gibberish", "off_topic", "prompt_attack", "asks_clarification", "partial_answer", "frustration"] as const)("does not advance %s even after every budget is exhausted", (intent) => {
    let state = stateFor(kind);
    const originalMove = structuredClone(state.activeMove);
    for (let index = 0; index < 5; index++) {
      const result = apply(state, intent);
      expect(result.state.activeMove).toEqual(originalMove);
      expect(result.state.completedAnchors).toEqual([]);
      expect(result.state.completionQuality).toBeNull();
      expect(result.state.totalProbeCount).toBe(study.moderation.maxTotalProbes);
      expect(result.state.facts).toEqual({});
      expect(result.displayedReply).toBeNull(); // new AI wording required, no stock fallback
      if (kind !== "anchor") expect(result.state.pendingGaps[0].status).toBe("asked");
      state = result.state;
    }
    expect(state.turnCount).toBe(5);
  });
  it.each(["skip", "refusal", "stop"] as const)("still honors explicit %s", (intent) => {
    const state = stateFor(kind), result = apply(state, intent, intent);
    if (intent === "stop") expect(result.serverAction).toBe("stop");
    else expect(result.state.activeMove).not.toEqual(state.activeMove);
  });
  it("does not trust claimed coverage or invented facts for meaningless input", () => {
    const state = stateFor(kind), result = apply(state, "gibberish", "123123123", {
      understoodFacts: [{ fieldId: anchor.requiredFields[0], value: "Invented", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: anchor.id, status: "covered", coveredFieldIds: anchor.requiredFields, evidenceTurnIds: ["turn-1"], note: "Incorrect coverage." },
    });
    expect(result.state.activeMove).toEqual(state.activeMove);
    expect(result.acceptedUpdates).toEqual([]);
  });
});

it("understands a short Chinese request for explanation and stays on its question", () => {
  const result = apply(stateFor("anchor"), "asks_clarification", "你说啥");
  expect(result.state.activeLanguage).toBe("zh-CN");
  expect(result.serverAction).toBe("immediate_clarify");
  expect(result.state.activeAnchorId).toBe(anchor.id);
});

it("does not display an abandonment transition disguised as a same-topic repair", () => {
  const result = apply(stateFor("anchor"), "gibberish", "1212", {
    nextAction: "soft_redirect", candidateAnchorId: anchor.id,
    candidateReply: "I couldn't understand those digits. Let's move on: what do you drive after dark?",
  });
  expect(result.displayedReply).toBeNull();
});

it("advances normally when a later answer supplies the required information", () => {
  const state = apply(stateFor("anchor"), "gibberish").state;
  const result = apply(state, "answer", "I drive my truck to work after sunset", {
    understoodFacts: anchor.requiredFields.map((fieldId) => ({ fieldId, value: "Concrete participant evidence", confidence: "high", correction: false, evidenceTurnIds: ["turn-2"] })),
    topicCoverage: { anchorId: anchor.id, status: "covered", coveredFieldIds: anchor.requiredFields, evidenceTurnIds: ["turn-2"], note: "The answer is understood." },
    nextAction: "advance", candidateReply: "How was visibility on your most recent evening drive?",
  });
  expect(result.state.activeAnchorId).not.toBe(anchor.id);
  expect(result.serverAction).toBe("advance");
  expect(result.acceptedUpdates.length).toBe(anchor.requiredFields.length);
});


describe.each(["anchor", "checkpoint_gap", "final_audit"] as const)("partial evidence at exhausted budgets: %s", (kind) => {
  it("does not let a different known field satisfy the current missing target", () => {
    const state = stateFor(kind);
    const [knownField, missingField] = anchor.requiredFields;
    expect(missingField).toBeTruthy();
    state.facts[knownField] = { factId: "known", fieldId: knownField, value: "Truck", rawValue: "Truck", confidence: 0.9, status: "confirmed", source: "model", sourceTurnId: "old", evidenceTurnIds: ["old"], updatedAt: new Date().toISOString() };
    if (kind !== "anchor") state.pendingGaps[0].fieldId = missingField;
    const result = apply(state, "partial_answer", "I said what vehicle, but don't understand what you mean by how I use it", {
      nextAction: "probe_now",
      topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [knownField], evidenceTurnIds: ["old"], note: "The current required target remains missing." },
      unresolvedPoints: [{ anchorId: anchor.id, fieldId: missingField, question: "What do you use it for?", reason: "Missing core answer", priority: "important", uncertainty: 1, answerability: 0.8, evidenceTurnIds: ["turn-1"] }],
    });
    expect(result.serverAction).toBe("immediate_clarify");
    expect(result.state.activeMove).toEqual(state.activeMove);
    expect(result.state.completedAnchors).toEqual([]);
    if (kind !== "anchor") expect(result.state.pendingGaps[0].status).toBe("asked");
  });
});
