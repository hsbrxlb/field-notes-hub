import { describe, expect, it } from "vitest";
import { startRequestSchema } from "@/lib/api-schemas";

describe("survey entry request", () => {
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
