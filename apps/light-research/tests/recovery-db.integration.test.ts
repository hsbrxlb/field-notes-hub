import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as provider from "@/lib/moderator-provider";
import { getConversation, respondToConversation, startConversation, stopConversation } from "@/lib/conversation-service";
import { exportSession, getPool } from "@/lib/storage";

// Opt-in: creates isolated synthetic sessions in the configured local database.
describe.skipIf(process.env.SURVEY_DB_INTEGRATION !== "1")("real PostgreSQL recovery integration", () => {
  const ownedSessionIds: string[] = [];
  beforeAll(() => { vi.stubEnv("AI_PROVIDER", "mock"); });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    if (ownedSessionIds.length) await getPool().query("DELETE FROM research_sessions WHERE id = ANY($1::uuid[])", [ownedSessionIds]);
    if (globalThis.__researchPool) await getPool().end();
    globalThis.__researchPool = undefined;
    vi.unstubAllEnvs();
  });
  const createRequest = async () => {
    const started = await startConversation();
    ownedSessionIds.push(started.sessionId);
    const view = started.conversation;
    return { started, request: { entryToken: started.entryToken, clientAttemptId: randomUUID(), stateRevision: view.stateRevision, anchorId: view.anchorId!, text: "Synthetic recovery test: I drive to camp after dark.", inputPayload: { type: "text", freeText: "Synthetic recovery test: I drive to camp after dark." } } };
  };

  it("restores a failed answer, retries it once, and replays a committed attempt without duplicate rows", async () => {
    const { started, request } = await createRequest();
    vi.spyOn(provider, "evaluateTurn").mockRejectedValueOnce(new provider.ProviderError("simulated_failure", "synthetic failure"));
    await expect(respondToConversation(request)).rejects.toMatchObject({ status: 503, answerSaved: true });
    const restored = await getConversation(started.entryToken);
    expect(restored.retry?.clientAttemptId).toBe(request.clientAttemptId);
    expect(restored.messages.filter((message) => message.role === "user")).toHaveLength(1);
    vi.restoreAllMocks();
    const completed = await respondToConversation(request);
    expect(completed.stateRevision).toBe(1);
    const replayed = await respondToConversation(request);
    expect(replayed.stateRevision).toBe(1);
    const exported = await exportSession(started.entryToken);
    expect(exported?.turns).toHaveLength(1);
    expect(exported?.turns[0]).toMatchObject({ rawText: request.text, processingStatus: "completed", processingAttempts: 2 });
    await expect(respondToConversation({ ...request, text: "changed" })).rejects.toMatchObject({ code: "attempt_conflict" });
  });

  it("bounds repeated failures and preserves the immutable raw answer", async () => {
    const { started, request } = await createRequest();
    vi.spyOn(provider, "evaluateTurn").mockRejectedValue(new provider.ProviderError("simulated_failure", "synthetic failure"));
    for (let i = 0; i < 3; i += 1) await expect(respondToConversation(request)).rejects.toMatchObject({ status: 503 });
    await expect(respondToConversation(request)).rejects.toMatchObject({ status: 429, code: "retry_exhausted" });
    const restored = await getConversation(started.entryToken);
    expect(restored.retry).toBeNull();
    expect(restored.retryExhausted).toBe(true);
    const exported = await exportSession(started.entryToken);
    expect(exported?.turns).toHaveLength(1);
    expect(exported?.turns[0].rawText).toBe(request.text);
  });

  it("a stopped session stays paused when an in-flight model response arrives", async () => {
    const { started, request } = await createRequest();
    const original = provider.evaluateTurn;
    let release!: () => void;
    let entered!: () => void;
    const enteredModel = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(provider, "evaluateTurn").mockImplementationOnce(async (input) => { entered(); await held; return original(input); });
    const pending = respondToConversation(request);
    await enteredModel;
    await expect(respondToConversation(request)).rejects.toMatchObject({ code: "in_progress" });
    await stopConversation(started.entryToken);
    release();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect((await getConversation(started.entryToken)).status).toBe("paused");
    expect((await exportSession(started.entryToken))?.turns[0].processingStatus).toBe("failed");
  });
});
