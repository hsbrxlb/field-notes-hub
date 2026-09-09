import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState, isAnchorCovered } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import { studyManifestSchema } from "@/lib/study-schema";
import type { ModeratorAssessment } from "@/lib/conversation-types";
import purchase from "./fixtures/purchase-round3.study.json";
import generic from "./fixtures/generic-round3.study.json";

const studies = [getStudyConfig(), studyManifestSchema.parse(purchase)];
const examples = [
  ["en", "What is the exact street address of your home where this lighting problem happened?", "It was dark near my home."],
  ["zh-CN", "请告诉我你家的详细地址和具体门牌好吗？", "那次是在家附近。"],
  ["es", "¿Cuál es la dirección exacta de tu casa?", "Fue cerca de mi casa."],
  ["en", "Wouldn't brighter OEDRO lights make that location much safer?", "I did not have any difficulty."],
  ["zh-CN", "难道买新灯不会让你更安全吗？", "现在的灯没有什么问题。"],
  ["es", "¿No sería mejor comprar para estar más seguro?", "No quiero comprar nada."],
  // Additional privacy and persuasion probes beyond the original examples.
  ["en", "What are the coordinates of the place where you sleep?", "A synthetic setting."],
  ["en", "What makes this brand the right choice for everybody?", "A synthetic opinion."],
];

for (const study of studies) describe(`public question safety: ${study.study.id}`, () => {
  for (const mode of ["probe_now", "immediate_clarify", "advance", "gap_repair"] as const) {
    for (const [language, candidate, rawText] of examples) it(`${mode} rejects ${language}: ${candidate}`, () => {
      const anchor = study.anchors.find((item, index) => index > 0 && item.maxImmediateProbes > 0)!, fieldId = (anchor.evidenceFields ?? anchor.requiredFields)[0];
      const previous = createModeratorState(study);
      previous.activeAnchorId = anchor.id;
      previous.activeMove = { kind: mode === "gap_repair" ? "checkpoint_gap" : "anchor", anchorId: anchor.id, gapId: "gap-test", resumeAnchorId: study.anchors[study.anchors.indexOf(anchor) + 1].id };
      previous.activeLanguage = language;
      previous.activePrompt = anchor.question;
      const point = { anchorId: anchor.id, fieldId, question: candidate, reason: "Synthetic missing detail", priority: "critical" as const, uncertainty: 0.8, answerability: 0.9, evidenceTurnIds: ["synthetic-1"] };
      if (mode === "gap_repair") previous.pendingGaps = [{ ...point, id: "gap-test", status: "asked", createdTurnId: "old", createdTurnIndex: 0, attempts: 1, score: 9 }];
      const assessment: ModeratorAssessment = { participantIntent: mode === "immediate_clarify" || mode === "gap_repair" ? "asks_clarification" : "partial_answer", understoodFacts: [], topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: [], note: "Synthetic" }, unresolvedPoints: [point], contradictions: [], replyLanguage: language, replyLanguageConfidence: "high", nextAction: mode === "gap_repair" ? "immediate_clarify" : mode, actionReason: "Synthetic", candidateReply: candidate, candidateAnchorId: mode === "advance" ? study.anchors[study.anchors.indexOf(anchor) + 1].id : anchor.id, candidateFieldId: fieldId, provider: "mock", model: "fixture", promptVersion: study.model.promptVersion };
      const result = applyAssessment({ study, previous, assessment, turnId: "synthetic-1", turnIndex: 1, rawText, recentPrompts: [] });
      expect(result.displayedReply).toBeNull();
      expect(result.state.activePrompt).toBeNull(); // requires AI regeneration, never scripted substitution
      expect(result.acceptedUpdates).toHaveLength(0);
    });
  }
  it("accepts reviewed field text and spends one probe without inventing a fact", () => {
    const anchor = study.anchors.find((item, index) => index > 0 && item.maxImmediateProbes > 0)!, fieldId = (anchor.evidenceFields ?? anchor.requiredFields)[0];
    const previous = createModeratorState(study);
    previous.activeAnchorId = anchor.id; previous.activeMove = { kind: "anchor", anchorId: anchor.id };
    const candidate = anchor.followUpQuestions![fieldId].en;
    const assessment: ModeratorAssessment = { participantIntent: "partial_answer", understoodFacts: [], topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: [], note: "Synthetic" }, unresolvedPoints: [{ anchorId: anchor.id, fieldId, question: "An unreviewed hidden question?", reason: "Missing", priority: "critical", uncertainty: 1, answerability: 1, evidenceTurnIds: ["new"] }], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "probe_now", actionReason: "Synthetic", candidateReply: candidate, candidateAnchorId: anchor.id, candidateFieldId: fieldId, provider: "mock", model: "fixture", promptVersion: study.model.promptVersion };
    const result = applyAssessment({ study, previous, assessment, turnId: "new", turnIndex: 1, rawText: "  A broad setting.\n ", recentPrompts: [] });
    expect(result.displayedReply).toBe(candidate);
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.totalProbeCount).toBe(1);
    expect(result.acceptedUpdates).toHaveLength(0);
  });
  it("honors skipping even when a model proposes a private question", () => {
    const previous = createModeratorState(study), anchor = study.anchors[0];
    const a: ModeratorAssessment = { participantIntent: "skip", understoodFacts: [], topicCoverage: { anchorId: anchor.id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Skipped" }, unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "probe_now", actionReason: "Synthetic", candidateReply: examples[0][1], provider: "mock", model: "fixture", promptVersion: study.model.promptVersion };
    const r = applyAssessment({ study, previous, assessment: a, turnId: "skip", turnIndex: 1, rawText: "Skip this", recentPrompts: [] });
    expect(r.serverAction).toBe("skip"); expect(r.state.activeAnchorId).not.toBe(anchor.id);
    expect(r.state.pendingGaps.filter(g => g.anchorId === anchor.id).every(g => g.status === "unresolved")).toBe(true);
    expect(isAnchorCovered(study, r.state, anchor.id)).toBe(false);
  });
});

