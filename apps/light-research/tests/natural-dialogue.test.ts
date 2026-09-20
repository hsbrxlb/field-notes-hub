import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { getStudyConfig } from "@/lib/study-config";
import { applyAssessment, createModeratorState, resolvedReplyField, semanticSimilarity } from "@/lib/moderator-state";
import { resolvePlannedReply } from "@/lib/moderator-dialogue";
import { evaluateTurn, type ProviderTurnInput } from "@/lib/moderator-provider";
import { questionPolicyViolation } from "@/lib/question-policy";
import type { ConversationTurn, ModeratorAssessment } from "@/lib/conversation-types";

const study = getStudyConfig();
const first = study.anchors[0], next = study.anchors[1];
const base = (overrides: Partial<ModeratorAssessment> = {}): ModeratorAssessment => ({
  candidateAnchorId: first.id, candidateFieldId: null, participantIntent: "gibberish", understoodFacts: [],
  topicCoverage: { anchorId: first.id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "No usable answer." },
  unresolvedPoints: [], contradictions: [], replyLanguage: "en", replyLanguageConfidence: "high", nextAction: "soft_redirect",
  actionReason: "The participant input does not answer this topic.", candidateReply: "I couldn't understand those digits. Which vehicle do you usually drive?",
  provider: "mock", model: "test", promptVersion: study.model.promptVersion, ...overrides,
});
const input = (): ProviderTurnInput => ({ study, anchor: first, state: createModeratorState(study), turnId: "synthetic-1", rawText: "123123123", inputPayload: { type: "text" }, transcript: [] });
const plan = (i: ProviderTurnInput, assessment: ModeratorAssessment) => applyAssessment({ study, previous: i.state, assessment, turnId: i.turnId, turnIndex: 1, rawText: i.rawText, recentPrompts: [i.state.activePrompt!] });

it("keeps canonical English entry and accepts natural contextual repair without a wording whitelist", async () => {
  const i = input(), a = base(), applied = plan(i, a);
  expect(i.state.activePrompt).toBe(first.question);
  expect(applied.displayedReply).toBe(a.candidateReply);
  expect(applied.acceptedUpdates).toEqual([]);
  const generate = vi.fn();
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
  expect(generate).not.toHaveBeenCalled();
});

it("uses the selected current topic for one wording pass and ignores second-pass evidence", async () => {
  const i = input(); i.state.repairCount = study.moderation.maxRepairTurns;
  const a = base({ nextAction: "defer_gap", candidateAnchorId: next.id }), applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.state.activeAnchorId).toBe(first.id);
  expect(applied.displayedReply).toBeNull();
  const wording = base({ nextAction: "soft_redirect", candidateAnchorId: first.id, candidateReply: "Those digits do not tell me about your driving. What do you use the vehicle for after sunset?", understoodFacts: [{ fieldId: first.requiredFields[0], value: "FORGED", confidence: "high", correction: false, evidenceTurnIds: [i.turnId] }] });
  const generate = vi.fn().mockResolvedValue(wording), factsBefore = structuredClone(applied.state.facts);
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].selectedMove).toMatchObject({ action: "soft_redirect", anchorId: first.id, fieldId: null, language: "en" });
  expect(applied.displayedReply).toBe(wording.candidateReply);
  expect(applied.state.facts).toEqual(factsBefore);
  expect(applied.state.revision).toBe(1);
  expect(a.replyGeneration?.candidateReply).toBe(wording.candidateReply);
  expect(a.candidateReply).not.toBe(wording.candidateReply);
});

