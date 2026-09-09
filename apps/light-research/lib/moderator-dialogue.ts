import { acceptPlannedReply, type AppliedTurn } from "./moderator-state";
import { evaluateTurn, ProviderError, type ProviderTurnInput } from "./moderator-provider";
import type { ModeratorAssessment } from "./conversation-types";

// The second pass writes the already selected move; it cannot reinterpret the
// saved answer, consume budgets again, or change evidence and routing.
export const resolvePlannedReply = async (input: ProviderTurnInput, applied: AppliedTurn, assessment: ModeratorAssessment, recentPrompts: string[], evaluate = evaluateTurn) => {
  if (applied.displayedReply || !applied.state.activeAnchorId) return;
  const move = applied.state.activeMove!;
  const gap = move.gapId ? applied.state.pendingGaps.find((item) => item.id === move.gapId) : applied.serverAction === "probe_now"
    ? applied.state.pendingGaps.filter((item) => item.status === "pending" && item.anchorId === move.anchorId && item.answerability >= 0.45 && item.priority !== "nice_to_have" && item.attempts < 2 && !item.notBeforeStage).sort((a, b) => b.score - a.score)[0] : undefined;
  const wording = await evaluate({ ...input,
    selectedMove: { action: applied.serverAction, anchorId: move.anchorId, fieldId: gap?.fieldId ?? null, kind: move.kind, language: applied.state.activeLanguage },
  });
  if (!acceptPlannedReply(input.study, applied, wording, recentPrompts)) {
    throw new ProviderError("invalid_response", "The AI reply did not satisfy the selected interview move; retry is available.");
  }
  assessment.replyGeneration = { candidateReply: wording.candidateReply, candidateAnchorId: wording.candidateAnchorId ?? null, candidateFieldId: wording.candidateFieldId ?? null, provider: wording.provider, model: wording.model, promptVersion: wording.promptVersion };
};
