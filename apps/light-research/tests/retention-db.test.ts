import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createModeratorState } from "@/lib/moderator-state";
import { getLegacyStudyConfig } from "@/lib/study-config";
import { createSession, deleteSession, purgeExpiredSessions } from "@/lib/storage";

describe.skipIf(process.env.SURVEY_RETENTION_DB !== "1")("automated retention sweep", () => {
  it("erases only expired sessions and keeps an idempotent tombstone", async () => {
    const study = getLegacyStudyConfig();
    const expired = await createSession({ study, state: createModeratorState(study), consentVersion: null, consentLocale: null, consentedAt: null });
    const current = await createSession({ study, state: createModeratorState(study), consentVersion: null, consentLocale: null, consentedAt: null });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    try {
      await pool.query("UPDATE research_sessions SET created_at = NOW() - INTERVAL '31 days' WHERE id = $1", [expired.sessionId]);
      expect(await purgeExpiredSessions()).toBe(1);
      expect(await purgeExpiredSessions()).toBe(0);
      const rows = await pool.query<{ id: string }>("SELECT id FROM research_sessions WHERE id IN ($1, $2)", [expired.sessionId, current.sessionId]);
      expect(rows.rows.map((row) => row.id)).toEqual([current.sessionId]);
      expect(await deleteSession(expired.entryToken)).toEqual({ status: "deleted" });
    } finally {
      await deleteSession(current.entryToken);
      await pool.end();
    }
  });
});
