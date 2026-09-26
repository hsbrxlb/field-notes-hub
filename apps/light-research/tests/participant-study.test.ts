import { describe, expect, it } from "vitest";
import { getLegacyStudyConfig, getSessionStudyConfig, getStudyConfig } from "@/lib/study-config";
import { questionPolicyViolation } from "@/lib/question-policy";

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

  it("asks all eight concrete, text-only questions in the three reviewed languages", () => {
    expect(study.anchors.map((anchor) => anchor.id)).toEqual([
      "use_context", "recent_experience", "priorities", "concept", "optics_proof", "constraints", "price", "final_change",
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
    expect(study.study.goal).toMatch(/five real vehicle owners/);
  });
});
