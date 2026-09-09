import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { ConversationTurn, ModeratorAssessment, ModeratorState, RejectedFieldUpdate, ServerAction } from "./conversation-types";
import type { StudyManifest } from "./study-schema";
import { retentionExpiresAt, serializeSessionExport } from "./export-format.mjs";
export { retentionExpiresAt } from "./export-format.mjs";

declare global {
  var __researchPool: Pool | undefined;
  var __researchSchema: Promise<void> | undefined;
  var __researchSchemaVersion: string | undefined;
}

const connectionString = () => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  return value;
};

export const getPool = () => {
  if (!globalThis.__researchPool) globalThis.__researchPool = new Pool({ connectionString: connectionString(), max: 10 });
  return globalThis.__researchPool;
};

export const ensureSchema = async () => {
  if (globalThis.__researchSchemaVersion !== "privacy-attempt-intent-2026-09-08") {
    globalThis.__researchSchema = undefined;
    globalThis.__researchSchemaVersion = "privacy-attempt-intent-2026-09-08";
  }
  if (!globalThis.__researchSchema) {
    globalThis.__researchSchema = withTransaction(async (client) => {
      // IF NOT EXISTS alone does not serialize CREATE TABLE across workers.
      await client.query("SELECT pg_advisory_xact_lock(735911, 1)");
      await client.query(`
      CREATE TABLE IF NOT EXISTS research_sessions (
        id UUID PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        participation_code TEXT NOT NULL UNIQUE,
        study_id TEXT NOT NULL,
        study_version TEXT NOT NULL,
        status TEXT NOT NULL,
        consent_version TEXT,
        consent_locale TEXT,
        consented_at TIMESTAMPTZ,
        state JSONB NOT NULL,
        policy_version TEXT,
        prompt_version TEXT,
        model_snapshot JSONB,
        study_snapshot JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS research_turns (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
        turn_index INTEGER NOT NULL,
        client_attempt_id UUID NOT NULL,
        anchor_id TEXT NOT NULL,
        move_kind TEXT,
        canonical_prompt TEXT NOT NULL,
        localized_prompt TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        input_payload JSONB NOT NULL,
        assessment JSONB,
        server_action TEXT,
        action_reason TEXT,
        displayed_reply TEXT,
        rejected_field_updates JSONB,
        policy_version TEXT,
        prompt_version TEXT,
        reply_language TEXT,
        classification TEXT,
        action TEXT,
        probe_reason TEXT,
        extracted_fields JSONB,
        risk_signals JSONB,
        provider TEXT,
        model TEXT,
        state_before JSONB NOT NULL,
        state_after JSONB,
        processing_status TEXT NOT NULL CHECK (processing_status IN ('received', 'completed', 'failed')),
        error_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        UNIQUE (session_id, client_attempt_id)
      );

      CREATE TABLE IF NOT EXISTS research_fact_events (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
        turn_id UUID NOT NULL REFERENCES research_turns(id) ON DELETE CASCADE,
        turn_index INTEGER NOT NULL,
        fact_id TEXT,
        field_id TEXT NOT NULL,
        value JSONB NOT NULL,
        raw_value TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_turn_ids JSONB,
        supersedes_fact_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS policy_version TEXT;
      ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS prompt_version TEXT;
      ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS model_snapshot JSONB;
      ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS study_snapshot JSONB;
      ALTER TABLE research_sessions ALTER COLUMN consent_version DROP NOT NULL;
      ALTER TABLE research_sessions ALTER COLUMN consent_locale DROP NOT NULL;
      ALTER TABLE research_sessions ALTER COLUMN consented_at DROP NOT NULL;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS move_kind TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS assessment JSONB;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS server_action TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS action_reason TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS displayed_reply TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS rejected_field_updates JSONB;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS policy_version TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS prompt_version TEXT;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS provider_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE research_turns ADD COLUMN IF NOT EXISTS request_intent TEXT NOT NULL DEFAULT 'answer';
      CREATE TABLE IF NOT EXISTS research_erasure_tombstones (
        token_hash TEXT PRIMARY KEY,
        erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE research_fact_events ADD COLUMN IF NOT EXISTS fact_id TEXT;
      ALTER TABLE research_fact_events ADD COLUMN IF NOT EXISTS evidence_turn_ids JSONB;
      ALTER TABLE research_fact_events ADD COLUMN IF NOT EXISTS supersedes_fact_id TEXT;

      DO $$ BEGIN
        ALTER TABLE research_sessions DROP CONSTRAINT IF EXISTS research_sessions_status_check;
        ALTER TABLE research_sessions ADD CONSTRAINT research_sessions_status_check CHECK (status IN ('active', 'completed', 'completed_with_gaps', 'paused'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE INDEX IF NOT EXISTS research_sessions_study_idx ON research_sessions (study_id, study_version, updated_at DESC);
      CREATE INDEX IF NOT EXISTS research_turns_session_idx ON research_turns (session_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS research_turns_session_turn_idx ON research_turns (session_id, turn_index);
      CREATE INDEX IF NOT EXISTS research_fact_session_idx ON research_fact_events (session_id, field_id, created_at);
    `);
    }).catch((error) => {
      globalThis.__researchSchema = undefined;
      throw error;
    });
  }
  return globalThis.__researchSchema;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const sameInputPayload = (left: ConversationTurn["inputPayload"], right: ConversationTurn["inputPayload"]) =>
  left.type === right.type && (left.freeText ?? "") === (right.freeText ?? "") && JSON.stringify(left.selectedValues ?? []) === JSON.stringify(right.selectedValues ?? []);
const participantCode = () => `R-${randomBytes(5).toString("hex").toUpperCase()}`;
export const sessionExportSchemaVersion = (state: { schemaVersion?: string }) => state.schemaVersion === "moderator-2.0" ? "2.0" : "1.0";
export const resolveModelSnapshot = (study: StudyManifest, providerOverride?: string, modelOverride?: string) => {
  const provider = providerOverride || study.model.provider;
  return { provider, model: provider === "mock" ? "deterministic-controlled-autonomy-v2" : modelOverride || study.model.model };
};

const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export type SessionRow = {
  id: string;
  participation_code: string;
  study_id: string;
  study_version: string;
  status: "active" | "completed" | "completed_with_gaps" | "paused";
  consent_version: string | null;
  consent_locale: string | null;
  consented_at: Date | null;
  policy_version: string | null;
  prompt_version: string | null;
  model_snapshot: Record<string, unknown> | null;
  study_snapshot: Record<string, unknown> | null;
  created_at: Date;
  state: ModeratorState;
};

export type TurnRow = {
  id: string;
  client_attempt_id: string;
  processing_attempts: number;
  provider_diagnostics: unknown[];
  request_intent: "answer" | "skip";
  state_before: ModeratorState;
  reply_language: string | null;
  turn_index: number;
  anchor_id: string;
  move_kind: ConversationTurn["moveKind"] | null;
  canonical_prompt: string;
  localized_prompt: string;
  raw_text: string;
  input_payload: ConversationTurn["inputPayload"];
  assessment: ModeratorAssessment | null;
  server_action: ServerAction | null;
  action_reason: string | null;
  displayed_reply: string | null;
  rejected_field_updates: RejectedFieldUpdate[] | null;
  policy_version: string | null;
  prompt_version: string | null;
  extracted_fields: ConversationTurn["extractedFields"] | null;
  processing_status: "received" | "completed" | "failed";
  error_code: string | null;
};

export class StorageAccessError extends Error {
  readonly status = 410;
  constructor(public readonly code: "session_expired" | "session_deleted" | "retention_unknown") {
    super(code === "session_expired" ? "This session's retention period has ended. You can still delete it."
      : code === "session_deleted" ? "This session has been deleted." : "This session has no verifiable retention policy. You can still delete it.");
  }
}

const assertRetained = (session: SessionRow) => {
  const expiresAt = retentionExpiresAt(session);
  if (!expiresAt) throw new StorageAccessError("retention_unknown");
  if (expiresAt.getTime() <= Date.now()) throw new StorageAccessError("session_expired");
};

const sessionColumns = `id, participation_code, study_id, study_version, status, consent_version,
  consent_locale, consented_at, policy_version, prompt_version, model_snapshot, study_snapshot, created_at, state`;
const turnColumns = `id, client_attempt_id, processing_attempts, provider_diagnostics, request_intent, state_before, reply_language,
  turn_index, anchor_id, move_kind, canonical_prompt, localized_prompt, raw_text, input_payload, assessment,
  server_action, action_reason, displayed_reply, rejected_field_updates, policy_version, prompt_version,
  extracted_fields, processing_status, error_code`;

const rejectDeletedToken = async (client: PoolClient, token: string) => {
  const tombstone = await client.query("SELECT 1 FROM research_erasure_tombstones WHERE token_hash = $1", [hashToken(token)]);
  if (tombstone.rowCount) throw new StorageAccessError("session_deleted");
};

const recoverStaleReservations = async (client: PoolClient, sessionId: string) => {
  await client.query(`UPDATE research_turns SET processing_status = 'failed', error_code = 'stale_processing_recovered', completed_at = NOW()
    WHERE session_id = $1 AND processing_status = 'received' AND processing_started_at < NOW() - INTERVAL '10 minutes'`, [sessionId]);
};

export const createSession = async ({ study, state, consentVersion, consentLocale, consentedAt }: {
  study: StudyManifest;
  state: ModeratorState;
  consentVersion: string | null;
  consentLocale: string | null;
  consentedAt: string | null;
}) => {
  await ensureSchema();
  const entryToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const code = participantCode();
  const modelSnapshot = resolveModelSnapshot(study, process.env.AI_PROVIDER, process.env.DEEPSEEK_MODEL);
  await getPool().query(
    `INSERT INTO research_sessions (
      id, token_hash, participation_code, study_id, study_version, status,
      consent_version, consent_locale, consented_at, state, policy_version,
      prompt_version, model_snapshot, study_snapshot
    ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb)`,
    [id, hashToken(entryToken), code, study.study.id, study.study.version, consentVersion, consentLocale, consentedAt,
      JSON.stringify(state), study.moderation.policyVersion, study.model.promptVersion, JSON.stringify(modelSnapshot), JSON.stringify(study)],
  );
  return { sessionId: id, entryToken, participationCode: code, studyVersion: study.study.version };
};

export const getSessionByToken = async (entryToken: string): Promise<SessionRow | null> => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const result = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM research_sessions WHERE token_hash = $1 FOR UPDATE`, [hashToken(entryToken)]);
    const session = result.rows[0];
    if (!session) { await rejectDeletedToken(client, entryToken); return null; }
    assertRetained(session);
    if (session.status === "active") await recoverStaleReservations(client, session.id);
    return session;
  });
};

const readTurns = async (client: PoolClient, sessionId: string, includeFailed: boolean): Promise<TurnRow[]> => {
  const result = await client.query<TurnRow>(
    `SELECT ${turnColumns}
       FROM research_turns
      WHERE session_id = $1 ${includeFailed ? "" : "AND processing_status = 'completed'"}
      ORDER BY turn_index, id`,
    [sessionId],
  );
  return result.rows;
};

export const listTurns = async (sessionId: string, includeFailed = false): Promise<TurnRow[]> => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const result = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM research_sessions WHERE id = $1 FOR SHARE`, [sessionId]);
    if (!result.rows[0]) throw new StorageAccessError("session_deleted");
    assertRetained(result.rows[0]);
    return readTurns(client, sessionId, includeFailed);
  });
};

