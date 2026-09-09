import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as legacyRestore, POST as restore } from "@/app/api/study/session/route";
import { POST as exportRoute } from "@/app/api/study/export/route";
import { POST as withdraw } from "@/app/api/study/delete/route";
import { POST as pause } from "@/app/api/study/pause/route";
import { createSession, getPool, getSessionByToken } from "@/lib/storage";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";

describe.skipIf(process.env.SURVEY_DB_INTEGRATION !== "1")("token API with real local PostgreSQL", () => {
  const ids: string[] = [];
  const hashes: string[] = [];
  afterAll(async () => {
    if (ids.length) await getPool().query("DELETE FROM research_sessions WHERE id = ANY($1::uuid[])", [ids]);
    if (hashes.length) await getPool().query("DELETE FROM research_erasure_tombstones WHERE token_hash = ANY($1::text[])", [hashes]);
    if (globalThis.__researchPool) await getPool().end();
    globalThis.__researchPool = undefined;
  });
  const fixture = async () => {
    const study = structuredClone(getStudyConfig());
    study.claims.push({ id: "private_api_claim", text: "INTERNAL-API-CLAIM", source: "/Users/private/API-SOURCE.md", status: "internal_only" });
    const created = await createSession({ study, state: createModeratorState(study), consentVersion: null, consentLocale: null, consentedAt: null });
    ids.push(created.sessionId);
    hashes.push(createHash("sha256").update(created.entryToken).digest("hex"));
    return created;
  };
  const request = (entryToken: string) => new Request("http://localhost/api/study/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryToken }) });

  it("restores only through a JSON POST, without echoing the bearer token", async () => {
    const created = await fixture();
    const legacy = await legacyRestore();
    expect(legacy.status).toBe(405);
    expect(legacy.headers.get("allow")).toBe("POST");
    const result = await restore(request(created.entryToken));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toContain(created.entryToken);
    const invalid = await restore(new Request("http://localhost/api/study/session", { method: "POST", body: "not JSON" }));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps paused sessions exportable and removable with participant-safe snapshot content", async () => {
    const created = await fixture();
    expect((await pause(request(created.entryToken))).status).toBe(200);
    const exported = await exportRoute(request(created.entryToken));
    expect(exported.status).toBe(200);
    const body = await exported.text();
    expect(body).not.toContain("INTERNAL-API-CLAIM");
    expect(body).not.toContain("/Users/private/");
    expect(body).not.toContain(created.entryToken);
    expect((await withdraw(request(created.entryToken))).status).toBe(200);
    expect((await withdraw(request(created.entryToken))).status).toBe(200);
    const restored = await restore(request(created.entryToken));
    expect(restored.status).toBe(410);
    expect(await restored.json()).toMatchObject({ error: "session_deleted" });
    expect((await exportRoute(request(created.entryToken))).status).toBe(410);
  });

  it("returns an actionable expiry status and still allows withdrawal", async () => {
    const created = await fixture();
    await getPool().query("UPDATE research_sessions SET created_at = NOW() - INTERVAL '3651 days' WHERE id = $1", [created.sessionId]);
    for (const route of [restore, exportRoute, pause]) {
      const result = await route(request(created.entryToken));
      expect(result.status).toBe(410);
      expect(await result.json()).toMatchObject({ error: "session_expired" });
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
    expect((await withdraw(request(created.entryToken))).status).toBe(200);
  });

  it("does not allow a different token to export or erase an existing session", async () => {
    const created = await fixture();
    const wrong = "x".repeat(43);
    expect((await exportRoute(request(wrong))).status).toBe(404);
    expect((await withdraw(request(wrong))).status).toBe(404);
    expect((await getSessionByToken(created.entryToken))?.id).toBe(created.sessionId);
  });
});
