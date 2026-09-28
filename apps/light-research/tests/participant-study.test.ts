import { describe, expect, it } from "vitest";
import { getLegacyStudyConfig, getSessionStudyConfig, getStudyConfig } from "@/lib/study-config";
import { questionPolicyViolation } from "@/lib/question-policy";
import { applyAssessment, createModeratorState } from "@/lib/moderator-state";
import previousPilot from "@/tests/fixtures/pilot-1.0-dual-beam.json";

describe("five-owner dual-beam pilot", () => {
  const study = getStudyConfig();
  it("keeps participant records separate from the synthetic fixture", () => {
    const legacy = getLegacyStudyConfig();
    expect(study.study.sampleKind).toBe("participant");
    expect(study.consent.enabledByDefault).toBe(true);
    expect(legacy.study.sampleKind).toBe("synthetic");
    expect(getSessionStudyConfig(legacy, legacy.study.version).study.version).toBe(legacy.study.version);
    expect(getSessionStudyConfig(study, study.study.version).study.version).toBe(study.study.version);
  });

  it("continues a saved previous-pilot snapshot with its original eight topics", () => {
    const restored = getSessionStudyConfig(previousPilot, "pilot-1.0-dual-beam");
    expect(restored.anchors).toHaveLength(8);
    expect(restored.anchors.find((anchor) => anchor.id === "concept")?.maxImmediateProbes).toBe(0);
    expect(restored.anchors.some((anchor) => anchor.id === "current_lights")).toBe(false);
    expect(restored.anchors[1].question).toBe("During that same trip or task, was anything hard to see? If so, what?");
    const state = createModeratorState(restored);
    state.activeAnchorId = "recent_experience";
    state.activeMove = { kind: "anchor", anchorId: "recent_experience" };
    state.activePrompt = restored.anchors[1].question;
    const continued = applyAssessment({ study: restored, previous: state, turnId: "turn-1", turnIndex: 1,
      rawText: "The bend was hard to see", recentPrompts: [], assessment: {
        participantIntent: "answer",
        understoodFacts: [{ fieldId: "visibility_problem", value: "The bend was hard to see", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
        topicCoverage: { anchorId: "recent_experience", status: "covered", coveredFieldIds: ["visibility_problem"], evidenceTurnIds: ["turn-1"], note: "The visibility problem is understood." },
        unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "advance", actionReason: "Previous study advance.",
        candidateAnchorId: "priorities", candidateFieldId: null, candidateReply: restored.anchors[2].question,
        provider: "mock", model: "test", promptVersion: restored.model.promptVersion,
      } });
    expect(continued.serverAction).toBe("advance");
    expect(continued.state.activeAnchorId).toBe("priorities");
  });

  it("asks all nine concrete, text-only questions in the three reviewed languages", () => {
    expect(study.anchors.map((anchor) => anchor.id)).toEqual([
      "use_context", "recent_experience", "current_lights", "priorities", "concept", "optics_proof", "constraints", "price", "final_change",
    ]);
    for (const anchor of study.anchors) {
      expect(anchor.media).toEqual([]);
      expect(anchor.input.type).toBe("text");
      for (const language of ["en", "zh-CN", "es"]) {
        const question = anchor.questionLocales?.[language];
        const clarification = anchor.clarificationLocales?.[language];
        expect(question?.length).toBeGreaterThan(15);
        expect(clarification?.length).toBeGreaterThan(15);
        expect(questionPolicyViolation(question!)).toBeNull();
        expect(questionPolicyViolation(clarification!)).toBeNull();
      }
    }
    expect(study.anchors.find((anchor) => anchor.id === "concept")?.question).toMatch(/wide beam.*farther ahead/);
    expect(study.anchors.find((anchor) => anchor.id === "optics_proof")?.question).toMatch(/lenses.*night test/);
    expect(study.anchors.find((anchor) => anchor.id === "price")?.question).toMatch(/No size or price has been set/);
    expect(study.anchors.find((anchor) => anchor.id === "concept")?.maxImmediateProbes).toBe(1);
    expect(study.anchors.find((anchor) => anchor.id === "price")?.allowRefusal).toBe(true);
    expect(study.study.goal).toMatch(/five real vehicle owners/);
  });
});