export const reserveTurn = async ({ entryToken, clientAttemptId, expectedRevision, anchorId, moveKind, canonicalPrompt, localizedPrompt, rawText, inputPayload, intent = "answer" }: {
  entryToken: string;
  clientAttemptId: string;
  expectedRevision: number;
  anchorId: string;
  moveKind: ConversationTurn["moveKind"];
  canonicalPrompt: string;
  localizedPrompt: string;
  rawText: string;
  inputPayload: ConversationTurn["inputPayload"];
  intent?: "answer" | "skip";
}) => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const sessionResult = await client.query<SessionRow>(
      `SELECT ${sessionColumns} FROM research_sessions WHERE token_hash = $1 FOR UPDATE`,
      [hashToken(entryToken)],
    );
    const session = sessionResult.rows[0];
    if (!session) { await rejectDeletedToken(client, entryToken); return { kind: "not_found" as const }; }
    assertRetained(session);
    const existing = await client.query<TurnRow>(
      `SELECT ${turnColumns}
         FROM research_turns WHERE session_id = $1 AND client_attempt_id = $2`,
      [session.id, clientAttemptId],
    );
    const previous = existing.rows[0];
    if (previous && (previous.raw_text !== rawText || previous.anchor_id !== anchorId || !sameInputPayload(previous.input_payload, inputPayload)
      || previous.request_intent !== intent || previous.state_before.revision !== expectedRevision || previous.move_kind !== moveKind)) return { kind: "attempt_conflict" as const };
    if (previous?.processing_status === "completed") return { kind: "duplicate" as const, session, turn: previous };
    if (session.status !== "active" || !session.state.activeAnchorId) return { kind: "complete" as const, session };
    if (session.state.revision !== expectedRevision || session.state.activeAnchorId !== anchorId) return { kind: "conflict" as const, session };
    await recoverStaleReservations(client, session.id);
    const processing = await client.query(`SELECT 1 FROM research_turns WHERE session_id = $1 AND processing_status = 'received' LIMIT 1`, [session.id]);
    if (processing.rowCount) return { kind: "in_progress" as const, session };
    if (previous) {
      if (previous.processing_attempts >= 3) return { kind: "retry_exhausted" as const };
      await client.query(`UPDATE research_turns SET processing_status = 'received', processing_attempts = processing_attempts + 1, processing_started_at = NOW(), completed_at = NULL WHERE id = $1`, [previous.id]);
      return { kind: "reserved" as const, session, turnId: previous.id, turnIndex: previous.turn_index, processingAttempt: previous.processing_attempts + 1 };
    }
    const indexResult = await client.query<{ next_index: number }>(`SELECT COALESCE(MAX(turn_index), 0) + 1 AS next_index FROM research_turns WHERE session_id = $1`, [session.id]);
    const id = randomUUID();
    const turnIndex = Number(indexResult.rows[0]?.next_index ?? 1);
    await client.query(
      `INSERT INTO research_turns (
        id, session_id, turn_index, client_attempt_id, anchor_id, move_kind,
        canonical_prompt, localized_prompt, raw_text, input_payload, state_before,
        policy_version, prompt_version, processing_status, request_intent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, 'received', $14)`,
      [id, session.id, turnIndex, clientAttemptId, anchorId, moveKind, canonicalPrompt, localizedPrompt,
        rawText, JSON.stringify(inputPayload), JSON.stringify(session.state), session.policy_version, session.prompt_version, intent],
    );
    return { kind: "reserved" as const, session, turnId: id, turnIndex, processingAttempt: 1 };
  });
};

