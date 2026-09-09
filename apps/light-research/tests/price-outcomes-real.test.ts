import { afterAll, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import { respondToConversation } from "@/lib/conversation-service";
import { createSession, exportSession, getPool, pauseSession } from "@/lib/storage";

const receipt = process.env.SURVEY_TEST_OUTPUT || "./output";
afterAll(async () => {
  if (globalThis.__researchPool) { await getPool().end(); globalThis.__researchPool = undefined; }
});
it.skipIf(process.env.PRICE_REAL_CHECK !== "1")("real DeepSeek preserves the explicit free-text none outcome", async () => {
  const rawText = "这些档位我都不会买，目前没有额外加装灯具的需求。";
  const study = getStudyConfig(), price = study.anchors.find(a => a.id === "price")!;
  const state = createModeratorState(study);
  state.activeAnchorId = "price"; state.activeMove = { kind: "anchor", anchorId: "price" };
  state.activePrompt = price.questionLocales!["zh-CN"]; state.activeLanguage = "zh-CN";
  state.completedAnchors = study.anchors.slice(0, study.anchors.indexOf(price)).map(a => a.id);
  const session = await createSession({ study, state, consentVersion: null, consentLocale: null, consentedAt: null });
  try {
    await respondToConversation({ entryToken: session.entryToken, clientAttemptId: randomUUID(), stateRevision: 0, anchorId: "price", intent: "answer", text: rawText, inputPayload: { type: "single_choice", selectedValues: [], freeText: rawText } });
  } finally {
    const record = await exportSession(session.entryToken);
    const encoded = JSON.stringify({ sampleKind: "synthetic", scope: "One real-provider turn, synthetic session initialized at price; not a complete interview.", record }, null, 2);
    expect(encoded).not.toContain(session.entryToken);
    mkdirSync(receipt, { recursive: true });
    writeFileSync(receipt + "/price-fit-real-export.json", encoded + "\n");
    await pauseSession(session.entryToken);
  }
  const saved = JSON.parse(readFileSync(receipt + "/price-fit-real-export.json", "utf8")).record;
  expect(saved.turns).toHaveLength(1);
  expect(saved.turns[0].rawText).toBe(rawText);
  expect(saved.turns[0].assessment.provider).toBe("deepseek");
  expect(saved.turns[0].processingStatus).toBe("completed");
  expect(saved.turns[0].errorCode).toBeNull();
  expect(saved.turns[0].providerDiagnostics.some((d: { category: string; httpStatus: number }) => d.category === "success" && d.httpStatus === 200)).toBe(true);
  expect(saved.facts.find((f: { fieldId: string }) => f.fieldId === "price_fit")?.value).toBe("none");
  expect(saved.turns[0].rejectedFieldUpdates.some((f: { fieldId: string }) => f.fieldId === "price_fit")).toBe(false);
  expect(saved.pendingGaps.some((g: { fieldId: string; status: string }) => g.fieldId === "price_fit" && g.status !== "resolved")).toBe(false);
}, 65000);

