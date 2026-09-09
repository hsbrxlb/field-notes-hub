import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getStudyConfig } from "@/lib/study-config";
import { applyAssessment, createModeratorState, isAnchorCovered } from "@/lib/moderator-state";
import { respondToConversation, validateInputPayload } from "@/lib/conversation-service";
import { createSession, exportSession, getPool } from "@/lib/storage";
import type { FactRecord, ModeratorAssessment } from "@/lib/conversation-types";

const provider = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock("@/lib/moderator-provider", async (original) => ({ ...await original<object>(), evaluateTurn: provider.evaluate }));
const receipt = process.env.SURVEY_TEST_OUTPUT || "./output";
const study = getStudyConfig();
const anchor = study.anchors.find(item => item.id === "price")!;
const priceState = () => {
  const state = createModeratorState(study);
  state.activeAnchorId = anchor.id;
  state.activeMove = { kind: "anchor", anchorId: anchor.id };
  state.activePrompt = anchor.questionLocales!["zh-CN"];
  state.activeLanguage = "zh-CN";
  state.completedAnchors = study.anchors.slice(0, study.anchors.indexOf(anchor)).map(item => item.id);
  return state;
};
const assessment = (turnId: string, value?: string, intent: ModeratorAssessment["participantIntent"] = "answer"): ModeratorAssessment => ({
  participantIntent: intent,
  understoodFacts: value ? [{ fieldId: "price_fit", value, confidence: "high", correction: false, evidenceTurnIds: [turnId] }] : [],
  topicCoverage: { anchorId: anchor.id, status: value ? "covered" : "missing", coveredFieldIds: value ? ["price_fit"] : [], evidenceTurnIds: [turnId], note: "Synthetic outcome regression." },
  unresolvedPoints: [], contradictions: [], replyLanguage: "zh-CN", replyLanguageConfidence: "high",
  nextAction: "advance", actionReason: "Synthetic outcome regression.",
  candidateReply: study.anchors.at(-1)!.questionLocales!["zh-CN"], candidateAnchorId: "final_change", candidateFieldId: null,
  provider: "mock", model: "price-outcome-fixture", promptVersion: study.model.promptVersion,
});

it("preserves an explicit none choice and its reason as source-linked evidence", () => {
  const rawText = "  I do not need auxiliary lights, so I would not consider these tiers.  ";
  const judged = assessment("synthetic-none", "none");
  judged.understoodFacts.push({ fieldId: "price_reason", value: "No need for auxiliary lights", confidence: "high", correction: false, evidenceTurnIds: ["synthetic-none"] });
  const result = applyAssessment({ study, previous: priceState(), assessment: judged, turnId: "synthetic-none", turnIndex: 6, rawText, recentPrompts: [] });
  expect(result.state.facts.price_fit.value).toBe("none");
  expect(result.state.facts.price_reason.rawValue).toBe(rawText);
  expect(result.state.facts.price_reason.evidenceTurnIds).toContain("synthetic-none");
  expect(isAnchorCovered(study, result.state, "price")).toBe(true);
  expect(result.state.pendingGaps.some(item => item.fieldId === "price_fit")).toBe(false);
});

it.each(["small_129", "medium_279", "large_499", "none", "not_sure"])("accepts and exports the distinct declared outcome %s", (value) => {
  expect(() => validateInputPayload(anchor, priceState(), { type: "single_choice", selectedValues: [value] })).not.toThrow();
  const result = applyAssessment({ study, previous: priceState(), assessment: assessment("synthetic", value), turnId: "synthetic", turnIndex: 6, rawText: "Synthetic explicit selection: " + value, recentPrompts: [] });
  expect(result.state.facts.price_fit.value).toBe(value);
  expect(result.rejectedUpdates).toEqual([]);
  expect(result.state.facts.price_reason).toBeUndefined();
});

it.each(["skip", "refusal", "gibberish", "off_topic"] as const)("does not convert %s to none even when a model proposes it", (intent) => {
  const result = applyAssessment({ study, previous: priceState(), assessment: assessment("synthetic", "none", intent), turnId: "synthetic", turnIndex: 6, rawText: "Synthetic non-answer", recentPrompts: [] });
  expect(result.state.facts.price_fit).toBeUndefined();
  expect(isAnchorCovered(study, result.state, "price")).toBe(false);
});

