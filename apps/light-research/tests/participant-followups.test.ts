import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { ModeratorAssessment } from "@/lib/conversation-types";

const study = getStudyConfig();

const at = (anchorId: string) => {
  const state = createModeratorState(study);
  const anchor = study.anchors.find((item) => item.id === anchorId)!;
  state.activeAnchorId = anchor.id;
  state.activeMove = { kind: "anchor", anchorId: anchor.id };
  state.activePrompt = anchor.question;
  return state;
};

const assess = (anchorId: string, overrides: Partial<ModeratorAssessment> = {}): ModeratorAssessment => ({
  participantIntent: "answer",
  understoodFacts: [],
  topicCoverage: { anchorId, status: "covered", coveredFieldIds: [], evidenceTurnIds: ["turn-1"], note: "The answer is understood." },
  unresolvedPoints: [],
  contradictions: [],
  replyLanguage: "en",
  replyLanguageConfidence: "high",
  nextAction: "advance",
  actionReason: "The current answer is understood.",
  candidateAnchorId: null,
  candidateFieldId: null,
  candidateReply: "What lights were you using during that trip?",
  provider: "mock",
  model: "test",
  promptVersion: study.model.promptVersion,
  ...overrides,
});

const apply = (anchorId: string, assessment: ModeratorAssessment, previous = at(anchorId), rawText = "My answer") =>
  applyAssessment({ study, previous, assessment, turnId: "turn-1", turnIndex: 1, rawText, recentPrompts: [previous.activePrompt ?? ""] });

