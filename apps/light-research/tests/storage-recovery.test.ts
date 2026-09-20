import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { commitTurn, failTurn, reserveTurn } from "@/lib/storage";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";

const state = createModeratorState(getStudyConfig());
const request = { entryToken: "synthetic-test-token", clientAttemptId: "attempt", expectedRevision: 0, anchorId: state.activeAnchorId!, moveKind: "anchor" as const, canonicalPrompt: "Question?", localizedPrompt: "Question?", rawText: "Saved answer", inputPayload: { type: "text" as const, freeText: "Saved answer" } };
const session = { id: "session", prompt_version: "old-prompt", policy_version: getStudyConfig().moderation.policyVersion, status: "active", state, created_at: new Date(), study_snapshot: getStudyConfig() };
const previous = { id: "turn", turn_index: 1, anchor_id: request.anchorId, move_kind: "anchor", raw_text: request.rawText, input_payload: request.inputPayload, processing_status: "failed", processing_attempts: 1, request_intent: "answer", state_before: state };

function database(existing: object | null = previous, status = "active", processing = false, lease = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM research_sessions")) return { rows: [{ ...session, status }], rowCount: 1 };
    if (sql.includes("client_attempt_id = $2")) return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
    if (sql.startsWith("SELECT 1")) return { rows: processing ? [{}] : [], rowCount: processing ? 1 : 0 };
    if (sql.includes("processing_attempts = $3 FOR UPDATE")) return { rows: lease ? [previous] : [], rowCount: lease ? 1 : 0 };
    if (sql.includes("MAX(turn_index)")) return { rows: [{ next_index: 2 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  globalThis.__researchSchemaVersion = "privacy-attempt-intent-2026-09-08";
  globalThis.__researchSchema = Promise.resolve();
  globalThis.__researchPool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return query;
}
afterEach(() => { globalThis.__researchPool = undefined; globalThis.__researchSchema = undefined; globalThis.__researchSchemaVersion = undefined; });

describe("persisted retry lease boundaries", () => {
  it("reuses the saved answer and turn identity on failure retry", async () => {
    const query = database();
    expect(await reserveTurn(request)).toMatchObject({ kind: "reserved", turnId: "turn", turnIndex: 1, processingAttempt: 2 });
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO research_turns"))).toBe(false);
  });
  it("rejects payload changes under the same attempt ID", async () => {
    database();
    expect(await reserveTurn({ ...request, rawText: "Replacement" })).toEqual({ kind: "attempt_conflict" });
  });
  it("never reprocesses a committed attempt", async () => {
    database({ ...previous, processing_status: "completed" });
    expect(await reserveTurn(request)).toMatchObject({ kind: "duplicate" });
  });
  it("bounds one saved answer to three processing attempts", async () => {
    database({ ...previous, processing_attempts: 3 });
    expect(await reserveTurn(request)).toEqual({ kind: "retry_exhausted" });
  });
  it("does not process two concurrent requests", async () => {
    database(previous, "active", true);
    expect(await reserveTurn(request)).toMatchObject({ kind: "in_progress" });
  });
  it("rejects a late model commit after stop", async () => {
    const query = database(previous, "paused");
    await expect(commitTurn({ sessionId: "session", turnId: "turn", expectedRevision: 0, state } as Parameters<typeof commitTurn>[0])).rejects.toThrow(/revision changed/);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE research_sessions"))).toBe(false);
  });
  it("rejects an expired worker after the answer was reclaimed", async () => {
    database(previous, "active", false, false);
    await expect(commitTurn({ sessionId: "session", turnId: "turn", expectedRevision: 0, state, processingAttempt: 1 } as Parameters<typeof commitTurn>[0])).rejects.toThrow(/processing revision/);
  });
  const upgradedCommit = () => ({
    sessionId: "session", turnId: "turn", expectedRevision: 0,
    state: { ...state, revision: 1 }, processingAttempt: 2,
    turn: { rawText: request.rawText, anchorId: request.anchorId, inputPayload: request.inputPayload,
      promptVersion: "new-prompt", policyVersion: session.policy_version, serverAction: "immediate_clarify",
      extractedFields: [], rejectedFieldUpdates: [] },
    assessment: { promptVersion: "new-prompt" }, expectedSessionPromptVersion: "old-prompt",
  } as unknown as Parameters<typeof commitTurn>[0]);

  it("commits a new prompt revision to an existing session without rewriting its original version", async () => {
    const query = database();
    await expect(commitTurn(upgradedCommit())).resolves.toBe("active");
    const sessionWrite = query.mock.calls.find(([sql]) => sql.startsWith("UPDATE research_sessions"))?.[0] ?? "";
    expect(sessionWrite).not.toContain("prompt_version");
    expect(query.mock.calls.some(([sql]) => sql.includes("prompt_version = $9"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO research_turns"))).toBe(false);
  });

  it("still rejects an unacknowledged session prompt change and mismatched assessment version", async () => {
    const query = database();
    await expect(commitTurn({ ...upgradedCommit(), expectedSessionPromptVersion: "other-version" })).rejects.toThrow(/payload or version/);
    const bad = upgradedCommit();
    bad.assessment.promptVersion = "different-assessment";
    await expect(commitTurn(bad)).rejects.toThrow(/payload or version/);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE research_sessions"))).toBe(false);
  });

  it("late failure cannot overwrite a completed or newer attempt", async () => {
    const query = database();
    await failTurn("turn", "timeout", 1);
    expect(query.mock.calls.at(-1)?.[0]).toContain("processing_status = 'received' AND processing_attempts = $3");
  });
});
