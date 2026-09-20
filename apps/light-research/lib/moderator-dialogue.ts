import { acceptPlannedReply, categoryExamplesAllowed, resolvedReplyField, type AppliedTurn } from "./moderator-state";
import { evaluateTurn, ProviderError, type ProviderTurnInput } from "./moderator-provider";
import type { ModeratorAssessment } from "./conversation-types";

// The second pass writes the already selected move; it cannot reinterpret the
// saved answer, consume budgets again, or change evidence and routing.
export const resolvePlannedReply = async (input: ProviderTurnInput, applied: AppliedTurn, assessment: ModeratorAssessment, recentPrompts: string[], evaluate = evaluateTurn) => {
  if (applied.displayedReply || !applied.state.activeAnchorId) return;
  // Diagnostic payloads contain only fixed reason codes, never model wording,
  // participant text, field values, or source evidence. Observers cannot break
  // an otherwise valid interview turn.
  const reportRejection = (phase: "initial_wording" | "selected_move_wording") => {
    try {
      input.onWordingDiagnostic?.({ phase, category: "wording_rejected", reason: applied.replyRejection ?? "unknown_validation_failure" });
    } catch { /* Best-effort diagnostics must not change interview behavior. */ }
  };
  reportRejection("initial_wording");
  const rejectionReason = applied.replyRejection ?? "unknown_validation_failure";
  const move = applied.state.activeMove!;
  const fieldId = resolvedReplyField(input.study, applied.state);
  const allowCategoryExamples = categoryExamplesAllowed(input.study, applied);
  const exampleFeedback = allowCategoryExamples
    ? "If examples help, place them only in a short declarative sentence ending with a full stop, BEFORE the open question. The final question must contain no examples and must not ask which of those. Do not suggest a preference, reason, judgment, or price answer"
    : "no example answers, no suggested alternatives";
  const wording = await evaluate({ ...input,
    selectedMove: { action: applied.serverAction, anchorId: move.anchorId, fieldId, allowCategoryExamples, kind: move.kind, language: applied.state.activeLanguage, wordingFeedback: `The previous candidate failed validation: ${rejectionReason}. Write fresh wording for the selected action in the selected language: one open question total, ${exampleFeedback}, no praise, no repetition of earlier interviewer wording. Explain the research intent declaratively if clarification is needed; do not add a second question.` },
  });
  if (!acceptPlannedReply(input.study, applied, wording, recentPrompts)) {
    reportRejection("selected_move_wording");
    throw new ProviderError("invalid_response", "The AI reply did not satisfy the selected interview move; retry is available.");
  }
  assessment.replyGeneration = { candidateReply: wording.candidateReply, candidateAnchorId: wording.candidateAnchorId ?? null, candidateFieldId: wording.candidateFieldId ?? null, provider: wording.provider, model: wording.model, promptVersion: wording.promptVersion };
};