it.each([
  { candidateReply: "What is your phone number?", candidateAnchorId: first.id },
  { candidateReply: "Which car do you drive? Where do you use it?", candidateAnchorId: first.id },
  { candidateReply: "What was your visibility like?", candidateAnchorId: next.id },
  { candidateReply: "What do you use it for, like driving to work or running errands?", candidateAnchorId: first.id },
])("fails explicitly after one invalid regeneration without fixed substitution: $candidateReply", async (bad) => {
  const i = input(), a = base({ candidateReply: "What is your phone number?" }), applied = plan(i, a);
  const generate = vi.fn().mockResolvedValue(base(bad));
  await expect(resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(applied.displayedReply).toBeNull();
  expect(i.state.revision).toBe(0);
});

it("rejects a model proposal to defer a repeated non-answer without consuming research probes", () => {
  const i = input(); i.state.repairCount = 1;
  const a = base({ nextAction: "defer_gap", candidateAnchorId: next.id, candidateReply: "I still couldn't follow that. How was visibility on your most recent nighttime drive?" });
  const applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.displayedReply).toBeNull();
  expect(applied.state.totalProbeCount).toBe(0);
  expect(applied.state.completedAnchors).not.toContain(first.id);
});

it("keeps consecutive gibberish on the current topic even when the model proposes a research probe", () => {
  const i = input(); i.state.lastParticipantIntent = "gibberish"; i.state.repairCount = 1;
  const a = base({ nextAction: "probe_now" }), applied = plan(i, a);
  expect(applied.serverAction).toBe("soft_redirect");
  expect(applied.state.activeAnchorId).toBe(first.id);
  expect(applied.displayedReply).toBeNull();
  expect(applied.state.totalProbeCount).toBe(0);
});

it("keeps a medium-confidence entity unresolved when its field is still ambiguous", () => {
  const i = input(); i.rawText = "Tesla Y, ask me later to confirm the model";
  const fieldId = first.requiredFields[0];
  const a = base({ participantIntent: "partial_answer", nextAction: "defer_gap", understoodFacts: [{ fieldId, value: "Tesla Y", confidence: "medium", correction: false, evidenceTurnIds: [i.turnId] }], unresolvedPoints: [{ anchorId: first.id, fieldId, question: "Which vehicle model did you mean?", reason: "Model remains ambiguous", priority: "important", uncertainty: 0.7, answerability: 0.3, evidenceTurnIds: [i.turnId] }] });
  const applied = plan(i, a);
  expect(applied.state.facts[fieldId].status).toBe("candidate");
  expect(applied.state.facts[fieldId].rawValue).toBe(i.rawText);
});

it("regenerates a short Chinese clarification with one question and no suggested answers", async () => {
  const i = input(); i.rawText = "你说啥";
  const a = base({ participantIntent: "asks_clarification", nextAction: "soft_redirect", replyLanguage: "zh-CN", candidateReply: "我是想问，你天黑以后开车出去，通常是去做什么？比如上班、买东西，还是办别的事？" });
  const applied = plan(i, a);
  expect(applied.displayedReply).toBeNull();
  const wording = base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", replyLanguage: "zh-CN", candidateReply: "我想了解的是夜间用车的目的。天黑以后，你通常开车去做什么？" });
  const generate = vi.fn().mockResolvedValue(wording);
  await resolvePlannedReply(i, applied, a, [], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].selectedMove).toMatchObject({ action: "immediate_clarify", language: "zh-CN", anchorId: first.id });
  expect(generate.mock.calls[0][0].selectedMove.wordingFeedback).toContain("no example answers");
  expect(applied.displayedReply).toBe(wording.candidateReply);
  expect(applied.state.activeAnchorId).toBe(first.id);
});

it.each([
  ["gibberish", "soft_redirect"],
  ["asks_clarification", "immediate_clarify"],
  ["frustration", "repair_conversation"],
] as const)("accepts naturally different same-objective wording for %s", async (participantIntent, nextAction) => {
  const i = input();
  i.state.activePrompt = "I couldn't understand your last message because it was just numbers. Could you tell me in your own words what you usually do with your vehicle after dark?";
  const candidateReply = "I couldn't understand those numbers in your last message. Could you tell me in your own words what you usually do with your vehicle after dark?";
  expect(semanticSimilarity(i.state.activePrompt, candidateReply)).toBeGreaterThanOrEqual(0.82);
  expect(semanticSimilarity(i.state.activePrompt, candidateReply)).toBeLessThan(0.97);
  const a = base({ participantIntent, nextAction, candidateReply });
  const applied = plan(i, a);
  expect(applied.displayedReply).toBe(candidateReply);
  expect(applied.state.activeAnchorId).toBe(first.id);
  const generate = vi.fn();
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt], generate);
  expect(generate).not.toHaveBeenCalled();
});