it("rejects blank, unknown IDs, and overlapping single-choice selections", () => {
  for (const input of [
    { type: "single_choice", selectedValues: [], freeText: "   " },
    { type: "single_choice", selectedValues: ["missing"] },
    { type: "single_choice", selectedValues: ["none", "small_129"] },
    { type: "single_choice", selectedValues: ["none", "not_sure"] },
  ]) expect(() => validateInputPayload(anchor, priceState(), input)).toThrow();
});
it("does not invent a price outcome from an empty model extraction", () => {
  const result = applyAssessment({ study, previous: priceState(), assessment: assessment("synthetic"), turnId: "synthetic", turnIndex: 6, rawText: "I cannot provide an answer.", recentPrompts: [] });
  expect(result.state.facts.price_fit).toBeUndefined();
});
it("provides distinct neutral outcomes in all three existing languages", () => {
  if (anchor.input.type !== "single_choice") throw new Error("Expected price choices");
  expect(anchor.input.options.map(option => option.id)).toEqual(["small_129", "medium_279", "large_499", "none", "not_sure"]);
  for (const language of ["en", "zh-CN", "es"]) {
    const labels = anchor.input.options.map(option => option.labels[language]);
    expect(labels.every(Boolean)).toBe(true);
    expect(new Set(labels).size).toBe(5);
  }
});

describe.skipIf(process.env.PRICE_DB_CHECK !== "1")("real storage and export with deterministic provider", () => {
  const owned: string[] = [];
  const exports: unknown[] = [];
  afterAll(async () => {
    mkdirSync(receipt, { recursive: true });
    writeFileSync(receipt + "/price-fit-export-fixtures.json", JSON.stringify({ sampleKind: "synthetic", provider: "mock", exports }, null, 2) + "\n");
    if (owned.length) await getPool().query("DELETE FROM research_sessions WHERE id = ANY($1::uuid[])", [owned]);
    await getPool().end(); globalThis.__researchPool = undefined;
  });
  const cases = [
    ...["small_129", "medium_279", "large_499", "none", "not_sure"].map(value => ({ name: "selected-" + value, selected: [value], value, modelValue: undefined, text: "Synthetic selection: " + value, intent: "answer" as const })),
    { name: "free-none", selected: [], value: "none", modelValue: "none", text: "\n  三个档位都不选，我没有购买需求。  \n", intent: "answer" as const },
    { name: "free-no-fit", selected: [], value: "none", modelValue: "none", text: "我需要灯，但这三个规格都不适合；不是没有需求。", intent: "answer" as const },
    { name: "free-uncertain", selected: [], value: "not_sure", modelValue: "not_sure", text: "我暂时不确定，不能选出一个档位。", intent: "answer" as const },
    { name: "skip", selected: [], value: undefined, modelValue: undefined, text: "Skipped", intent: "skip" as const },
    { name: "refusal", selected: [], value: undefined, modelValue: undefined, text: "不想回答这个价格问题。", intent: "answer" as const },
  ];
  it.each(cases)("$name retains raw text, references and outcome in the exported record", async (item) => {
    const session = await createSession({ study, state: priceState(), consentVersion: null, consentLocale: null, consentedAt: null });
    owned.push(session.sessionId);
    provider.evaluate.mockImplementation(async ({ turnId }: { turnId: string }) => assessment(turnId, item.modelValue, item.name === "refusal" ? "refusal" : "answer"));
    await respondToConversation({ entryToken: session.entryToken, clientAttemptId: randomUUID(), stateRevision: 0, anchorId: "price", intent: item.intent, text: item.text, inputPayload: { type: "single_choice", selectedValues: item.selected, freeText: item.selected.length ? "" : item.text } });
    const record = await exportSession(session.entryToken);
    expect(record).toBeTruthy();
    expect(record!.studyVersion).toBe(study.study.version);
    expect(record!.turns).toHaveLength(1);
    expect(record!.turns[0].rawText).toBe(item.text);
    expect(record!.turns[0].processingStatus).toBe("completed");
    expect(record!.turns[0].errorCode).toBeNull();
    const facts = record!.facts as FactRecord[];
    const fact = facts.find(f => f.fieldId === "price_fit");
    expect(fact?.value).toBe(item.value);
    if (fact) expect(fact.evidenceTurnIds).toEqual([record!.turns[0].id]);
    expect(facts.some(f => f.fieldId === "price_reason")).toBe(false);
    expect(JSON.stringify(record)).not.toContain(session.entryToken);
    exports.push({ case: item.name, record });
  });
});
