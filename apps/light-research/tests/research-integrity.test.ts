import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState, isAnchorCovered } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { ModeratorAssessment, ModeratorState } from "@/lib/conversation-types";

const study = getStudyConfig();
const first = study.anchors[0];
const assessment = (change: Partial<ModeratorAssessment> = {}): ModeratorAssessment => ({ participantIntent: "answer", understoodFacts: [], topicCoverage: { anchorId: first.id, status: "covered", coveredFieldIds: [], evidenceTurnIds: ["new"], note: "Model claims coverage" }, unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "advance", actionReason: "Move on", candidateReply: study.anchors[1].question, provider: "mock", model: "fixture", promptVersion: study.model.promptVersion, ...change });
const run = (state: ModeratorState, change: Partial<ModeratorAssessment> = {}, rawText = "A synthetic answer") => applyAssessment({ study, previous: state, assessment: assessment(change), rawText, turnId: "new", turnIndex: 1, recentPrompts: [state.activePrompt || ""] });

describe("research evidence integrity", () => {
  it("does not treat candidate-only facts as sufficient to skip a topic", () => {
    const state = createModeratorState(study);
    for (const fieldId of first.requiredFields) state.facts[fieldId] = { factId: fieldId, fieldId, value: "uncertain", rawValue: "maybe", confidence: 0.35, status: "candidate", source: "model", sourceTurnId: "old", evidenceTurnIds: ["old"], updatedAt: new Date().toISOString() };
    expect(isAnchorCovered(study, state, first.id)).toBe(false);
  });
  it("records a missing required fact even if the model calls a topic covered", () => {
    const result = run(createModeratorState(study));
    expect(result.state.pendingGaps.some((gap) => gap.anchorId === first.id)).toBe(true);
  });
  it("does not resolve a specific missing field using unrelated topic coverage", () => {
    const state = createModeratorState(study);
    state.pendingGaps = [{ id: "gap", anchorId: first.id, fieldId: first.requiredFields[0], question: "Which vehicle?", reason: "Missing", priority: "critical", uncertainty: 1, answerability: 1, evidenceTurnIds: ["old"], status: "pending", createdTurnId: "old", createdTurnIndex: 0, attempts: 0, score: 9 }];
    expect(run(state).state.pendingGaps[0].status).not.toBe("resolved");
  });
  it("does not overwrite a confirmed fact with an unconfirmed conflicting guess", () => {
    const state = createModeratorState(study), fieldId = first.requiredFields[0];
    state.facts[fieldId] = { factId: "confirmed", fieldId, value: "Original statement", rawValue: "Original statement", confidence: 0.9, status: "confirmed", source: "model", sourceTurnId: "old", evidenceTurnIds: ["old"], updatedAt: new Date().toISOString() };
    const result = run(state, { understoodFacts: [{ fieldId, value: "Different guess", confidence: "low", correction: false, evidenceTurnIds: ["new"] }] });
    expect(result.state.facts[fieldId].value).toBe("Original statement");
    expect(result.rejectedUpdates).toHaveLength(1);
  });
  it("does not display an unrelated candidate when advancing to a specific next topic", () => {
    const result = run(createModeratorState(study), { candidateReply: "What is your favorite food?" });
    expect(result.displayedReply).toBeNull(); // unrelated topic requires regeneration
  });
});

