import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { getStudyConfig } from "@/lib/study-config";
import { studyManifestSchema } from "@/lib/study-schema";
import { evaluateTurn } from "@/lib/moderator-provider";
import { applyAssessment, createModeratorState } from "@/lib/moderator-state";
import purchase from "./fixtures/purchase-round3.study.json";

const records: unknown[] = [];
const worklight = getStudyConfig(), checkout = studyManifestSchema.parse(purchase);
describe.skipIf(process.env.SURVEY_REAL_PROBE !== "1")("bounded real provider negative-answer samples", () => {
  afterAll(() => writeFileSync(new URL("../../real-provider-samples.json", import.meta.url), JSON.stringify({ sampleKind: "synthetic", scope: "four isolated turns; not full interviews or real-user validation", records }, null, 2)));
  it.each([
    { study: worklight, anchorId: "recent_experience", rawText: "I was on a rural road. My existing headlights worked fine. Nothing was difficult to see and I do not need extra lights.", language: "en", field: "visibility_problem" },
    { study: worklight, anchorId: "recent_experience", rawText: "当时在乡间路上，原车灯就能看清楚，没有看不清的地方，也不需要加装灯。", language: "zh-CN", field: "visibility_problem" },
    { study: checkout, anchorId: "return", rawText: "I do not need the product. I would not reconsider buying it even if the price changed. There is no change I want.", language: "en", field: "return_condition" },
    { study: checkout, anchorId: "return", rawText: "No necesito el producto. No quiero volver a comprarlo ni cambiar nada, aunque baje el precio.", language: "es", field: "return_condition" },
  ])("$study.study.id $language", async ({ study, anchorId, rawText, language, field }) => {
    const anchor = study.anchors.find(item => item.id === anchorId)!;
    const state = createModeratorState(study);
    state.activeAnchorId = anchor.id; state.activeMove = { kind: "anchor", anchorId: anchor.id }; state.activePrompt = anchor.question; state.activeLanguage = language;
    const turnId = `synthetic-${anchorId}-${language}`;
    const assessment = await evaluateTurn({ study, anchor, state, turnId, rawText, inputPayload: { type: "text", freeText: rawText }, transcript: [] });
    const applied = applyAssessment({ study, previous: state, assessment, turnId, turnIndex: 1, rawText, recentPrompts: [state.activePrompt] });
    records.push({ studyId: study.study.id, studyVersion: study.study.version, anchorId, rawText, assessment, displayedReply: applied.displayedReply, serverAction: applied.serverAction, facts: applied.state.facts, riskFlags: applied.state.riskFlags });
    expect(assessment.provider).toBe("deepseek");
    expect(assessment.participantIntent).toBe("answer");
    expect(assessment.understoodFacts.some(item => item.fieldId === field)).toBe(true);
    expect(applied.serverAction).not.toBe("probe_now");
    expect(applied.state.activeLanguage).toBe(language);
  }, 120000);
});