export const commitTurn = async ({ sessionId, turnId, expectedRevision, state, turn, assessment, processingAttempt = 1, providerDiagnostics = [] }: {
  sessionId: string;
  turnId: string;
  expectedRevision: number;
  state: ModeratorState;
  turn: ConversationTurn;
  assessment: ModeratorAssessment;
  processingAttempt?: number;
  providerDiagnostics?: unknown[];
}) => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const current = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM research_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
    const session = current.rows[0];
    if (!session) throw new StorageAccessError("session_deleted");
    assertRetained(session);
    if (!session || session.status !== "active" || session.state.revision !== expectedRevision) throw new Error("session revision changed before commit");
    const lease = await client.query<TurnRow>(`SELECT ${turnColumns} FROM research_turns WHERE id = $1 AND session_id = $2 AND processing_status = 'received' AND processing_attempts = $3 FOR UPDATE`, [turnId, sessionId, processingAttempt]);
    if (!lease.rowCount) throw new Error("turn processing revision changed before commit");
    const saved = lease.rows[0];
    if (saved.state_before.revision !== expectedRevision || state.revision !== expectedRevision + 1
      || saved.raw_text !== turn.rawText || saved.anchor_id !== turn.anchorId || !sameInputPayload(saved.input_payload, turn.inputPayload)
      || turn.policyVersion !== session.policy_version || turn.promptVersion !== session.prompt_version) throw new Error("turn payload or version revision changed before commit");
    const status = turn.serverAction === "stop" ? "paused" : state.activeAnchorId === null ? (state.completionQuality === "with_evidence_gaps" ? "completed_with_gaps" : "completed") : "active";
    await client.query(`UPDATE research_sessions SET state = $2::jsonb, status = $3, updated_at = NOW() WHERE id = $1`, [sessionId, JSON.stringify(state), status]);
    await client.query(
      `UPDATE research_turns SET assessment = $2::jsonb, server_action = $3,
              action_reason = $4, displayed_reply = $5, rejected_field_updates = $6::jsonb,
              extracted_fields = $7::jsonb, policy_version = $8, prompt_version = $9,
              reply_language = $10, classification = $11, action = $12, probe_reason = $13,
              provider = $14, model = $15, state_after = $16::jsonb,
              processing_status = 'completed', completed_at = NOW(), provider_diagnostics = provider_diagnostics || $17::jsonb
        WHERE id = $1`,
      [turnId, JSON.stringify(assessment), turn.serverAction, turn.actionReason, turn.displayedReply,
        JSON.stringify(turn.rejectedFieldUpdates), JSON.stringify(turn.extractedFields), turn.policyVersion,
        turn.promptVersion, turn.replyLanguage, turn.participantIntent, turn.serverAction,
        turn.actionReason, turn.provider, turn.model, JSON.stringify(state), JSON.stringify(providerDiagnostics)],
    );
    for (const update of turn.extractedFields) {
      const fact = state.facts[update.fieldId];
      if (!fact) continue;
      await client.query(
        `INSERT INTO research_fact_events (
          id, session_id, turn_id, turn_index, fact_id, field_id, value, raw_value,
          confidence, status, source, evidence_turn_ids, supersedes_fact_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13)`,
        [randomUUID(), sessionId, turnId, turn.turnIndex, fact.factId, update.fieldId,
          JSON.stringify(update.value), fact.rawValue, fact.confidence, fact.status, fact.source,
          JSON.stringify(fact.evidenceTurnIds), fact.supersedesFactId ?? null],
      );
    }
    return status;
  });
};