describe("active participant study decisions", () => {
  it.each(["I don't need it", "No lo necesito", "我用不上"])("accepts no need expressed as %s", (rawText) => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "beam_use", value: rawText, evidenceMeaning: "no_need", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      unresolvedPoints: [{ anchorId: "concept", fieldId: "switch_use", question: "When would you switch settings?", reason: "Switch use is missing.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now", candidateAnchorId: "concept", candidateFieldId: "switch_use",
    }), at("concept"), rawText);
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe("optics_proof");
    expect(result.state.pendingGaps).toEqual([]);
    expect(result.state.facts.beam_use.rawValue).toBe(rawText);
  });

  it.each(["没有困难", "No me costó ver nada", "Everything was easy to see"])("does not invent a difficulty from %s", (rawText) => {
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", value: rawText, evidenceMeaning: "no_problem", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      unresolvedPoints: [{ anchorId: "recent_experience", fieldId: "user_action", question: "What did you do about it?", reason: "An action was not stated.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now", candidateAnchorId: "recent_experience", candidateFieldId: "user_action",
    }), at("recent_experience"), rawText);
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe("current_lights");
    expect(result.state.pendingGaps).toEqual([]);
  });

  it("retains a concrete visibility problem when only its cause is uncertain", () => {
    const rawText = "Not sure what it was, but something blocked my view";
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", value: rawText, evidenceMeaning: "reported_problem", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
    }), at("recent_experience"), rawText);
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.activeMove?.fieldId).toBe("user_action");
  });

  it("does not classify an older untagged fact by matching its wording", () => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "beam_use", value: "我用不上", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
    }));
    expect(result.serverAction).toBe("advance");
    expect(result.state.facts.beam_use.evidenceMeaning).toBeUndefined();
  });

  it("accepts a rejection recorded as concept reaction without manufacturing a use case or a later gap", () => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "concept_reaction", value: "No lo necesito", evidenceMeaning: "no_need", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      unresolvedPoints: [{ anchorId: "concept", fieldId: "switch_use", question: "When would you switch?", reason: "The model overlooked the rejection.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now",
    }), at("concept"), "No lo necesito");
    expect(result.serverAction).toBe("advance");
    expect(result.state.pendingGaps).toEqual([]);
    expect(result.state.facts.beam_use).toBeUndefined();
  });

  it.each(["no_need", "one_mode_only"] as const)("drops an existing switch gap after %s instead of scheduling it at a checkpoint", (evidenceMeaning) => {
    const previous = at("concept");
    previous.anchorsSinceCheckpoint = 2;
    previous.pendingGaps.push({ id: "switch-gap", anchorId: "concept", fieldId: "switch_use", question: "When would you switch?", reason: "The earlier answer was vague.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["old-turn"], status: "pending", createdTurnId: "old-turn", createdTurnIndex: 0, attempts: 0, score: 8 });
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: evidenceMeaning === "no_need" ? "concept_reaction" : "beam_use", value: evidenceMeaning === "no_need" ? "I don't need it" : "I'd only use the far setting on rural roads", evidenceMeaning, confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
    }), previous);
    expect(result.state.pendingGaps.find((gap) => gap.id === "switch-gap")?.status).toBe("dropped");
    expect(result.state.activeMove?.kind).toBe("anchor");
    expect(result.state.activeAnchorId).toBe("optics_proof");
  });

  it("rejects a classification attached to the wrong evidence field", () => {
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", value: "Nothing was hard to see", evidenceMeaning: "possible_use", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
    }));
    expect(result.state.facts.visibility_problem).toBeUndefined();
    expect(result.rejectedUpdates[0].reason).toMatch(/does not belong/);
  });

  it("asks what the owner did after a concrete visibility problem, within one probe", () => {
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", evidenceMeaning: "reported_problem", value: "Could not see a bend", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "recent_experience", status: "covered", coveredFieldIds: ["visibility_problem"], evidenceTurnIds: ["turn-1"], note: "A real problem was described." },
      unresolvedPoints: [{ anchorId: "recent_experience", fieldId: "user_action", question: "What did you do when you could not see the bend?", reason: "The response to the problem is unknown.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now",
      candidateAnchorId: "recent_experience",
      candidateFieldId: "user_action",
      candidateReply: "What did you do when you could not see the bend?",
    }));
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.activeAnchorId).toBe("recent_experience");
    expect(result.state.activeMove?.fieldId).toBe("user_action");
    expect(result.state.probeCounts.recent_experience).toBe(1);
    expect(result.state.facts.user_action).toBeUndefined();
  });

  it("enforces the action probe when the model prematurely recommends advancing", () => {
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", evidenceMeaning: "reported_problem", value: "Could not see the unlit bend", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "recent_experience", status: "covered", coveredFieldIds: ["visibility_problem"], evidenceTurnIds: ["turn-1"], note: "The problem is known." },
      candidateAnchorId: "current_lights",
      candidateReply: study.anchors.find((anchor) => anchor.id === "current_lights")!.question,
    }));
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.activeMove?.fieldId).toBe("user_action");
    expect(result.displayedReply).toBeNull(); // the service requests a new focused wording pass
  });

  it("does not invent a response when visibility was fine", () => {
    const result = apply("recent_experience", assess("recent_experience", {
      understoodFacts: [{ fieldId: "visibility_problem", evidenceMeaning: "no_problem", value: "Nothing was hard to see", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "recent_experience", status: "covered", coveredFieldIds: ["visibility_problem"], evidenceTurnIds: ["turn-1"], note: "No visibility problem." },
      candidateAnchorId: "current_lights",
      candidateReply: "During that trip, which vehicle lights were you using?",
    }));
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe("current_lights");
    expect(result.state.pendingGaps).toEqual([]);
  });

  it("allows one focused switch-use probe after an interested but vague concept answer", () => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "beam_use", evidenceMeaning: "possible_use", value: "Off-road driving", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "concept", status: "covered", coveredFieldIds: ["beam_use"], evidenceTurnIds: ["turn-1"], note: "Owner named a possible use but not whether switching helps." },
      unresolvedPoints: [{ anchorId: "concept", fieldId: "switch_use", question: "When would you switch between those settings, if at all?", reason: "The value of switching is unknown.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now",
      candidateAnchorId: "concept",
      candidateFieldId: "switch_use",
      candidateReply: "When would you switch between those settings, if at all?",
    }));
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.activeMove?.fieldId).toBe("switch_use");
    expect(result.state.probeCounts.concept).toBe(1);
  });

  it("enforces the switch probe when a vague interested answer is advanced by the model", () => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "beam_use", evidenceMeaning: "possible_use", value: "Off-road driving", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "concept", status: "covered", coveredFieldIds: ["beam_use"], evidenceTurnIds: ["turn-1"], note: "Owner may use the concept off road." },
      candidateAnchorId: "optics_proof",
      candidateReply: study.anchors.find((anchor) => anchor.id === "optics_proof")!.question,
    }));
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.activeMove?.fieldId).toBe("switch_use");
    expect(result.displayedReply).toBeNull();
  });

  it("does not force a switch probe after an explicit rejection", () => {
    const result = apply("concept", assess("concept", {
      understoodFacts: [{ fieldId: "beam_use", evidenceMeaning: "no_need", value: "I would not use this light", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "concept", status: "covered", coveredFieldIds: ["beam_use"], evidenceTurnIds: ["turn-1"], note: "No need for the concept." },
      candidateAnchorId: "optics_proof",
      candidateReply: study.anchors.find((anchor) => anchor.id === "optics_proof")!.question,
    }));
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe("optics_proof");
  });

  it.each(["refusal", "skip"] as const)("lets the owner %s the optional price topic without creating a price", (intent) => {
    const previous = at("price");
    previous.pendingGaps.push({ id: "price-gap", anchorId: "price", fieldId: "price_fit", question: "What total cost would you consider?", reason: "Cost was not stated.", priority: "nice_to_have", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old-turn"], status: "pending", createdTurnId: "old-turn", createdTurnIndex: 0, attempts: 0, score: 1 });
    const result = apply("price", assess("price", {
      participantIntent: intent,
      topicCoverage: { anchorId: "price", status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Owner declined." },
      candidateAnchorId: "final_change",
      candidateReply: study.anchors.find((anchor) => anchor.id === "final_change")!.question,
    }), previous, intent === "skip" ? "skip" : "I prefer not to answer");
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe("final_change");
    expect(result.state.facts.price_fit).toBeUndefined();
    expect(result.state.pendingGaps.find((gap) => gap.id === "price-gap")?.status).toBe("dropped");
  });

  it("does not revisit price when a later model turn claims that declined topic has a critical gap", () => {
    const declined = apply("price", assess("price", {
      participantIntent: "refusal",
      topicCoverage: { anchorId: "price", status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Owner declined." },
      candidateAnchorId: "final_change",
      candidateReply: study.anchors.find((anchor) => anchor.id === "final_change")!.question,
    }), at("price"), "I'd rather not answer").state;
    expect(declined.declinedAnchors).toContain("price");
    const result = apply("final_change", assess("final_change", {
      understoodFacts: [{ fieldId: "final_change", value: "Make the switch easier to reach", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: "final_change", status: "covered", coveredFieldIds: ["final_change"], evidenceTurnIds: ["turn-1"], note: "The desired change is understood." },
      unresolvedPoints: [{ anchorId: "price", fieldId: "price_fit", question: "What price would you pay?", reason: "Model tried to reopen declined cost.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "complete",
      candidateAnchorId: null,
      candidateReply: "Thank you for taking part.",
    }), declined, "Make the switch easier to reach");
    expect(result.state.pendingGaps.filter((gap) => gap.anchorId === "price" && gap.status === "pending")).toEqual([]);
    expect(result.serverAction).toBe("complete");
  });

  it("keeps a refusal on a required topic open", () => {
    const result = apply("current_lights", assess("current_lights", {
      participantIntent: "refusal",
      topicCoverage: { anchorId: "current_lights", status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Owner declined." },
      nextAction: "repair_conversation",
      candidateAnchorId: "current_lights",
      candidateReply: "Which lights were you using on that trip?",
    }), at("current_lights"), "I prefer not to answer");
    expect(result.serverAction).toBe("repair_conversation");
    expect(result.state.activeAnchorId).toBe("current_lights");
  });
});