it.each(["exact", "punctuation"])("rejects %s copies during repair and keeps regeneration bounded", async (variant) => {
  const i = input(); i.state.activePrompt = base().candidateReply;
  const candidateReply = variant === "exact" ? i.state.activePrompt : i.state.activePrompt.replace("?", " ?").toUpperCase();
  const a = base({ candidateReply }), applied = plan(i, a);
  expect(applied.displayedReply).toBeNull();
  const generate = vi.fn().mockResolvedValue(a);
  await expect(resolvePlannedReply(i, applied, a, [i.state.activePrompt], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(applied.displayedReply).toBeNull();
});


it.each([
  ["action_mismatch", { nextAction: "defer_gap" }],
  ["scope_mismatch", { candidateAnchorId: next.id }],
  ["question_count", { candidateReply: "Which vehicle do you drive? What do you use it for?" }],
  ["personal_identifier_request", { candidateReply: "What is your phone number?" }],
  ["suggested_answers", { candidateReply: "What do you use it for, like shopping or commuting?" }],
  ["leading_premise", { candidateReply: "Would you say better lights would help?" }],
  ["praise", { candidateReply: "Great answer. Which vehicle do you drive?" }],
  ["generic_prompt", { candidateReply: "Could you tell me more?" }],
  ["repeated_wording", { candidateReply: first.question }],
] as const)("passes the precise %s rejection to the single wording pass", async (reason, overrides) => {
  const i = input(), diagnostics = vi.fn();
  i.onWordingDiagnostic = diagnostics;
  const a = base(overrides), applied = plan(i, a);
  expect(applied.replyRejection).toBe(reason);
  const wording = base({ candidateReply: "What do you mainly use the vehicle for once the sun has set?" });
  const generate = vi.fn().mockResolvedValue(wording);
  await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].selectedMove.wordingFeedback).toContain(`failed validation: ${reason}.`);
  expect(diagnostics.mock.calls).toEqual([[{ phase: "initial_wording", category: "wording_rejected", reason }]]);
  expect(applied.replyRejection).toBeNull();
});