describe("confirmed fields do not reopen as missing evidence", () => {
  const price = study.anchors.find((anchor) => anchor.id === "price")!;
  const following = study.anchors[study.anchors.indexOf(price) + 1];
  const point = { anchorId: price.id, fieldId: "price_reason", question: "What else explains that choice?", reason: "The model wants a deeper reason", priority: "important" as const, uncertainty: 0.3, answerability: 0.8, evidenceTurnIds: ["new"] };
  const stateAtPrice = () => {
    const state = createModeratorState(study);
    state.activeAnchorId = price.id;
    state.activeMove = { kind: "anchor" as const, anchorId: price.id };
    state.activePrompt = price.question;
    state.completedAnchors = study.anchors.slice(0, study.anchors.indexOf(price)).map((anchor) => anchor.id);
    state.anchorsSinceCheckpoint = study.moderation.checkpointEveryAnchors - 1;
    return state;
  };
  const answered = (reason = "Does not need auxiliary lights"): Partial<ModeratorAssessment> => ({
    understoodFacts: [
      { fieldId: "price_fit", value: "none", confidence: "high", correction: false, evidenceTurnIds: ["new"] },
      { fieldId: "price_reason", value: reason, confidence: "high", correction: false, evidenceTurnIds: ["new"] },
    ],
    topicCoverage: { anchorId: price.id, status: "covered", coveredFieldIds: ["price_fit", "price_reason"], evidenceTurnIds: ["new"], note: "Choice and reason are explicit" },
    unresolvedPoints: [point], nextAction: "probe_now", candidateAnchorId: price.id, candidateFieldId: "price_reason", candidateReply: point.question,
  });
  const existingFact = (value: string) => ({ factId: "old-reason", fieldId: "price_reason", value, rawValue: value, confidence: 0.9, status: "confirmed" as const, source: "model" as const, sourceTurnId: "old", evidenceTurnIds: ["old"], updatedAt: new Date().toISOString() });
  it.each(["Does not need auxiliary lights", "Installation takes too much time", "The existing equipment already meets the requirement"])("does not schedule a redundant checkpoint for a confirmed reason: %s", (reason) => {
    const previous = stateAtPrice();
    previous.pendingGaps = [{ ...point, id: "old-missing", status: "pending", createdTurnId: "old", createdTurnIndex: 0, attempts: 0, score: 8 }];
    const result = run(previous, answered(reason), reason);
    expect(result.state.facts.price_reason.status).toBe("confirmed");
    expect(result.state.facts.price_reason.rawValue).toBe(reason);
    expect(result.state.activeMove).toEqual({ kind: "anchor", anchorId: following.id });
    expect(result.state.checkpointQuestions).toBe(0);
    expect(result.state.pendingGaps.filter((gap) => gap.fieldId === "price_reason")).toHaveLength(1);
    expect(result.state.pendingGaps[0].status).toBe("resolved");
    expect(result.state.riskFlags).toContain("rejected_known_field_gap");
    expect(previous.pendingGaps[0].status).toBe("pending");
  });
  it("also blocks missing-evidence gaps for an earlier confirmed field without re-extraction", () => {
    const previous = stateAtPrice(); previous.facts.price_reason = existingFact("Already explained");
    const a = answered(); a.understoodFacts = a.understoodFacts!.filter((fact) => fact.fieldId !== "price_reason");
    const result = run(previous, a);
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === "price_reason")).toBe(false);
    expect(result.state.activeAnchorId).toBe(following.id);
  });
  it("preserves a source-linked contradiction about a confirmed field for clarification", () => {
    const previous = stateAtPrice(); previous.facts.price_reason = existingFact("No need");
    const result = run(previous, { ...answered("No need"), contradictions: [{ fieldId: "price_reason", description: "Participant now describes an unmet lighting need despite the earlier no-need statement", evidenceTurnIds: ["old", "new"] }] });
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === "price_reason" && gap.status === "asked")).toBe(true);
    expect(result.state.activeMove?.kind).toBe("checkpoint_gap");
    expect(result.state.contradictions).toHaveLength(1);
  });
  it("keeps a conflict detected by the server even if the model omits its contradiction list", () => {
    const previous = stateAtPrice(); previous.facts.price_reason = existingFact("Cost only");
    const result = run(previous, answered("No need"));
    expect(result.rejectedUpdates).toContainEqual({ fieldId: "price_reason", reason: "conflicting value requires an explicit confident correction" });
    expect(result.state.facts.price_reason.value).toBe("Cost only");
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === "price_reason" && gap.status === "asked")).toBe(true);
  });
  it("does not use historical contradiction records to reopen a newly confirmed field", () => {
    const previous = stateAtPrice(); previous.contradictions = [{ fieldId: "price_reason", description: "Old resolved disagreement", evidenceTurnIds: ["old"] }];
    const result = run(previous, answered());
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === "price_reason")).toBe(false);
  });
  it("an explicit confident correction resolves the field instead of reopening the corrected disagreement", () => {
    const previous = stateAtPrice(); previous.facts.price_reason = existingFact("Cost only");
    previous.pendingGaps = [{ ...point, id: "old-conflict", status: "pending", createdTurnId: "old", createdTurnIndex: 0, attempts: 0, score: 8 }];
    const a = answered("No need"); a.understoodFacts![1].correction = true;
    a.contradictions = [{ fieldId: "price_reason", description: "Participant explicitly corrects the earlier reason", evidenceTurnIds: ["old", "new"] }];
    const result = run(previous, a, "I should correct that: I do not need them, regardless of cost");
    expect(result.state.facts.price_reason.value).toBe("No need");
    expect(result.state.pendingGaps[0].status).toBe("resolved");
    expect(result.state.activeAnchorId).toBe(following.id);
  });
  it("retains an uncertain field as a deferred gap instead of treating it as confirmed", () => {
    const a = answered(); a.understoodFacts![1].confidence = "medium"; a.nextAction = "defer_gap";
    const result = run(stateAtPrice(), a, "I am not sure of the reason yet; ask me later");
    expect(result.state.facts.price_reason.status).toBe("candidate");
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === "price_reason" && gap.status === "pending")).toBe(true);
  });
});
