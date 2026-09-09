import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import { commitTurn, createSession, deleteSession, exportSession, failTurn, getPool, getSessionByToken, listTurns, pauseSession, reserveTurn } from "@/lib/storage";
import { mockAssessment } from "@/lib/moderator-provider";
import { applyAssessment } from "@/lib/moderator-state";
import type { ConversationTurn } from "@/lib/conversation-types";
import { serializeSessionExport } from "@/lib/export-format.mjs";

// Every mutation below targets only session IDs created by this test process.
describe.skipIf(process.env.SURVEY_DB_INTEGRATION !== "1")("real PostgreSQL privacy and immutable-attempt boundaries", () => {
  const ownedSessionIds: string[] = [];
  const ownedTombstoneHashes: string[] = [];
  afterAll(async () => {
    if (ownedSessionIds.length) await getPool().query("DELETE FROM research_sessions WHERE id = ANY($1::uuid[])", [ownedSessionIds]);
    if (ownedTombstoneHashes.length) await getPool().query("DELETE FROM research_erasure_tombstones WHERE token_hash = ANY($1::text[])", [ownedTombstoneHashes]);
    if (globalThis.__researchPool) await getPool().end();
    globalThis.__researchPool = undefined;
  });
  const fixture = async () => {
    const study = structuredClone(getStudyConfig());
    const state = createModeratorState(study);
    const session = await createSession({ study, state, consentVersion: null, consentLocale: null, consentedAt: null });
    ownedSessionIds.push(session.sessionId);
    const request = { entryToken: session.entryToken, clientAttemptId: randomUUID(), expectedRevision: 0,
      anchorId: state.activeAnchorId!, moveKind: "anchor" as const, canonicalPrompt: study.anchors[0].question,
      localizedPrompt: state.activePrompt!, rawText: "Synthetic immutable answer", inputPayload: { type: "text", freeText: "Synthetic immutable answer" }, intent: "answer" as "answer" | "skip" };
    return { study, state, session, request };
  };
  const preparedCommit = async () => {
    const setup = await fixture();
    const reserved = await reserveTurn(setup.request);
    if (reserved.kind !== "reserved") throw new Error("fixture reservation failed");
    const assessment = mockAssessment({ study: setup.study, state: setup.state, anchor: setup.study.anchors[0], turnId: reserved.turnId, rawText: setup.request.rawText, inputPayload: setup.request.inputPayload, transcript: [] });
    const applied = applyAssessment({ study: setup.study, previous: setup.state, assessment, turnId: reserved.turnId, turnIndex: reserved.turnIndex, rawText: setup.request.rawText, recentPrompts: [setup.request.localizedPrompt] });
    const turn: ConversationTurn = { id: reserved.turnId, turnIndex: reserved.turnIndex, anchorId: setup.request.anchorId, moveKind: "anchor", canonicalPrompt: setup.request.canonicalPrompt, localizedPrompt: setup.request.localizedPrompt, rawText: setup.request.rawText, inputPayload: setup.request.inputPayload,
      replyLanguage: "zh-CN", participantIntent: assessment.participantIntent, topicCoverage: assessment.topicCoverage, unresolvedPoints: assessment.unresolvedPoints, contradictions: assessment.contradictions,
      extractedFields: applied.acceptedUpdates, rejectedFieldUpdates: applied.rejectedUpdates, aiSuggestedAction: assessment.nextAction, serverAction: applied.serverAction, actionReason: applied.actionReason,
      candidateReply: assessment.candidateReply, displayedReply: applied.displayedReply, provider: assessment.provider, model: assessment.model, promptVersion: setup.study.model.promptVersion, policyVersion: setup.study.moderation.policyVersion };
    return { ...setup, reserved, commit: { sessionId: setup.session.sessionId, turnId: reserved.turnId, expectedRevision: 0, state: applied.state, turn, assessment, processingAttempt: 1 } };
  };

  it("denies reads after the stored retention period expires", async () => {
    const { session } = await fixture();
    await getPool().query("UPDATE research_sessions SET created_at = NOW() - INTERVAL '3651 days' WHERE id = $1", [session.sessionId]);
    await expect(getSessionByToken(session.entryToken)).rejects.toMatchObject({ status: 410, code: "session_expired" });
    await expect(exportSession(session.entryToken)).rejects.toMatchObject({ status: 410, code: "session_expired" });
  });

  it("fails closed when a legacy record has no verifiable retention policy", async () => {
    const { session } = await fixture();
    await getPool().query("UPDATE research_sessions SET study_snapshot = NULL WHERE id = $1", [session.sessionId]);
    await expect(getSessionByToken(session.entryToken)).rejects.toMatchObject({ code: "retention_unknown" });
    await expect(exportSession(session.entryToken)).rejects.toMatchObject({ code: "retention_unknown" });
    ownedTombstoneHashes.push(createHash("sha256").update(session.entryToken).digest("hex"));
    expect(await deleteSession(session.entryToken)).toEqual({ status: "deleted" });
  });

  it("does not reuse an old failed attempt against a newer revision of the same topic", async () => {
    const { session, state, request } = await fixture();
    const reserved = await reserveTurn(request);
    if (reserved.kind !== "reserved") throw new Error("fixture reservation failed");
    await failTurn(reserved.turnId, "synthetic_failure");
    await getPool().query("UPDATE research_sessions SET state = $2::jsonb WHERE id = $1", [session.sessionId, JSON.stringify({ ...state, revision: 1 })]);
    expect(await reserveTurn({ ...request, expectedRevision: 1 })).toMatchObject({ kind: "attempt_conflict" });
  });

  it("does not change an answer into skip under the same idempotency key", async () => {
    const { request } = await fixture();
    const reserved = await reserveTurn(request);
    if (reserved.kind !== "reserved") throw new Error("fixture reservation failed");
    await failTurn(reserved.turnId, "synthetic_failure");
    expect(await reserveTurn({ ...request, intent: "skip" })).toMatchObject({ kind: "attempt_conflict" });
  });

  it("recovers an abandoned reservation during restore without creating a new answer", async () => {
    const { session, request } = await fixture();
    const reserved = await reserveTurn(request);
    if (reserved.kind !== "reserved") throw new Error("fixture reservation failed");
    await getPool().query("UPDATE research_turns SET processing_started_at = NOW() - INTERVAL '11 minutes' WHERE id = $1", [reserved.turnId]);
    await getSessionByToken(session.entryToken);
    const turns = await listTurns(session.sessionId, true);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ processing_status: "failed", error_code: "stale_processing_recovered", raw_text: request.rawText });
  });

  it("exports immutable study questions and declared measurement stages", async () => {
    const { session, study } = await fixture();
    const exported = await exportSession(session.entryToken);
    expect(exported).toMatchObject({ studySnapshot: { study: { id: study.study.id }, anchors: study.anchors.map(({ id, question, measurementStage }) => ({ id, question, measurementStage })) }, dataProvenance: { source: "study_snapshot" } });
  });

  it("allows only one of two simultaneous distinct attempts to acquire the session lease", async () => {
    const { session, request } = await fixture();
    const results = await Promise.all([reserveTurn(request), reserveTurn({ ...request, clientAttemptId: randomUUID() })]);
    expect(results.map((result) => result.kind).sort()).toEqual(["in_progress", "reserved"]);
    expect(await listTurns(session.sessionId, true)).toHaveLength(1);
  });

  it("rejects a stale worker commit after restore and same-answer lease reclamation", async () => {
    const setup = await preparedCommit();
    await getPool().query("UPDATE research_turns SET processing_started_at = NOW() - INTERVAL '11 minutes' WHERE id = $1", [setup.reserved.turnId]);
    await getSessionByToken(setup.session.entryToken);
    expect(await reserveTurn(setup.request)).toMatchObject({ kind: "reserved", processingAttempt: 2, turnId: setup.reserved.turnId });
    await expect(commitTurn(setup.commit)).rejects.toThrow(/processing revision/);
    await failTurn(setup.reserved.turnId, "late_old_failure", 1);
    expect((await listTurns(setup.session.sessionId, true))[0]).toMatchObject({ processing_status: "received", processing_attempts: 2 });
    await commitTurn({ ...setup.commit, processingAttempt: 2 });
    expect((await getSessionByToken(setup.session.entryToken))?.state.revision).toBe(1);
  });

  it("rejects altered commit payloads without changing raw data, state, or fact events", async () => {
    const setup = await preparedCommit();
    await expect(commitTurn({ ...setup.commit, turn: { ...setup.commit.turn, rawText: "rewritten evidence" } })).rejects.toThrow(/payload or version/);
    expect((await getSessionByToken(setup.session.entryToken))?.state.revision).toBe(0);
    expect((await listTurns(setup.session.sessionId, true))[0].raw_text).toBe(setup.request.rawText);
    const facts = await getPool().query("SELECT 1 FROM research_fact_events WHERE session_id = $1", [setup.session.sessionId]);
    expect(facts.rowCount).toBe(0);
  });

  it("rejects in-flight commits and new evaluations after retention expiry, but permits withdrawal", async () => {
    const setup = await preparedCommit();
    await getPool().query("UPDATE research_sessions SET created_at = NOW() - INTERVAL '3651 days' WHERE id = $1", [setup.session.sessionId]);
    await expect(reserveTurn(setup.request)).rejects.toMatchObject({ code: "session_expired" });
    await expect(commitTurn(setup.commit)).rejects.toMatchObject({ code: "session_expired" });
    await expect(pauseSession(setup.session.entryToken)).rejects.toMatchObject({ code: "session_expired" });
    ownedTombstoneHashes.push(createHash("sha256").update(setup.session.entryToken).digest("hex"));
    expect(await deleteSession(setup.session.entryToken)).toEqual({ status: "deleted" });
  });

  it("withdraws one session atomically, clears dependent content and blocks old workers and replay", async () => {
    const setup = await preparedCommit();
    const other = await fixture();
    await commitTurn(setup.commit);
    await pauseSession(other.session.entryToken);
    const hash = createHash("sha256").update(setup.session.entryToken).digest("hex");
    ownedTombstoneHashes.push(hash);
    expect(await deleteSession(setup.session.entryToken)).toEqual({ status: "deleted" });
    expect(await deleteSession(setup.session.entryToken)).toEqual({ status: "deleted" });
    await expect(getSessionByToken(setup.session.entryToken)).rejects.toMatchObject({ status: 410, code: "session_deleted" });
    await expect(exportSession(setup.session.entryToken)).rejects.toMatchObject({ code: "session_deleted" });
    await expect(commitTurn(setup.commit)).rejects.toMatchObject({ code: "session_deleted" });
    await expect(reserveTurn(setup.request)).rejects.toMatchObject({ code: "session_deleted" });
    for (const table of ["research_turns", "research_fact_events"]) {
      const remaining = await getPool().query(`SELECT 1 FROM ${table} WHERE session_id = $1`, [setup.session.sessionId]);
      expect(remaining.rowCount).toBe(0);
    }
    const tombstone = await getPool().query("SELECT * FROM research_erasure_tombstones WHERE token_hash = $1", [hash]);
    expect(Object.keys(tombstone.rows[0]).sort()).toEqual(["erased_at", "token_hash"]);
    expect((await getSessionByToken(other.session.entryToken))?.status).toBe("paused");
  });

  it("retains server-resolved language separately from the model guess and the snapshot's measurement identity", async () => {
    const setup = await preparedCommit();
    await commitTurn(setup.commit);
    const exported = await exportSession(setup.session.entryToken);
    expect(exported?.turns[0]).toMatchObject({ replyLanguage: "zh-CN", modelReplyLanguage: "en", measurementStage: setup.study.anchors[0].measurementStage, evidenceFieldIds: setup.study.anchors[0].evidenceFields ?? [] });
    expect(JSON.stringify(exported)).not.toContain(setup.session.entryToken);
    expect(exported?.studySnapshot).toMatchObject({ study: { id: setup.study.study.id, version: setup.study.study.version } });
  });

  it("requires the original revision even for a completed idempotent replay", async () => {
    const setup = await preparedCommit();
    await commitTurn(setup.commit);
    expect(await reserveTurn(setup.request)).toMatchObject({ kind: "duplicate" });
    expect(await reserveTurn({ ...setup.request, expectedRevision: 1 })).toMatchObject({ kind: "attempt_conflict" });
  });

  it("does not infer synthetic provenance from a study name or provider", async () => {
    const { session } = await fixture();
    await getPool().query("UPDATE research_sessions SET study_snapshot = jsonb_set(study_snapshot, '{study,sampleKind}', '\"unspecified\"'::jsonb) WHERE id = $1", [session.sessionId]);
    expect((await exportSession(session.entryToken))?.dataProvenance).toEqual({ sampleKind: "unspecified", source: "study_snapshot" });
  });

  it("keeps internal claims and local source paths out of token exports while retaining them for an authorized operator", async () => {
    const { session, study } = await fixture();
    study.claims.push({ id: "private_claim", text: "INTERNAL-CLAIM-MARKER", status: "internal_only", source: "/Users/private/source-marker.md" });
    study.claims.push({ id: "approved_claim", text: "Approved participant statement", status: "approved_for_participants", source: "/Users/private/approved-source-marker.md" });
    await getPool().query("UPDATE research_sessions SET study_snapshot = $2::jsonb WHERE id = $1", [session.sessionId, JSON.stringify(study)]);
    const exported = await exportSession(session.entryToken);
    expect(JSON.stringify(exported)).not.toContain("INTERNAL-CLAIM-MARKER");
    expect(JSON.stringify(exported)).not.toContain("/Users/private/");
    expect(JSON.stringify(exported)).toContain("Approved participant statement");
    const row = await getSessionByToken(session.entryToken);
    if (!row) throw new Error("fixture missing");
    const operator = serializeSessionExport(row, [], { audience: "operator" });
    expect(operator.studySnapshot).toEqual(study);
    expect(JSON.stringify(operator)).toContain("INTERNAL-CLAIM-MARKER");
    expect(JSON.stringify(operator)).not.toContain(session.entryToken);
  });
});