it.each(examples.slice(0, 6))("rejects unsafe authored copy in the manifest: %s %s", (_lang, question) => {
  const study = structuredClone(studies[0]); study.anchors[0].question = question;
  expect(studyManifestSchema.safeParse(study).success).toBe(false);
});

it("keeps the generic template topic-independent with versioned reviewed copy", () => {
  const template = studyManifestSchema.parse(generic);
  expect(template.study.id).toBe("generic-research-template");
  expect(template.model.promptVersion).toBe("interviewer-3.1-reviewed-questions"); // historical fixture stays unchanged
  expect(JSON.stringify(template)).not.toMatch(/OEDRO|vehicle_model|price_fit/);
  expect(createModeratorState(template).activePrompt).toBe(template.anchors[0].question);
});

it("provides Spanish checkout response labels as well as question copy", () => {
  for (const anchor of studies[1].anchors) {
    expect(anchor.questionLocales?.es).toBeTruthy();
    if (anchor.input.type === "single_choice" || anchor.input.type === "multiple_choice") for (const option of anchor.input.options) expect(option.labels.es).toBeTruthy();
    if (anchor.input.type === "scale") { expect(anchor.input.minLabels?.es).toBe("Nada seguro"); expect(anchor.input.maxLabels?.es).toBe("Muy seguro"); }
  }
});

it("replays the real Spanish negative-answer completion with reviewed Spanish copy", () => {
  const study = studies[1], anchor = study.anchors.at(-1)!;
  const state = createModeratorState(study); state.activeAnchorId = anchor.id; state.activeMove = { kind: "anchor", anchorId: anchor.id }; state.activeLanguage = "es";
  const a: ModeratorAssessment = { participantIntent: "answer", understoodFacts: [{ fieldId: "return_condition", value: "No change would make the participant reconsider; they do not need the product.", confidence: "high", correction: false, evidenceTurnIds: ["replay"] }], topicCoverage: { anchorId: anchor.id, status: "covered", coveredFieldIds: ["return_condition"], evidenceTurnIds: ["replay"], note: "Negative answer" }, unresolvedPoints: [], contradictions: [], replyLanguage: "es", replyLanguageConfidence: "high", nextAction: "complete", actionReason: "No change requested", candidateReply: "Gracias.", provider: "mock", model: "recorded-assessment-replay", promptVersion: study.model.promptVersion };
  const result = applyAssessment({ study, previous: state, assessment: a, turnId: "replay", turnIndex: 1, rawText: "No necesito el producto, aunque baje el precio.", recentPrompts: [] });
  expect(result.serverAction).toBe("complete");
  expect(result.displayedReply).toBe("Gracias. La entrevista ha terminado.");
});
