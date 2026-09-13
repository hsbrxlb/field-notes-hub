import { describe, expect, it } from "vitest";
import { startRequestSchema, turnRequestSchema } from "@/lib/api-schemas";

describe("survey entry request", () => {
  it("rejects a legacy skip intent before processing a turn", () => {
    const turn = { entryToken: "synthetic-test-token-only", clientAttemptId: "00000000-0000-4000-8000-000000000001", stateRevision: 0, anchorId: "first-question", text: "skip", inputPayload: { type: "text" } };
    expect(turnRequestSchema.safeParse({ ...turn, intent: "skip" }).success).toBe(false);
    expect(turnRequestSchema.safeParse({ ...turn, intent: "answer" }).success).toBe(true);
  });
  it("accepts the default direct-entry request without consent fields", () => {
    expect(startRequestSchema.parse({})).toEqual({});
  });

  it("still accepts optional consent evidence when a project explicitly enables it", () => {
    expect(startRequestSchema.parse({ consentVersion: "explicit-v1", consentLocale: "en" })).toEqual({
      consentVersion: "explicit-v1",
      consentLocale: "en",
    });
  });
});
