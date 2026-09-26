import { describe, expect, it } from "vitest";
import { getLegacyStudyConfig as getStudyConfig } from "@/lib/study-config";
import { questionPolicyViolation } from "@/lib/question-policy";

const study = getStudyConfig();
const languages = ["en", "zh-CN", "es"];
const anchor = (id: string) => study.anchors.find((item) => item.id === id)!;

// These checks protect the authored research instrument. They do not establish
// that a real model's translation or context-specific follow-up is understandable.
describe("question meaning and clarity across the complete instrument", () => {
  it("covers every authored question, repair, follow-up, placeholder and retained option in all reviewed languages", () => {
    expect(study.anchors).toHaveLength(7);
    for (const item of study.anchors) {
      const localized = [item.questionLocales!, item.clarificationLocales!, ...Object.values(item.followUpQuestions ?? {})];
      if (item.input.type === "text" && item.input.placeholder) localized.push(item.input.placeholder);
      if (item.input.type === "single_choice" || item.input.type === "multiple_choice") {
        localized.push(...item.input.options.map((option) => option.labels));
      }
      expect(item.question).toBe(item.questionLocales?.en);
      expect(item.clarification).toBe(item.clarificationLocales?.en);
      for (const copy of localized) {
        for (const language of languages) {
          expect(copy[language]?.trim(), `${item.id}: ${language}`).toBeTruthy();
          expect(questionPolicyViolation(copy[language])).toBeNull();
          expect(copy[language]).not.toMatch(/what kind of (?:setting|environment)|什么样的(?:地方|环境)|tipo de entorno|照明设置|照明结果|configuración de iluminación/iu);
        }
      }
    }
  });

  it("asks about road type explicitly without conflating it with weather, light or trip purpose", () => {
    const recent = anchor("recent_experience");
    const road = recent.followUpQuestions!.recent_location;
    expect(road.en).toMatch(/type of road/i);
    expect(road["zh-CN"]).toMatch(/哪一类道路/);
    expect(road.es).toMatch(/tipo de vía/i);
    for (const text of Object.values(road)) {
      expect(text).not.toMatch(/weather|lighting|weather|天气|光线|用途|clima|iluminación/i);
      expect((text.match(/[?？]/g) ?? [])).toHaveLength(1);
    }
    // Guard the semantic boundary where short 'on the road' replies used to
    // trigger an opaque request for a setting and arbitrary extra detail.
    const field = study.fields.find((item) => item.id === "recent_location")!;
    expect(field.description).toMatch(/stationary/i);
    expect(field.description).toMatch(/do not infer/i);
    expect(recent.objective).toMatch(/one missing dimension/i);
    expect(recent.objective).toMatch(/never.*require all dimensions/i);
  });

  it("keeps absence of a problem and uncertainty valid without fabricating mandatory facts", () => {
    for (const id of ["use_context", "recent_experience", "priorities", "constraints", "concept", "final_change"]) {
      expect(anchor(id).sufficiencyCriteria.join(" ")).toMatch(/uncertainty|unsure|unable to recall/i);
    }
    expect(anchor("use_context").objective).toMatch(/do not require a model year, brand, or model/i);
    expect(anchor("recent_experience").sufficiencyCriteria.join(" ")).toMatch(/no visibility problem/i);
    expect(anchor("final_change").sufficiencyCriteria.join(" ")).toMatch(/no desired change/i);
    expect(anchor("final_change").objective).not.toMatch(/force a final priority/i);
  });

  it("identifies the object being evaluated in each language rather than asking an ungrounded change question", () => {
    const changes = anchor("final_change");
    for (const copy of [changes.questionLocales!, changes.clarificationLocales!, changes.followUpQuestions!.final_change]) {
      expect(copy.en).toMatch(/extra vehicle light/i);
      expect(copy["zh-CN"]).toMatch(/加装车灯/);
      expect(copy.es).toMatch(/luz adicional/i);
    }
    expect(anchor("concept").objective).toMatch(/do not.*invent features/i);
    expect(anchor("concept").media).toEqual([]);
  });

  it("makes the price question self-contained for text-only answers and preserves the declared measurement outcomes", () => {
    const price = anchor("price");
    if (price.input.type !== "single_choice") throw new Error("Keep stable price outcome metadata for existing sessions");
    expect(price.input.options.map((option) => option.id)).toEqual(["small_129", "medium_279", "large_499", "none", "not_sure"]);
    for (const language of languages) {
      const main = price.questionLocales![language];
      const follow = price.followUpQuestions!.price_fit[language];
      for (const option of price.input.options.slice(0, 3)) {
        const amounts = option.labels[language].match(/\d+(?:\.\d+)?/g)!;
        for (const amount of amounts) {
          expect(main).toContain(amount);
          expect(follow).toContain(amount);
        }
      }
    }
    expect(price.sufficiencyCriteria.join(" ")).toMatch(/missing, skipped, refused, or unrelated answer is not none or not_sure/i);
    expect(price.claimRefs.length).toBeGreaterThan(0);
    for (const claimId of price.claimRefs) {
      expect(study.claims.find((claim) => claim.id === claimId)?.status).toBe("approved_for_participants");
    }
  });

  it("keeps follow-ups within declared evidence ownership and preserves automatic reply-language and original evidence", () => {
    for (const item of study.anchors) {
      for (const field of Object.keys(item.followUpQuestions ?? {})) {
        expect(item.evidenceFields ?? item.requiredFields).toContain(field);
      }
    }
    expect(study.study.languagePolicy).toMatchObject({ entryLanguage: "en", autoReplyLanguage: true, preserveOriginal: true });
  });
});
