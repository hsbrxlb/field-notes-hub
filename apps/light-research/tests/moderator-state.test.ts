import { describe, expect, it } from "vitest";
import { applyAssessment, createModeratorState, semanticSimilarity } from "@/lib/moderator-state";
import { getStudyConfig } from "@/lib/study-config";
import type { ModeratorAssessment } from "@/lib/conversation-types";

const makeAssessment = (overrides: Partial<ModeratorAssessment> = {}): ModeratorAssessment => {
  const study = getStudyConfig();
  const anchor = study.anchors[0];
  const fieldId = anchor.requiredFields[0];
  return {
    participantIntent: "answer",
    understoodFacts: [{ fieldId, value: "A real example", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
    topicCoverage: { anchorId: anchor.id, status: "covered", coveredFieldIds: [fieldId], evidenceTurnIds: ["turn-1"], note: "Direct evidence covers the topic." },
    unresolvedPoints: [],
    contradictions: [],
    replyLanguage: "en",
    replyLanguageConfidence: "high",
    nextAction: "advance",
    actionReason: "The answer covers the current topic.",
    candidateReply: study.anchors[1]?.question ?? "Thank you.",
    provider: "mock",
    model: "deterministic-controlled-autonomy-v2",
    promptVersion: study.model.promptVersion,
    ...overrides,
  };
};

const apply = (state: ReturnType<typeof createModeratorState>, assessment: ModeratorAssessment, index = 1, forceAdvance = false) => {
  const study = getStudyConfig();
  return applyAssessment({
    study,
    previous: state,
    assessment,
    turnId: `turn-${index}`,
    turnIndex: index,
    rawText: "participant answer",
    recentPrompts: [state.activePrompt ?? ""],
    forceAdvance,
  });
};

describe("controlled-autonomy moderator policy", () => {
  it("caps clarification and redirection repair loops", () => {
    const study = getStudyConfig();
    for (const participantIntent of ["asks_clarification", "off_topic"] as const) {
      const state = createModeratorState(study);
      state.repairCount = study.moderation.maxRepairTurns;
      const result = apply(state, makeAssessment({ participantIntent, understoodFacts: [], topicCoverage: { anchorId: state.activeAnchorId!, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "No evidence." }, nextAction: "immediate_clarify", candidateReply: "Can you explain what happened?" }));
      expect(result.state.activeAnchorId).not.toBe(state.activeAnchorId);
      expect(result.state.repairCount).toBe(study.moderation.maxRepairTurns);
    }
  });

  it("requires regeneration of an English gap clarification when the participant uses Chinese", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.activeLanguage = "zh-CN";
    state.activeMove = { kind: "checkpoint_gap", anchorId: state.activeAnchorId!, gapId: "synthetic-gap" };
    const result = applyAssessment({ study, previous: state, assessment: makeAssessment({ participantIntent: "asks_clarification", understoodFacts: [], replyLanguage: "zh-CN", candidateReply: "Can you tell me a little more?" }), turnId: "repair", turnIndex: 1, rawText: "这个问题什么意思", recentPrompts: [] });
    expect(result.displayedReply).toBeNull(); // wrong language requires AI regeneration
  });

  it("advances after a clearly covered answer", () => {
    const study = getStudyConfig();
    const result = apply(createModeratorState(study), makeAssessment());
    expect(result.serverAction).toBe("advance");
    expect(result.state.activeAnchorId).toBe(study.anchors[1]?.id ?? null);
    expect(result.state.facts[study.anchors[0].requiredFields[0]].evidenceTurnIds).toContain("turn-1");
  });

  it("defers an ordinary Tesla-model confirmation and moves on", () => {
    const study = getStudyConfig();
    const anchor = study.anchors[0];
    const assessment = makeAssessment({
      understoodFacts: [{ fieldId: anchor.requiredFields[0], value: "Tesla Y", confidence: "low", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [anchor.requiredFields[0]], evidenceTurnIds: ["turn-1"], note: "Vehicle is a usable candidate." },
      unresolvedPoints: [{
        anchorId: anchor.id,
        fieldId: anchor.requiredFields[0],
        question: "You wrote ‘Tesla Y’. Do you mean Tesla Model Y?",
        reason: "The entity remains a candidate.",
        priority: "important",
        uncertainty: 0.7,
        answerability: 0.9,
        evidenceTurnIds: ["turn-1"],
      }],
      nextAction: "defer_gap",
      actionReason: "The candidate does not block the next topic.",
    });
    const result = apply(createModeratorState(study), assessment);
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.activeAnchorId).toBe(study.anchors[1]?.id ?? null);
    expect(result.state.pendingGaps.some((gap) => gap.fieldId === anchor.requiredFields[0])).toBe(true);
    expect(result.state.pendingGaps.every((gap) => gap.anchorId === anchor.id)).toBe(true);
    expect(result.state.pendingGaps[0].status).toBe("pending");
  });

  it("repairs 'already answered' without spending probe budget", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const fieldId = study.anchors[0].requiredFields[0];
    state.facts[fieldId] = {
      factId: "fact-1", fieldId, value: "Known", rawValue: "Known", confidence: 0.9, status: "confirmed",
      source: "model", sourceTurnId: "old-turn", evidenceTurnIds: ["old-turn"], updatedAt: new Date().toISOString(),
    };
    const result = apply(state, makeAssessment({
      participantIntent: "already_answered",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "covered", coveredFieldIds: [fieldId], evidenceTurnIds: ["old-turn"], note: "Earlier evidence covers the topic." },
      nextAction: "repair_conversation",
      candidateReply: `You're right, you already answered that. ${study.anchors[1]?.question ?? "What comes next?"}`,
      actionReason: "The participant points to an answer already in the transcript.",
    }));
    expect(result.serverAction).toBe("repair_conversation");
    expect(result.state.totalProbeCount).toBe(0);
    expect(result.state.activeAnchorId).toBe(study.anchors[1]?.id ?? null);
  });

  it("explains a misunderstood question without consuming probe budget", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const result = apply(state, makeAssessment({
      participantIntent: "asks_clarification",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Participant asks what the question means." },
      nextAction: "immediate_clarify",
      candidateReply: `${study.anchors[0].clarification} ${study.anchors[0].question}`,
      actionReason: "The participant asks for clarification.",
    }));
    expect(result.serverAction).toBe("immediate_clarify");
    expect(result.state.activeAnchorId).toBe(study.anchors[0].id);
    expect(result.state.totalProbeCount).toBe(0);
    expect(result.state.repairCount).toBe(1);
  });

  it("treats a short concrete clue as evidence and allows one focused probe", () => {
    const study = getStudyConfig();
    const anchor = study.anchors.find((item) => item.id === "recent_experience")!;
    const supportingField = study.fields.find((field) => field.id === "recent_location")!;
    const state = createModeratorState(study);
    state.activeAnchorId = anchor.id;
    state.activeMove = { kind: "anchor", anchorId: anchor.id };
    state.activePrompt = anchor.question;
    const result = apply(state, makeAssessment({
      participantIntent: "partial_answer",
      understoodFacts: [{ fieldId: supportingField.id, value: "Too dark in the woods", confidence: "medium", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [supportingField.id], evidenceTurnIds: ["turn-1"], note: "The short answer contains a real setting and problem clue." },
      unresolvedPoints: [{ anchorId: anchor.id, fieldId: "visibility_problem", question: "What was hardest to see at that moment?", reason: "The affected task is decision-relevant.", priority: "important", uncertainty: 0.7, answerability: 0.9, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now",
      candidateReply: "What, if anything, was difficult to see in the woods?",
      candidateAnchorId: anchor.id,
      candidateFieldId: "visibility_problem",
      actionReason: "One concrete visibility detail would improve the evidence.",
    }));
    expect(result.serverAction).toBe("probe_now");
    expect(result.state.totalProbeCount).toBe(1);
    expect(result.prompt).toBe("What, if anything, was difficult to see in the woods?");
  });

  it("defers a probe when the global budget is exhausted", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.totalProbeCount = study.moderation.maxTotalProbes;
    const result = apply(state, makeAssessment({
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-1"], note: "A detail is missing." },
      unresolvedPoints: [{ anchorId: study.anchors[0].id, fieldId: null, question: "What happened next?", reason: "Useful but not blocking.", priority: "important", uncertainty: 0.7, answerability: 0.8, evidenceTurnIds: ["turn-1"] }],
      nextAction: "probe_now",
      candidateReply: "What happened next?",
    }));
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.activeAnchorId).toBe(study.anchors[1]?.id ?? null);
  });

  it("resolves an older pending gap when a later answer supplies its field", () => {
    const study = getStudyConfig();
    const first = study.anchors[0];
    const deferred = apply(createModeratorState(study), makeAssessment({
      understoodFacts: [],
      topicCoverage: { anchorId: first.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-1"], note: "A field remains open." },
      unresolvedPoints: [{ anchorId: first.id, fieldId: first.requiredFields[0], question: "What happened?", reason: "Missing evidence.", priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["turn-1"] }],
      nextAction: "defer_gap",
    }));
    const second = study.anchors[1];
    const supplied = apply(deferred.state, makeAssessment({
      understoodFacts: [
        { fieldId: first.requiredFields[0], value: "Later evidence", confidence: "high", correction: false, evidenceTurnIds: ["turn-2"] },
        { fieldId: second.requiredFields[0], value: "Current evidence", confidence: "high", correction: false, evidenceTurnIds: ["turn-2"] },
      ],
      topicCoverage: { anchorId: second.id, status: "covered", coveredFieldIds: second.requiredFields, evidenceTurnIds: ["turn-2"], note: "The current topic is covered." },
      candidateReply: "Thank you.",
    }), 2);
    expect(supplied.state.pendingGaps[0].status).toBe("resolved");
    expect(supplied.state.pendingGaps[0].resolvedTurnId).toBe("turn-2");
  });

  it("rejects unsafe fact updates during a prompt attack", () => {
    const study = getStudyConfig();
    const fieldId = study.anchors[0].requiredFields[0];
    const result = apply(createModeratorState(study), makeAssessment({
      participantIntent: "prompt_attack",
      understoodFacts: [{ fieldId, value: "invented", confidence: "high", correction: false, evidenceTurnIds: ["turn-1"] }],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Unsafe input." },
      nextAction: "soft_redirect",
      candidateReply: study.anchors[0].question,
      actionReason: "The participant attempted to alter the interview instructions.",
    }));
    expect(result.acceptedUpdates).toEqual([]);
    expect(result.rejectedUpdates[0]?.fieldId).toBe(fieldId);
    expect(result.state.facts[fieldId]).toBeUndefined();
  });

  it("keeps a typed stop distinct from skipping to the next topic", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const result = apply(state, makeAssessment({
      participantIntent: "stop",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Participant asked to stop." },
      nextAction: "defer_gap",
      candidateReply: "The interview will stop.",
      actionReason: "The participant explicitly asked to stop.",
    }));
    expect(result.serverAction).toBe("stop");
    expect(result.state.activeAnchorId).toBe(study.anchors[0].id);
    expect(result.state.activePrompt).toBeNull();
    expect(result.displayedReply).toContain("stopped");
  });

  it("honors typed stop during a checkpoint gap", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.activeMove = { kind: "checkpoint_gap", anchorId: study.anchors[0].id, gapId: "gap-stop", resumeAnchorId: study.anchors[1]?.id ?? null };
    state.pendingGaps.push({
      id: "gap-stop", anchorId: study.anchors[0].id, fieldId: null, question: "What happened?", reason: "Open gap.",
      priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old"], status: "asked",
      createdTurnId: "old", createdTurnIndex: 0, attempts: 1, score: 6,
    });
    const result = apply(state, makeAssessment({
      participantIntent: "stop",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Participant asked to stop." },
      nextAction: "defer_gap",
      actionReason: "The participant explicitly asked to stop.",
    }));
    expect(result.serverAction).toBe("stop");
    expect(result.state.activePrompt).toBeNull();
  });

  it("requires regeneration for a scheduled gap in the correct language", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.activeLanguage = "zh-CN";
    state.anchorsSinceCheckpoint = study.moderation.checkpointEveryAnchors - 1;
    const second = study.anchors[1];
    state.pendingGaps.push({
      id: "gap-language", anchorId: second.id, fieldId: second.requiredFields[0] ?? null,
      question: "What detail should be confirmed?", reason: "Language mismatch fixture.", priority: "important",
      uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old"], status: "pending",
      createdTurnId: "old", createdTurnIndex: 0, attempts: 0, score: 6,
    });
    const result = apply(state, makeAssessment({ replyLanguage: "zh-CN" }));
    expect(result.state.activeMove?.kind).toBe("checkpoint_gap");
    expect(result.prompt).toBeNull(); // regenerate for the selected gap and language
  });

  it("rejects gaps invented for a future topic that has not been asked", () => {
    const study = getStudyConfig();
    const future = study.anchors[2];
    const result = apply(createModeratorState(study), makeAssessment({
      unresolvedPoints: [{
        anchorId: future.id,
        fieldId: future.requiredFields[0] ?? null,
        question: future.question,
        reason: "The future topic has not been asked yet.",
        priority: "important",
        uncertainty: 0.8,
        answerability: 0.8,
        evidenceTurnIds: [],
      }],
    }));
    expect(result.state.pendingGaps.every((gap) => gap.anchorId === study.anchors[0].id)).toBe(true);
    expect(result.state.riskFlags).toContain("rejected_future_topic_gap");
  });

  it("rejects an unresolved field that does not belong to its topic", () => {
    const study = getStudyConfig();
    const current = study.anchors[0];
    const foreignField = study.anchors[1].requiredFields[0];
    const result = apply(createModeratorState(study), makeAssessment({
      unresolvedPoints: [{
        anchorId: current.id,
        fieldId: foreignField,
        question: "What about a field owned by another topic?",
        reason: "Mismatched model output.",
        priority: "critical",
        uncertainty: 0.8,
        answerability: 0.8,
        evidenceTurnIds: ["turn-1"],
      }],
    }));
    expect(result.state.pendingGaps.every((gap) => study.anchors[0].requiredFields.includes(gap.fieldId || ""))).toBe(true);
    expect(result.state.riskFlags).toContain("rejected_mismatched_gap_field");
  });

  it("keeps a later-answer request eligible for the final audit", () => {
    const study = getStudyConfig();
    const final = study.anchors.at(-1)!;
    const state = createModeratorState(study);
    state.completedAnchors = study.anchors.slice(0, -1).map((anchor) => anchor.id);
    state.activeAnchorId = final.id;
    state.activeMove = { kind: "anchor", anchorId: final.id };
    state.activePrompt = final.questionLocales?.["zh-CN"] ?? final.question;
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: final.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-later"], note: "Participant asks to answer later." },
        unresolvedPoints: [{ anchorId: final.id, fieldId: final.requiredFields[0], question: "你最希望先改什么？", reason: "Participant asked for a later reminder.", priority: "critical", uncertainty: 1, answerability: 0, evidenceTurnIds: ["turn-later"] }],
        nextAction: "defer_gap",
        replyLanguage: "zh-CN",
        candidateReply: "你最希望先改什么？",
      }),
      turnId: "turn-later",
      turnIndex: 7,
      rawText: "我现在没想好，快结束时再问我一次，我应该能回答。",
      recentPrompts: [state.activePrompt],
    });
    expect(result.state.riskFlags).toContain("normalized_later_answerability");
    expect(result.state.activeMove?.kind).toBe("final_audit");
    expect(result.state.finalAuditQuestions).toBe(1);
  });

  it("does not immediately re-ask a gap when the participant requests later", () => {
    const study = getStudyConfig();
    const final = study.anchors.at(-1)!;
    const price = study.anchors.find((anchor) => anchor.id === "price")!;
    const state = createModeratorState(study);
    state.completedAnchors = study.anchors.slice(0, -1).map((anchor) => anchor.id);
    state.activeAnchorId = final.id;
    state.activeMove = { kind: "anchor", anchorId: final.id };
    state.activePrompt = final.questionLocales?.["zh-CN"] ?? final.question;
    state.pendingGaps.push({
      id: "gap-price-first", anchorId: price.id, fieldId: "price_reason", question: "为什么这个价格适合你？",
      reason: "Price reason remains open.", priority: "important", uncertainty: 0.6, answerability: 0.8,
      evidenceTurnIds: ["turn-price"], status: "pending", createdTurnId: "turn-price", createdTurnIndex: 6,
      attempts: 0, score: 6,
    });
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: final.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-later-probe"], note: "Participant asks to answer later." },
        unresolvedPoints: [{ anchorId: final.id, fieldId: final.requiredFields[0], question: "你最希望先改什么？", reason: "Answer deferred.", priority: "critical", uncertainty: 0.9, answerability: 0.7, evidenceTurnIds: ["turn-later-probe"] }],
        nextAction: "probe_now",
        replyLanguage: "zh-CN",
        candidateReply: "你现在最希望先改什么？",
      }),
      turnId: "turn-later-probe",
      turnIndex: 7,
      rawText: "快结束时再问我一次，我应该能回答。",
      recentPrompts: [state.activePrompt],
    });
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.riskFlags).toContain("participant_requested_later_probe");
    expect(result.state.activeMove?.kind).toBe("final_audit");
    expect(result.state.activeAnchorId).toBe(price.id);
  });

  it("rejects a leading price probe without replacing its wording", () => {
    const study = getStudyConfig();
    const price = study.anchors.find((anchor) => anchor.id === "price")!;
    const state = createModeratorState(study);
    state.completedAnchors = study.anchors.slice(0, study.anchors.indexOf(price)).map((anchor) => anchor.id);
    state.activeAnchorId = price.id;
    state.activeMove = { kind: "anchor", anchorId: price.id };
    state.activeLanguage = "zh-CN";
    state.activePrompt = price.questionLocales?.["zh-CN"] ?? price.question;
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: price.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-price-leading"], note: "Price reason remains open." },
        unresolvedPoints: [{ anchorId: price.id, fieldId: "price_reason", question: "这个价格是不是超出预期价值？", reason: "Leading model gap.", priority: "important", uncertainty: 0.7, answerability: 0.8, evidenceTurnIds: ["turn-price-leading"] }],
        nextAction: "probe_now",
        replyLanguage: "zh-CN",
        candidateReply: "这个价格是不是超出预期价值？",
      }),
      turnId: "turn-price-leading",
      turnIndex: 6,
      rawText: "我选了小尺寸。",
      recentPrompts: [state.activePrompt],
    });
    expect(result.prompt).toBeNull(); // unsafe phrasing must not be laundered
  });

  it("does not interrupt the current topic with a probe for an older topic", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const first = study.anchors[0];
    const second = study.anchors[1];
    state.completedAnchors = [first.id];
    state.activeAnchorId = second.id;
    state.activeMove = { kind: "anchor", anchorId: second.id };
    state.activePrompt = second.question;
    const currentField = second.requiredFields[0];
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [{ fieldId: currentField, value: "Current topic evidence", confidence: "high", correction: false, evidenceTurnIds: ["turn-cross-topic"] }],
        topicCoverage: { anchorId: second.id, status: "covered", coveredFieldIds: [currentField], evidenceTurnIds: ["turn-cross-topic"], note: "The current topic is covered." },
        unresolvedPoints: [{ anchorId: first.id, fieldId: first.requiredFields[0], question: "What about the older topic?", reason: "Older gap.", priority: "critical", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["turn-cross-topic"] }],
        nextAction: "probe_now",
        candidateReply: "What about the older topic?",
      }),
      turnId: "turn-cross-topic",
      turnIndex: 2,
      rawText: "Current topic evidence",
      recentPrompts: [second.question],
    });
    expect(result.serverAction).toBe("advance");
    expect(result.state.riskFlags).toContain("rejected_cross_topic_probe");
    expect(result.state.activeAnchorId).toBe(study.anchors[2].id);
    expect(result.prompt).toBeNull();
  });

  it("selects the next topic and requires new wording after deferring a gap", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.activeLanguage = "zh-CN";
    const anchor = study.anchors[0];
    const next = study.anchors[1];
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-defer"], note: "A gap remains." },
        unresolvedPoints: [{ anchorId: anchor.id, fieldId: anchor.requiredFields[0], question: "旧问题还没有回答？", reason: "Current gap.", priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["turn-defer"] }],
        nextAction: "defer_gap",
        replyLanguage: "zh-CN",
        candidateReply: "旧问题还没有回答？",
      }),
      turnId: "turn-defer",
      turnIndex: 1,
      rawText: "这个细节我现在还想不起来。",
      recentPrompts: [anchor.question],
    });
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.activeAnchorId).toBe(next.id);
    expect(result.prompt).toBeNull(); // server chose a different topic
  });

  it("defers instead of repeating the same focused probe", () => {
    const study = getStudyConfig();
    const anchor = study.anchors[0];
    const next = study.anchors[1];
    const state = createModeratorState(study);
    state.activeLanguage = "zh-CN";
    state.activePrompt = anchor.followUpQuestions![anchor.requiredFields[0]]["zh-CN"];
    state.pendingGaps.push({
      id: "gap-repeat", anchorId: anchor.id, fieldId: anchor.requiredFields[0] ?? null,
      question: state.activePrompt, reason: "Current gap.", priority: "important", uncertainty: 0.8,
      answerability: 0.8, evidenceTurnIds: ["turn-old"], status: "pending", createdTurnId: "turn-old",
      createdTurnIndex: 0, attempts: 0, score: 6,
    });
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-repeat"], note: "The gap remains." },
        unresolvedPoints: [{ anchorId: anchor.id, fieldId: anchor.requiredFields[0] ?? null, question: state.activePrompt, reason: "Current gap.", priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["turn-repeat"] }],
        nextAction: "probe_now",
        replyLanguage: "zh-CN",
        candidateReply: state.activePrompt,
      }),
      turnId: "turn-repeat",
      turnIndex: 1,
      rawText: "这个细节我还是想不起来。",
      recentPrompts: [state.activePrompt],
    });
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.riskFlags).toContain("repeated_probe_deferred");
    expect(result.state.activeAnchorId).toBe(next.id);
    expect(result.prompt).toBeNull(); // server chose a different topic
  });

  it("does not use a checkpoint to immediately re-ask the gap just deferred", () => {
    const study = getStudyConfig();
    const anchor = study.anchors[1];
    const next = study.anchors[2];
    const state = createModeratorState(study);
    state.completedAnchors = [study.anchors[0].id];
    state.activeAnchorId = anchor.id;
    state.activeMove = { kind: "anchor", anchorId: anchor.id };
    state.activeLanguage = "zh-CN";
    state.activePrompt = anchor.questionLocales?.["zh-CN"] ?? anchor.question;
    state.anchorsSinceCheckpoint = study.moderation.checkpointEveryAnchors - 1;
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({
        understoodFacts: [],
        topicCoverage: { anchorId: anchor.id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-deferred-checkpoint"], note: "A gap remains." },
        unresolvedPoints: [{ anchorId: anchor.id, fieldId: anchor.requiredFields[1] ?? anchor.requiredFields[0], question: "刚才哪里看不清？", reason: "Current gap.", priority: "critical", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["turn-deferred-checkpoint"] }],
        nextAction: "defer_gap",
        replyLanguage: "zh-CN",
        candidateReply: "刚才哪里看不清？",
      }),
      turnId: "turn-deferred-checkpoint",
      turnIndex: 2,
      rawText: "这个细节先放一下。",
      recentPrompts: [state.activePrompt],
    });
    expect(result.serverAction).toBe("defer_gap");
    expect(result.state.activeMove).toEqual({ kind: "anchor", anchorId: next.id });
    expect(result.prompt).toBeNull();
  });

  it("uses substantive Chinese input instead of a stale model language", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({ replyLanguage: "es", replyLanguageConfidence: "high", candidateReply: study.anchors[1].question }),
      turnId: "turn-language",
      turnIndex: 1,
      rawText: "我晚上主要开车去露营。",
      recentPrompts: [state.activePrompt ?? ""],
    });
    expect(result.state.activeLanguage).toBe("zh-CN");
    expect(result.prompt).toBeNull();
  });

  it("does not duplicate an asked final-audit gap echoed by the model", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const gap = {
      id: "gap-final", anchorId: study.anchors[0].id, fieldId: null, question: "What happened?", reason: "Open final gap.",
      priority: "important" as const, uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old"], status: "asked" as const,
      createdTurnId: "old", createdTurnIndex: 0, askedTurnId: "ask-turn", attempts: 1, score: 6,
    };
    state.pendingGaps.push(gap);
    state.activeMove = { kind: "final_audit", anchorId: gap.anchorId, gapId: gap.id, resumeAnchorId: null };
    state.activePrompt = gap.question;
    const result = apply(state, makeAssessment({
      understoodFacts: [],
      topicCoverage: { anchorId: gap.anchorId, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-1"], note: "Gap remains unresolved." },
      unresolvedPoints: [{ anchorId: gap.anchorId, fieldId: null, question: "Can you describe the missing detail from that situation?", reason: gap.reason, priority: gap.priority, uncertainty: gap.uncertainty, answerability: gap.answerability, evidenceTurnIds: ["turn-1"] }],
      nextAction: "defer_gap",
      candidateReply: "Thank you.",
    }));
    expect(result.state.pendingGaps).toHaveLength(1);
    expect(result.state.pendingGaps[0].status).toBe("unresolved");
    expect(result.serverAction).toBe("complete");
    expect(result.displayedReply).toBe(study.completion.messages.en);
    expect(result.displayedReply).not.toMatch(/[?？؟]/);
  });

  it("marks an all-skipped required interview as completed with evidence gaps", () => {
    const study = getStudyConfig();
    let state = createModeratorState(study);
    let turnIndex = 1;
    while (state.activeAnchorId && state.activeMove?.kind === "anchor" && turnIndex <= study.anchors.length + 1) {
      const anchor = study.anchors.find((item) => item.id === state.activeAnchorId)!;
      const result = applyAssessment({
        study,
        previous: state,
        assessment: makeAssessment({
          participantIntent: "skip",
          understoodFacts: [],
          topicCoverage: { anchorId: anchor.id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [`skip-${turnIndex}`], note: "Participant skipped." },
          unresolvedPoints: [],
          nextAction: "defer_gap",
          actionReason: "Participant skipped the topic.",
        }),
        turnId: `skip-${turnIndex}`,
        turnIndex,
        rawText: "Skipped",
        recentPrompts: [state.activePrompt ?? ""],
        forceAdvance: true,
      });
      state = result.state;
      turnIndex += 1;
    }
    expect(state.activeAnchorId).toBeNull();
    expect(state.completionQuality).toBe("with_evidence_gaps");
    expect(state.pendingGaps.some((gap) => gap.status === "unresolved")).toBe(true);
  });

  it("ends an audit gap when its repair budget is exhausted", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.repairCount = study.moderation.maxRepairTurns;
    state.pendingGaps.push({
      id: "gap-repair-budget", anchorId: study.anchors[0].id, fieldId: null, question: "What happened?", reason: "Open gap.",
      priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old"], status: "asked",
      createdTurnId: "old", createdTurnIndex: 0, askedTurnId: "ask-turn", attempts: 1, score: 6,
    });
    state.activeMove = { kind: "final_audit", anchorId: study.anchors[0].id, gapId: "gap-repair-budget", resumeAnchorId: null };
    const result = apply(state, makeAssessment({
      participantIntent: "asks_clarification",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Participant asks again." },
      nextAction: "immediate_clarify",
    }));
    expect(result.serverAction).toBe("complete");
    expect(result.state.pendingGaps[0].status).toBe("unresolved");
    expect(result.state.riskFlags).toContain(`repair_budget_exhausted:${study.anchors[0].id}`);
  });

  it("selects the next topic for regeneration after checkpoint repair exhaustion", () => {
    const study = getStudyConfig();
    const next = study.anchors[1];
    const state = createModeratorState(study);
    state.repairCount = study.moderation.maxRepairTurns;
    state.pendingGaps.push({
      id: "gap-checkpoint-budget", anchorId: study.anchors[0].id, fieldId: null, question: "What happened?", reason: "Open gap.",
      priority: "important", uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old"], status: "asked",
      createdTurnId: "old", createdTurnIndex: 0, askedTurnId: "ask-turn", attempts: 1, score: 6,
    });
    state.activeMove = { kind: "checkpoint_gap", anchorId: study.anchors[0].id, gapId: "gap-checkpoint-budget", resumeAnchorId: next.id };
    const result = apply(state, makeAssessment({
      participantIntent: "asks_clarification",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Participant asks again." },
      nextAction: "immediate_clarify",
      candidateReply: "Can I explain the old gap again?",
    }));
    expect(result.state.activeAnchorId).toBe(next.id);
    expect(result.state.activeMove).toEqual({ kind: "anchor", anchorId: next.id });
    expect(result.prompt).toBeNull();
  });

  it("resumes a checkpoint on the next topic instead of displaying the old gap again", () => {
    const study = getStudyConfig();
    const next = study.anchors[1];
    const state = createModeratorState(study);
    state.activeLanguage = "zh-CN";
    state.pendingGaps.push({
      id: "gap-checkpoint-resume", anchorId: study.anchors[0].id, fieldId: null,
      question: "旧主题还缺什么？", reason: "Open gap.", priority: "important", uncertainty: 0.8,
      answerability: 0.8, evidenceTurnIds: ["old"], status: "asked", createdTurnId: "old",
      createdTurnIndex: 0, askedTurnId: "ask-turn", attempts: 1, score: 6,
    });
    state.activeMove = { kind: "checkpoint_gap", anchorId: study.anchors[0].id, gapId: "gap-checkpoint-resume", resumeAnchorId: next.id };
    state.activePrompt = "旧主题还缺什么？";
    const result = apply(state, makeAssessment({
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "partial", coveredFieldIds: [], evidenceTurnIds: ["turn-1"], note: "The old gap remains unresolved." },
      nextAction: "defer_gap",
      replyLanguage: "zh-CN",
      candidateReply: "好的，之后我会再问旧主题还缺什么？",
    }));
    expect(result.state.activeAnchorId).toBe(next.id);
    expect(result.prompt).toBeNull();
  });

  it("does not use a repeated candidate reply as the fallback", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    const current = state.activePrompt!;
    const result = applyAssessment({
      study,
      previous: state,
      assessment: makeAssessment({ candidateReply: current }),
      turnId: "turn-1",
      turnIndex: 1,
      rawText: "clear answer",
      recentPrompts: [current],
    });
    expect(result.prompt).not.toBe(current);
    expect(result.prompt).toBeNull();
  });

  it("rejects an unreviewed multi-question candidate instead of laundering its first question", () => {
    const study = getStudyConfig();
    const result = apply(createModeratorState(study), makeAssessment({
      candidateReply: "Okay. What happened next? What did you do after that?",
      candidateAnchorId: getStudyConfig().anchors[1]?.id,
    }));
    expect(result.prompt).toBeNull();
  });

  it("rejects a multi-question pending-gap candidate without truncating it", () => {
    const study = getStudyConfig();
    const state = createModeratorState(study);
    state.pendingGaps.push({
      id: "gap-existing", anchorId: study.anchors[0].id, fieldId: null,
      question: "What happened? For example, where were you?", reason: "Missing context.", priority: "important",
      uncertainty: 0.8, answerability: 0.8, evidenceTurnIds: ["old-turn"], status: "pending",
      createdTurnId: "old-turn", createdTurnIndex: 0, attempts: 0, score: 6,
    });
    const result = apply(state, makeAssessment({
      participantIntent: "already_answered",
      understoodFacts: [],
      topicCoverage: { anchorId: study.anchors[0].id, status: "missing", coveredFieldIds: [], evidenceTurnIds: [], note: "Current topic remains open." },
      nextAction: "repair_conversation",
      candidateReply: "For example, where were you? What happened?",
    }));
    expect(result.prompt).toBeNull();
  });

  it("detects semantic repetition across punctuation and spacing", () => {
    expect(semanticSimilarity("What vehicle do you use after dark?", "What vehicle do you use after dark ?")).toBeGreaterThan(0.9);
  });
});
