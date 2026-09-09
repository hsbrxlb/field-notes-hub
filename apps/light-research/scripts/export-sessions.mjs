import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { retentionExpiresAt, serializeSessionExport } from "../lib/export-format.mjs";

const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const sessionId = value("--session-id");
const studyId = value("--study-id");
const studyVersion = value("--study-version");
const write = args.includes("--write");
const outputDir = resolve(value("--output") || "output/exports");
const allowed = new Set(["--session-id", "--study-id", "--study-version", "--output", "--write", "--dry-run"]);
for (let index = 0; index < args.length; index += 1) {
  const name = args[index];
  if (!allowed.has(name)) throw new Error("Unknown export argument.");
  if (!["--write", "--dry-run"].includes(name) && (!args[++index] || args[index].startsWith("--"))) throw new Error("Export argument requires a value.");
}
if (Boolean(sessionId) === Boolean(studyId && studyVersion) || (sessionId && (studyId || studyVersion)) || (!sessionId && (!studyId || !studyVersion))) {
  throw new Error("Select exactly --session-id UUID or --study-id ID --study-version VERSION. No export-all mode.");
}
if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error("Invalid session ID.");
if (write && args.includes("--dry-run")) throw new Error("Choose --write or --dry-run.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const sessions = await client.query(`SELECT id, participation_code, study_id, study_version, status,
    consent_version, consent_locale, consented_at, state, policy_version, prompt_version, model_snapshot, study_snapshot, created_at
    FROM research_sessions WHERE ${sessionId ? "id = $1" : "study_id = $1 AND study_version = $2"} ORDER BY created_at FOR SHARE`,
  sessionId ? [sessionId] : [studyId, studyVersion]);
  let eligible = 0;
  let expired = 0;
  let unknownRetention = 0;
  for (const session of sessions.rows) {
    const expiresAt = retentionExpiresAt(session);
    if (!expiresAt) { unknownRetention += 1; continue; }
    if (expiresAt.getTime() <= Date.now()) { expired += 1; continue; }
    eligible += 1;
    if (!write) continue;
    const turns = await client.query(`SELECT id, turn_index, anchor_id, move_kind, canonical_prompt, localized_prompt,
      raw_text, input_payload, assessment, server_action, action_reason, displayed_reply, rejected_field_updates,
      extracted_fields, policy_version, prompt_version, processing_status, processing_attempts, provider_diagnostics,
      request_intent, reply_language, error_code FROM research_turns WHERE session_id = $1 ORDER BY turn_index, id`, [session.id]);
    const record = serializeSessionExport(session, turns.rows, { audience: "operator" });
    await mkdir(outputDir, { recursive: true });
    if (!/^R-[A-F0-9]+$/.test(record.participationCode)) throw new Error("Unsafe participation code.");
    await writeFile(resolve(outputDir, `${record.participationCode}.json`), JSON.stringify(record, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", matched: sessions.rowCount, eligible, expired, unknownRetention, exported: write ? eligible : 0 }));
} catch {
  await client.query("ROLLBACK");
  console.error("Scoped export failed; inspect the selected scope and output directory. Existing output files are never overwritten.");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