it("reports initial and second-pass rejection using codes only and keeps both attempts bounded", async () => {
  const i = input(), diagnostics = vi.fn(); i.onWordingDiagnostic = diagnostics;
  const a = base({ candidateReply: "What is your phone number?" }), applied = plan(i, a);
  const generate = vi.fn().mockResolvedValue(base({ candidateReply: "What do you drive? What do you use it for?" }));
  await expect(resolvePlannedReply(i, applied, a, [], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(diagnostics.mock.calls).toEqual([
    [{ phase: "initial_wording", category: "wording_rejected", reason: "personal_identifier_request" }],
    [{ phase: "selected_move_wording", category: "wording_rejected", reason: "question_count" }],
  ]);
  expect(JSON.stringify(diagnostics.mock.calls)).not.toContain(a.candidateReply);
  expect(JSON.stringify(diagnostics.mock.calls)).not.toContain(i.rawText);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(applied.displayedReply).toBeNull();
});

it("ignores diagnostic callback errors on both rejected passes", async () => {
  const i = input(); i.onWordingDiagnostic = vi.fn(() => { throw new Error("observer failure"); });
  const a = base({ candidateReply: "What is your phone number?" }), applied = plan(i, a);
  const generate = vi.fn().mockResolvedValue(a);
  await expect(resolvePlannedReply(i, applied, a, [], generate)).rejects.toMatchObject({ code: "invalid_response" });
  expect(i.onWordingDiagnostic).toHaveBeenCalledTimes(2);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("does not let a throwing diagnostic callback or successful rewriting change saved evidence or budgets", async () => {
  const i = input(); i.onWordingDiagnostic = () => { throw new Error("observer failure"); };
  const a = base({ candidateReply: "What is your phone number?" }), applied = plan(i, a);
  const before = structuredClone(applied);
  const wording = base({ candidateReply: "What do you mainly use the vehicle for once the sun has set?", understoodFacts: [{ fieldId: "vehicle_model", value: "FORGED", confidence: "high", correction: false, evidenceTurnIds: [i.turnId] }], unresolvedPoints: [{ anchorId: first.id, fieldId: "vehicle_model", question: "Which model?", reason: "FORGED GAP", priority: "critical", uncertainty: 1, answerability: 1, evidenceTurnIds: [i.turnId] }] });
  await resolvePlannedReply(i, applied, a, [], vi.fn().mockResolvedValue(wording));
  expect({ ...applied.state, activePrompt: before.state.activePrompt }).toEqual(before.state);
  expect(applied.acceptedUpdates).toEqual(before.acceptedUpdates);
  expect(applied.rejectedUpdates).toEqual(before.rejectedUpdates);
  expect(applied.serverAction).toBe(before.serverAction);
  expect(applied.displayedReply).toBe(wording.candidateReply);
});

it("reports language mismatch independently of otherwise valid wording", async () => {
  const i = input(); i.rawText = "你说啥";
  const a = base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", replyLanguage: "zh-CN", candidateReply: "What do you use your vehicle for at night?" });
  const applied = plan(i, a);
  expect(applied.replyRejection).toBe("language_mismatch");
});

it("keeps a Chinese leading substantive premise blocked even with an ordinary connector", () => {
  const i = input(); i.rawText = "你说啥";
  const a = base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", replyLanguage: "zh-CN", candidateReply: "也就是说，你需要更亮的灯，对吗？" });
  const applied = plan(i, a);
  expect(applied.replyRejection).toBe("leading_premise");
  expect(applied.displayedReply).toBeNull();
});

describe("focused follow-up target survives conversation repair", () => {
  const recentInput = () => {
    const i = input(); i.anchor = next;
    i.state.activeAnchorId = next.id;
    i.state.activeMove = { kind: "anchor", anchorId: next.id };
    i.state.activePrompt = next.question;
    i.rawText = "I could see clearly.";
    return i;
  };
  const focusedProbe = (i: ProviderTurnInput) => base({
    participantIntent: "partial_answer", nextAction: "probe_now", candidateAnchorId: next.id, candidateFieldId: "recent_location",
    candidateReply: "What type of road were you driving on?",
    topicCoverage: { anchorId: next.id, status: "partial", coveredFieldIds: ["visibility_problem"], evidenceTurnIds: [i.turnId], note: "Road type remains unclear." },
    understoodFacts: [{ fieldId: "visibility_problem", value: "Could see clearly", confidence: "high", correction: false, evidenceTurnIds: [i.turnId] }],
    unresolvedPoints: [{ anchorId: next.id, fieldId: "recent_location", question: "What type of road was it?", reason: "Road type remains unclear", priority: "important", uncertainty: 0.8, answerability: 0.9, evidenceTurnIds: [i.turnId] }],
  });

  it("persists an initial probe target through repeated clarification and rejects another field", async () => {
    let i = recentInput();
    let applied = plan(i, focusedProbe(i));
    expect(applied.serverAction).toBe("probe_now");
    expect(applied.state.activeMove).toMatchObject({ responseType: "text", fieldId: "recent_location" });
    expect(resolvedReplyField(study, applied.state)).toBe("recent_location");
    const facts = structuredClone(applied.state.facts);
    for (const [index, rawText] of ["What do you mean?", "On the road."].entries()) {
      i = { ...i, state: applied.state, turnId: `repair-${index}`, rawText };
      const a = base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", candidateAnchorId: next.id, candidateFieldId: "visibility_problem", candidateReply: "What could you not see clearly?" });
      applied = plan(i, a);
      expect(applied.replyRejection).toBe("scope_mismatch");
      const wording = base({ ...a, candidateFieldId: "recent_location", candidateReply: index === 0 ? "I mean the road itself. What type of road were you on?" : "Which kind of road were you driving along that evening?" });
      const generate = vi.fn().mockResolvedValue(wording);
      await resolvePlannedReply(i, applied, a, [i.state.activePrompt!], generate);
      expect(generate.mock.calls[0][0].selectedMove.fieldId).toBe("recent_location");
      expect(applied.state.activeMove?.fieldId).toBe("recent_location");
      expect(applied.state.facts).toEqual(facts);
      expect(applied.state.totalProbeCount).toBe(1);
    }
  });

  it("restores a legacy text probe only when exactly one current-anchor field is still missing", () => {
    const i = recentInput(); const prior = plan(i, focusedProbe(i));
    delete prior.state.activeMove!.fieldId;
    expect(resolvedReplyField(study, prior.state)).toBe("recent_location");
    const restored = plan({ ...i, state: prior.state }, base({ participantIntent: "asks_clarification", nextAction: "immediate_clarify", candidateAnchorId: next.id, candidateFieldId: "recent_location", candidateReply: "What sort of road was it?" }));
    expect(restored.state.activeMove?.fieldId).toBe("recent_location");
    expect(restored.displayedReply).toBeTruthy();

    // A competing gap must never be guessed away or ranked into a repair target.
    const ambiguous = structuredClone(prior.state);
    ambiguous.pendingGaps.push({ ...ambiguous.pendingGaps[0], id: "second-gap", fieldId: "user_action" });
    expect(resolvedReplyField(study, ambiguous)).toBeNull();
    const ordinaryAnchor = structuredClone(prior.state);
    delete ordinaryAnchor.activeMove!.responseType;
    expect(resolvedReplyField(study, ordinaryAnchor)).toBeNull();
    const alreadyKnown = structuredClone(prior.state);
    alreadyKnown.pendingGaps[0].fieldId = "visibility_problem";
    expect(resolvedReplyField(study, alreadyKnown)).toBeNull();
  });

  it("keeps gapId scheduling authoritative and excludes unrelated anchors from legacy inference", () => {
    const i = recentInput(); const prior = plan(i, focusedProbe(i));
    delete prior.state.activeMove!.fieldId;
    prior.state.pendingGaps.push({ ...prior.state.pendingGaps[0], id: "unrelated", anchorId: first.id, fieldId: "vehicle_model" });
    expect(resolvedReplyField(study, prior.state)).toBe("recent_location");
    prior.state.activeMove = { kind: "checkpoint_gap", anchorId: next.id, gapId: prior.state.pendingGaps[0].id, fieldId: "visibility_problem" };
    expect(resolvedReplyField(study, prior.state)).toBe("recent_location");
    prior.state.activeMove.gapId = "unrelated";
    expect(resolvedReplyField(study, prior.state)).toBeNull();
  });
});

describe("objective category examples are a scoped clarification permission", () => {
  const categoryInput = (anchorId = "recent_experience", fieldId = "recent_location") => {
    const i = input();
    i.study = structuredClone(study);
    Object.assign(i.study.fields.find((field) => field.id === "recent_location")!, { clarificationStyle: "objective_categories" });
    i.anchor = i.study.anchors.find((anchor) => anchor.id === anchorId)!;
    i.state.activeAnchorId = anchorId;
    i.state.activeMove = { kind: "anchor", anchorId, responseType: "text", fieldId };
    i.state.activePrompt = i.anchor.question;
    i.rawText = "What do you mean?";
    return i;
  };
  const assess = (i: ProviderTurnInput, candidateReply: string, overrides: Partial<ModeratorAssessment> = {}) => base({
    participantIntent: "asks_clarification", nextAction: "immediate_clarify", candidateAnchorId: i.anchor.id,
    candidateFieldId: i.state.activeMove!.fieldId, candidateReply,
    topicCoverage: { anchorId: i.anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: [], note: "Clarify the same objective field." },
    ...overrides,
  });
  const apply = (i: ProviderTurnInput, a: ModeratorAssessment) => applyAssessment({ study: i.study, previous: i.state, assessment: a, turnId: i.turnId, turnIndex: 1, rawText: i.rawText, recentPrompts: [] });

  it.each([
    ["en", "I mean the type of road, for example a city street or a country road. What type were you on?"],
    ["en", "I mean road types such as city streets and country roads. What type were you on?"],
    ["zh-CN", "我问的是道路类型，比如城市道路或乡间道路。那次你开的是哪类道路？"],
    ["es", "Me refiero al tipo de vía, por ejemplo una calle urbana o una carretera rural. ¿Por qué tipo de vía conducías?"],
  ])("accepts neutral objective-category explanation in %s", (replyLanguage, candidateReply) => {
    const i = categoryInput();
    const applied = apply(i, assess(i, candidateReply, { replyLanguage }));
    expect(applied.serverAction).toBe("immediate_clarify");
    expect(applied.replyRejection).toBeNull();
    expect(applied.displayedReply).toBe(candidateReply);
  });

  it.each([
    ["en", "What type of road was it, such as a city street or highway?"],
    ["zh-CN", "你走的是哪类道路，比如市区街道还是高速？"],
    ["es", "Me refiero al tipo de vía, por ejemplo una calle urbana o una carretera rural. ¿Cuál de esos describe la vía?"],
  ])("rewrites category lists into an open question in %s", (replyLanguage, candidateReply) => {
    const i = categoryInput();
    expect(apply(i, assess(i, candidateReply, { replyLanguage })).replyRejection).toBe("suggested_answers");
  });

  it.each([
    ["price", "price_fit", "For example, you could consider the cheapest tier. Which would you consider?"],
    ["priorities", "priority", "For example, brightness could matter most. What matters to you?"],
  ])("keeps example answers blocked for unflagged %s fields", (anchorId, fieldId, candidateReply) => {
    const i = categoryInput(anchorId, fieldId);
    expect(apply(i, assess(i, candidateReply)).replyRejection).toBe("suggested_answers");
  });

  it.each([
    ["answer", "immediate_clarify"],
    ["gibberish", "soft_redirect"],
  ] as const)("does not permit unsolicited examples for %s", (participantIntent, nextAction) => {
    const i = categoryInput();
    const applied = apply(i, assess(i, "For example, a city street is a road type. What type were you on?", { participantIntent, nextAction }));
    expect(applied.replyRejection).toBe("suggested_answers");
  });

  it.each([
    ["en", "For example, is it because you need better lights?", "leading_premise"],
    ["en", "For example, what is your street address?", "personal_identifier_request"],
    ["en", "For example, you should buy better lights. What do you think?", "persuasion"],
    ["en", "For example, a city street. Which road type? Was it dark?", "question_count"],
    ["zh-CN", "也就是说，你需要更亮的灯，比如加装车灯，对吗？", "leading_premise"],
    ["es", "Por ejemplo, ¿no crees que necesitas luces nuevas?", "leading_premise"],
  ])("retains %s safety checks even when categories are permitted", (replyLanguage, candidateReply, reason) => {
    const i = categoryInput();
    expect(apply(i, assess(i, candidateReply, { replyLanguage })).replyRejection).toBe(reason);
  });

  it("passes the scoped permission and explanatory feedback to only the existing bounded wording pass", async () => {
    const i = categoryInput();
    const a = assess(i, "What type of road? Was it dark?"), applied = apply(i, a);
    const wording = assess(i, "Road type means, for example, a city street or a country road. What type were you on?");
    const generate = vi.fn().mockResolvedValue(wording);
    await resolvePlannedReply(i, applied, a, [], generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].selectedMove).toMatchObject({ fieldId: "recent_location", allowCategoryExamples: true });
    expect(generate.mock.calls[0][0].selectedMove.wordingFeedback).toContain("declarative sentence");
    expect(generate.mock.calls[0][0].selectedMove.wordingFeedback).not.toContain("no example answers");
    expect(applied.displayedReply).toBe(wording.candidateReply);
  });
});

const records: unknown[] = [];
describe.skipIf(process.env.SURVEY_REAL_NATURAL !== "1")("real sequential natural dialogue", () => {
  afterAll(() => { mkdirSync("output", { recursive: true }); writeFileSync("output/natural-dialogue-real.json", JSON.stringify({ scope: "One synthetic sequential provider/state/wording run; no HTTP or database acceptance", studyVersion: study.study.version, policyVersion: study.moderation.policyVersion, promptVersion: study.model.promptVersion, records }, null, 2)); });
  it("understands gibberish, repeated non-answer, then substantive Chinese normally", async () => {
    let state = createModeratorState(study);
    const transcript: ConversationTurn[] = [];
    for (const [index, rawText] of ["123123123", "1212", "你说啥", "上次晚上在乡间道路开车，原车灯能看清楚，没有看不清的地方，也不需要额外装灯。"].entries()) {
      const previous = structuredClone(state), anchor = study.anchors.find((item) => item.id === state.activeAnchorId)!;
      const turnId = `synthetic-natural-${index + 1}`;
      const i: ProviderTurnInput = { study, anchor, state, turnId, rawText, inputPayload: { type: "text", freeText: rawText }, transcript };
      const a = await evaluateTurn(i);
      const recentPrompts = [...transcript.map((turn) => turn.localizedPrompt), state.activePrompt!];
      const applied = applyAssessment({ study, previous: state, assessment: a, turnId, turnIndex: index + 1, rawText, recentPrompts });
      try {
        await resolvePlannedReply(i, applied, a, recentPrompts, async (selected) => {
          const wording = await evaluateTurn(selected);
          records.push({ phase: "wording", selectedMove: selected.selectedMove, wording });
          return wording;
        });
      } catch (error) {
        records.push({ phase: "failed", rawText, assessment: a, serverAction: applied.serverAction, nextAnchorId: applied.state.activeAnchorId });
        throw error;
      }
      records.push({ rawText, anchorId: anchor.id, assessment: a, serverAction: applied.serverAction, displayedReply: applied.displayedReply, nextAnchorId: applied.state.activeAnchorId, facts: applied.state.facts, riskFlags: applied.state.riskFlags });
      expect(a.provider).toBe("deepseek");
      expect(applied.displayedReply).toBeTruthy();
      expect(questionPolicyViolation(applied.displayedReply!)).toBeNull();
      expect(applied.displayedReply!.match(/[?？؟]/g)).toHaveLength(1);
      if (index < 2) { expect(a.participantIntent).toBe("gibberish"); expect(applied.acceptedUpdates).toHaveLength(0); }
      if (index === 1) { expect(applied.state.activeAnchorId).toBe(first.id); expect(applied.serverAction).toBe("soft_redirect"); }
      if (index === 2) { expect(a.participantIntent).toBe("asks_clarification"); expect(applied.state.activeAnchorId).toBe(first.id); expect(applied.state.activeLanguage).toBe("zh-CN"); }
      if (index === 3) { expect(a.participantIntent).toBe("answer"); expect(applied.state.activeLanguage).toBe("zh-CN"); expect(applied.displayedReply).toMatch(/\p{Script=Han}/u); }
      transcript.push({ id: turnId, turnIndex: index + 1, anchorId: anchor.id, moveKind: previous.activeMove!.kind, canonicalPrompt: anchor.question, localizedPrompt: previous.activePrompt!, rawText, inputPayload: i.inputPayload, replyLanguage: applied.state.activeLanguage, participantIntent: a.participantIntent, topicCoverage: a.topicCoverage, unresolvedPoints: a.unresolvedPoints, contradictions: a.contradictions, extractedFields: applied.acceptedUpdates, rejectedFieldUpdates: applied.rejectedUpdates, aiSuggestedAction: a.nextAction, serverAction: applied.serverAction, actionReason: applied.actionReason, candidateReply: a.candidateReply, displayedReply: applied.displayedReply, provider: a.provider, model: a.model, promptVersion: a.promptVersion, policyVersion: study.moderation.policyVersion });
      state = applied.state;
    }
  }, 180000);
});
