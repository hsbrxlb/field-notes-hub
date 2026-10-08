import { describe, expect, it } from "vitest";
import { matchesExportSample } from "../lib/export-format.mjs";

describe("research export provenance boundary", () => {
  const real = { study_snapshot: { study: { sampleKind: "participant" } } };
  const test = { study_snapshot: { study: { sampleKind: "synthetic" } } };
  const unknown = { study_snapshot: null };
  it("excludes test and unknown records from participant selection without changing them", () => {
    const sessions = [real, test, unknown];
    expect(sessions.filter((record) => matchesExportSample(record, "participant"))).toEqual([real]);
    expect(sessions.filter((record) => matchesExportSample(record, "synthetic"))).toEqual([test]);
    expect(sessions.filter((record) => matchesExportSample(record, "all"))).toEqual(sessions);
    expect(test.study_snapshot.study.sampleKind).toBe("synthetic");
    expect(unknown.study_snapshot).toBe(null);
  });
});
