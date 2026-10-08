import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { FieldUpdate, ModeratorAssessment } from "@/lib/conversation-types";

const rawText = "I slowed from about 25 mph to 10 mph and used the factory high beams; the sides still stayed dark.";
const turnId = "turn-action-and-lights";

// Supplied assessments exercise server routing, not actual model extraction.
const applySuppliedAssessment = (includeLights: boolean) => {
  const study = getStudyConfig();
  const state = createModeratorState(study);
  const anchor = study.anchors.find((item) => item.id === "recent_experience")!;
  state.activeAnchorId = anchor.id;
  state.activeMove = { kind: "anchor", anchorId: anchor.id };
  state.activePrompt = anchor.question;
  state.completedAnchors = [study.anchors[0].id];
  const understoodFacts: FieldUpdate[] = [
    { fieldId: "visibility_problem", value: "The sides stayed dark", evidenceMeaning: "reported_problem", confidence: "high", correction: false, evidenceTurnIds: [turnId] },
    { fieldId: "user_action", value: "Slowed from about 25 mph to 10 mph and used the factory high beams", confidence: "high", correction: false, evidenceTurnIds: [turnId] },
  ];
  if (includeLights) understoodFacts.push({ fieldId: "current_lights", value: "Used the factory high beams", confidence: "high", correction: false, evidenceTurnIds: [turnId] });
  const next = study.anchors.find((item) => item.id === (includeLights ? "priorities" : "current_lights"))!;
  const assessment: ModeratorAssessment = {
    participantIntent: "answer", understoodFacts,
    topicCoverage: { anchorId: anchor.id, status: "covered", coveredFieldIds: ["visibility_problem", "user_action"], evidenceTurnIds: [turnId], note: "Outcome and response explicitly stated." },
    unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high",
    nextAction: "advance", actionReason: "The current outcome and response are answered.",
    candidateAnchorId: next.id, candidateFieldId: null, candidateReply: next.question,
    provider: "mock", model: "supplied-assessment-routing-test", promptVersion: study.model.promptVersion,
  };
  return applyAssessment({ study, previous: state, assessment, turnId, turnIndex: 2, rawText, recentPrompts: [anchor.question] });
};

describe("volunteered cross-topic evidence routing", () => {
  it("skips the lights main question when a supplied assessment includes the explicit light fact", () => {
    const result = applySuppliedAssessment(true);
    expect(result.rejectedUpdates).toEqual([]);
    expect(result.state.facts.current_lights).toMatchObject({ value: "Used the factory high beams", status: "confirmed", sourceTurnId: turnId, evidenceTurnIds: [turnId] });
    expect(result.state.completedAnchors).toContain("current_lights");
    expect(result.state.activeAnchorId).toBe("priorities");
    expect(result.state.activeMove?.anchorId).toBe("priorities");
    expect(result.displayedReply).toBe(getStudyConfig().anchors.find((item) => item.id === "priorities")!.question);
    expect(result.state.facts.priorities).toBeUndefined();
  });

  it("does not invent lights from another field when the supplied assessment omits them", () => {
    const result = applySuppliedAssessment(false);
    expect(result.state.facts.current_lights).toBeUndefined();
    expect(result.state.activeAnchorId).toBe("current_lights");
    expect(result.state.completedAnchors).not.toContain("current_lights");
  });
});
