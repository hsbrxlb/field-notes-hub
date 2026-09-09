import { describe, expect, it } from "vitest";
import { validateInputPayload } from "@/lib/conversation-service";
import { createModeratorState } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { StudyAnchor } from "@/lib/study-schema";

describe("server-side study input validation", () => {
  const study = getStudyConfig();
  const state = createModeratorState(study);
  const base = study.anchors[0];

  it("rejects structured choices on a text question", () => {
    expect(() => validateInputPayload(base, state, { type: "text", selectedValues: ["forged"] })).toThrow(/Text questions/);
  });

  it("enforces declared single-choice options and allowOther", () => {
    const anchor = { ...base, input: { type: "single_choice", allowOther: false, options: [
      { id: "a", labels: { en: "A" } }, { id: "b", labels: { en: "B" } },
    ] } } as StudyAnchor;
    expect(() => validateInputPayload(anchor, state, { type: "single_choice", selectedValues: [] })).toThrow(/Choose/);
    expect(() => validateInputPayload(anchor, state, { type: "single_choice", selectedValues: ["a"], freeText: "forged" })).toThrow(/does not accept/);
    expect(() => validateInputPayload(anchor, state, { type: "single_choice", selectedValues: ["unknown"] })).toThrow(/not available/);
    expect(() => validateInputPayload(anchor, state, { type: "single_choice", selectedValues: ["a"] })).not.toThrow();
  });

  it("requires exactly one in-range scale value", () => {
    const anchor = { ...base, input: { type: "scale", min: 1, max: 5 } } as StudyAnchor;
    expect(() => validateInputPayload(anchor, state, { type: "scale", selectedValues: [] })).toThrow(/exactly one/);
    expect(() => validateInputPayload(anchor, state, { type: "scale", selectedValues: ["2", "3"] })).toThrow(/exactly one/);
    expect(() => validateInputPayload(anchor, state, { type: "scale", selectedValues: ["9"] })).toThrow(/outside/);
    expect(() => validateInputPayload(anchor, state, { type: "scale", selectedValues: ["4"] })).not.toThrow();
  });

  it("accepts text for checkpoint and final-audit gaps on choice or scale anchors", () => {
    for (const input of [{ type: "single_choice", allowOther: false, options: [] }, { type: "scale", min: 1, max: 5 }] as StudyAnchor["input"][]) {
      const anchor = { ...base, input };
      for (const kind of ["checkpoint_gap", "final_audit"] as const) {
        const gapState = { ...state, activeMove: { kind, anchorId: base.id } };
        expect(() => validateInputPayload(anchor, gapState, { type: "text", freeText: "The installation cost matters." })).not.toThrow();
      }
    }
  });

  it("uses text for an immediate probe after a structured answer", () => {
    const anchor = { ...base, input: { type: "single_choice", allowOther: false, options: [] } } as StudyAnchor;
    const probeState = { ...state, activeMove: { kind: "anchor" as const, anchorId: base.id, responseType: "text" as const } };
    expect(() => validateInputPayload(anchor, probeState, { type: "text", freeText: "It would fit my budget." })).not.toThrow();
    expect(() => validateInputPayload(anchor, probeState, { type: "single_choice", selectedValues: ["a"] })).toThrow(/does not match/);
  });
});