export const failTurn = async (turnId: string, code: string, processingAttempt = 1, providerDiagnostics: unknown[] = []) => {
  await ensureSchema();
  await getPool().query(`UPDATE research_turns SET processing_status = 'failed', error_code = $2, completed_at = NOW(), provider_diagnostics = provider_diagnostics || $4::jsonb WHERE id = $1 AND processing_status = 'received' AND processing_attempts = $3`, [turnId, code.slice(0, 80), processingAttempt, JSON.stringify(providerDiagnostics)]);
};

export const pauseSession = async (entryToken: string) => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const result = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM research_sessions WHERE token_hash = $1 FOR UPDATE`, [hashToken(entryToken)]);
    const session = result.rows[0];
    if (!session) { await rejectDeletedToken(client, entryToken); return null; }
    assertRetained(session);
    if (session.status !== "active" && session.status !== "paused") return null;
    await client.query("UPDATE research_sessions SET status = 'paused', updated_at = NOW() WHERE id = $1", [session.id]);
    await client.query("UPDATE research_turns SET processing_status = 'failed', error_code = 'session_paused', completed_at = NOW() WHERE session_id = $1 AND processing_status = 'received'", [session.id]);
    return { participation_code: session.participation_code };
  });
};

// Explicit withdrawal works even after expiry. No participant content, session ID,
// participation code, or raw access token survives in the minimal tombstone.
export const deleteSession = async (entryToken: string) => {
  await ensureSchema();
  return withTransaction(async (client) => {
    const tokenHash = hashToken(entryToken);
    const result = await client.query<{ id: string }>("SELECT id FROM research_sessions WHERE token_hash = $1 FOR UPDATE", [tokenHash]);
    if (!result.rows[0]) {
      const prior = await client.query("SELECT 1 FROM research_erasure_tombstones WHERE token_hash = $1", [tokenHash]);
      return prior.rowCount ? { status: "deleted" as const } : null;
    }
    await client.query("INSERT INTO research_erasure_tombstones (token_hash) VALUES ($1) ON CONFLICT DO NOTHING", [tokenHash]);
    await client.query("DELETE FROM research_sessions WHERE id = $1", [result.rows[0].id]);
    return { status: "deleted" as const };
  });
};

export const exportSession = async (entryToken: string) => {
  await ensureSchema();
  return withTransaction(async (client) => {
    // This lock makes state, turns, and the immutable study snapshot one export
    // version, and prevents a concurrent withdrawal from returning partial data.
    const result = await client.query<SessionRow>(`SELECT ${sessionColumns} FROM research_sessions WHERE token_hash = $1 FOR SHARE`, [hashToken(entryToken)]);
    const session = result.rows[0];
    if (!session) { await rejectDeletedToken(client, entryToken); return null; }
    assertRetained(session);
    return serializeSessionExport(session, await readTurns(client, session.id, true));
  });
};
