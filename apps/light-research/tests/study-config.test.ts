import { describe, expect, it } from "vitest";
import { getPublicStudyConfig, getStudyConfig, toPublicStudyConfig } from "@/lib/study-config";
import { studyManifestSchema } from "@/lib/study-schema";

describe("study manifest", () => {
  it("parses the generated manifest", () => {
    expect(getStudyConfig().schemaVersion).toBe("2.0");
    expect(getStudyConfig().study.languagePolicy).toMatchObject({
      entryLanguage: "en",
      autoReplyLanguage: true,
      preserveOriginal: true,
    });
  });

  it("does not expose model configuration or claim sources", () => {
    const publicConfig = getPublicStudyConfig() as unknown as Record<string, unknown>;
    expect(publicConfig.model).toBeUndefined();
    expect(JSON.stringify(publicConfig)).not.toContain("source");
  });

  it("rejects an anchor that references an internal claim", () => {
    const manifest = structuredClone(getStudyConfig());
    manifest.claims.push({ id: "internal_note", text: "Internal only", source: "fixture", status: "internal_only" });
    manifest.anchors[0].claimRefs.push("internal_note");
    expect(studyManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("does not serialize the internal research brief or future question skeleton to the browser", () => {
    const manifest = structuredClone(getStudyConfig());
    manifest.study.goal = "PRIVATE RESEARCH BRIEF";
    manifest.anchors[0].objective = "PRIVATE TOPIC LOGIC";
    manifest.claims.push({ id: "secret", text: "UNAPPROVED PRODUCT FACT", source: "/private/source", status: "internal_only" });
    const visible = JSON.stringify(toPublicStudyConfig(manifest));
    expect(visible).not.toMatch(/PRIVATE|UNAPPROVED|\/private\/source/);
    expect(toPublicStudyConfig(manifest).anchors[0]).toEqual({ id: manifest.anchors[0].id });
  });

  it("rejects unknown manifest keys and an invalid scale range", () => {
    const unknown = { ...structuredClone(getStudyConfig()), unexpected: true };
    expect(studyManifestSchema.safeParse(unknown).success).toBe(false);
    const invalidScale = structuredClone(getStudyConfig());
    invalidScale.anchors[0].input = { type: "scale", min: 5, max: 1 };
    expect(studyManifestSchema.safeParse(invalidScale).success).toBe(false);
  });
});
