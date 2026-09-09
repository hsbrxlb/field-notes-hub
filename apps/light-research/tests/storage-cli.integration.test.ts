import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createSession, getPool, getSessionByToken } from "@/lib/storage";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";

const run = promisify(execFile);
describe.skipIf(process.env.SURVEY_DB_INTEGRATION !== "1")("scoped local privacy and export commands", () => {
  const sessions: string[] = [];
  const hashes: string[] = [];
  const directories: string[] = [];
  afterAll(async () => {
    if (sessions.length) await getPool().query("DELETE FROM research_sessions WHERE id = ANY($1::uuid[])", [sessions]);
    if (hashes.length) await getPool().query("DELETE FROM research_erasure_tombstones WHERE token_hash = ANY($1::text[])", [hashes]);
    for (const directory of directories) await rm(directory, { recursive: true });
    if (globalThis.__researchPool) await getPool().end();
    globalThis.__researchPool = undefined;
  });
  const fixture = async () => {
    const study = getStudyConfig();
    const created = await createSession({ study, state: createModeratorState(study), consentVersion: null, consentLocale: null, consentedAt: null });
    sessions.push(created.sessionId);
    hashes.push(createHash("sha256").update(created.entryToken).digest("hex"));
    return created;
  };
  it("requires explicit export scope, defaults to dry-run, and writes the canonical operator snapshot only for that session", async () => {
    const session = await fixture();
    await fixture();
    const output = await mkdtemp(join(tmpdir(), "survey-storage-export-"));
    directories.push(output);
    await expect(run(process.execPath, ["scripts/export-sessions.mjs"])).rejects.toMatchObject({ code: 1 });
    const args = ["scripts/export-sessions.mjs", "--session-id", session.sessionId, "--output", output];
    const dry = await run(process.execPath, args);
    expect(JSON.parse(dry.stdout)).toMatchObject({ mode: "dry-run", matched: 1, eligible: 1, exported: 0 });
    expect(await readdir(output)).toEqual([]);
    const written = await run(process.execPath, [...args, "--write"]);
    expect(JSON.parse(written.stdout)).toMatchObject({ matched: 1, exported: 1 });
    const paths = await readdir(output);
    expect(paths).toHaveLength(1);
    const text = await readFile(join(output, paths[0]), "utf8");
    expect(text).not.toContain(session.entryToken);
    expect(JSON.parse(text)).toMatchObject({ snapshotAudience: "operator", studySnapshot: getStudyConfig() });
    await expect(run(process.execPath, [...args, "--write"])).rejects.toMatchObject({ code: 1 });
  });
  it("does not export expired data and erases only the named expired synthetic session after explicit apply", async () => {
    const expired = await fixture();
    const active = await fixture();
    await getPool().query("UPDATE research_sessions SET created_at = NOW() - INTERVAL '3651 days' WHERE id = $1", [expired.sessionId]);
    const inspected = await run(process.execPath, ["scripts/manage-session-data.mjs", "--session-id", expired.sessionId]);
    expect(JSON.parse(inspected.stdout)).toMatchObject({ mode: "dry-run", expired: true, databaseErased: false });
    const exportDry = await run(process.execPath, ["scripts/export-sessions.mjs", "--session-id", expired.sessionId]);
    expect(JSON.parse(exportDry.stdout)).toMatchObject({ eligible: 0, expired: 1, exported: 0 });
    await expect(run(process.execPath, ["scripts/manage-session-data.mjs", "--session-id", active.sessionId, "--apply"])).rejects.toMatchObject({ code: 1 });
    const applied = await run(process.execPath, ["scripts/manage-session-data.mjs", "--session-id", expired.sessionId, "--apply"]);
    expect(JSON.parse(applied.stdout)).toMatchObject({ databaseErased: true, localExportsRemoved: false });
    await expect(getSessionByToken(expired.entryToken)).rejects.toMatchObject({ code: "session_deleted" });
    expect((await getSessionByToken(active.entryToken))?.id).toBe(active.sessionId);
  });
});
