import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";

it.each([
  ["export-sessions.mjs", []],
  ["manage-session-data.mjs", ["--apply"]],
])("%s refuses to select a database implicitly", (script, flags) => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["scripts/" + script, "--session-id", "00000000-0000-0000-0000-000000000000", ...flags], { env, encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("DATABASE_URL is required.");
});
