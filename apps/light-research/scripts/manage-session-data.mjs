import pg from "pg";
import { retentionExpiresAt } from "../lib/export-format.mjs";

const args = process.argv.slice(2);
const idIndex = args.indexOf("--session-id");
const sessionId = idIndex < 0 ? undefined : args[idIndex + 1];
const apply = args.includes("--apply");
if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error("An exact --session-id UUID is required.");
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--session-id") { index += 1; continue; }
  if (!["--apply", "--dry-run"].includes(args[index])) throw new Error("Unknown privacy command argument.");
}
if (apply && args.includes("--dry-run")) throw new Error("Choose --apply or --dry-run.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const result = await client.query("SELECT id, token_hash, study_snapshot, created_at FROM research_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
  const session = result.rows[0];
  const expiresAt = session ? retentionExpiresAt(session) : null;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  if (apply && !expired) throw new Error("Only an expired selected session can be erased by retention cleanup.");
  if (apply) {
    await client.query("INSERT INTO research_erasure_tombstones (token_hash) VALUES ($1) ON CONFLICT DO NOTHING", [session.token_hash]);
    await client.query("DELETE FROM research_sessions WHERE id = $1", [sessionId]);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", found: Boolean(session), expired, policyKnown: Boolean(expiresAt), databaseErased: apply, localExportsRemoved: false }));
} catch {
  await client.query("ROLLBACK");
  console.error("Retention cleanup stopped; only an exact existing expired session is eligible. No session content was printed.");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
