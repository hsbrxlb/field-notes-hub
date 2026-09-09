import { describe, expect, it } from "vitest";
import { resolveModelSnapshot, sessionExportSchemaVersion } from "@/lib/storage";
import { getStudyConfig } from "@/lib/study-config";

describe("session export compatibility", () => {
  it("preserves legacy and v2 source schema identity", () => {
    expect(sessionExportSchemaVersion({ schemaVersion: "moderator-1.0" })).toBe("1.0");
    expect(sessionExportSchemaVersion({ schemaVersion: "moderator-2.0" })).toBe("2.0");
    expect(sessionExportSchemaVersion({})).toBe("1.0");
  });

  it("records the deterministic model for mock sessions", () => {
    expect(resolveModelSnapshot(getStudyConfig(), "mock", "ignored-model")).toEqual({
      provider: "mock",
      model: "deterministic-controlled-autonomy-v2",
    });
  });
});
