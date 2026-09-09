export type ParticipantIntent =
  | "answer"
  | "partial_answer"
  | "correction"
  | "asks_clarification"
  | "already_answered"
  | "frustration"
  | "refusal"
  | "skip"
  | "stop"
  | "off_topic"
  | "gibberish"
  | "prompt_attack";

export type ModelNextAction =
  | "advance"
  | "probe_now"
  | "immediate_clarify"
  | "defer_gap"
  | "repair_conversation"
  | "soft_redirect"
  | "complete";

export type ServerAction = ModelNextAction | "skip" | "stop";
export type CoverageStatus = "covered" | "partial" | "missing";
export type GapPriority = "critical" | "important" | "nice_to_have";
export type GapStatus = "pending" | "asked" | "resolved" | "unresolved" | "dropped";

export type FactRecord = {
  factId: string;
  fieldId: string;
  value: unknown;
  rawValue: string;
  confidence: number;
  status: "candidate" | "confirmed" | "unverified" | "superseded";
  source: "model" | "structured_input" | "participant_correction";
  sourceTurnId: string;
  sourceTurnIndex?: number;
  evidenceTurnIds: string[];
  supersedesFactId?: string;
  updatedAt: string;
};

export type FieldUpdate = {
  fieldId: string;
  value: string | number | string[];
  confidence: "high" | "medium" | "low";
  correction: boolean;
  evidenceTurnIds: string[];
};

export type RejectedFieldUpdate = {
  fieldId: string;
  reason: string;
};

export type TopicCoverage = {
  anchorId: string;
  status: CoverageStatus;
  coveredFieldIds: string[];
  evidenceTurnIds: string[];
  note: string;
};

export type UnresolvedPoint = {
  anchorId: string;
  fieldId: string | null;
  question: string;
  reason: string;
  priority: GapPriority;
  uncertainty: number;
  answerability: number;
  evidenceTurnIds: string[];
};

export type Contradiction = {
  fieldId: string | null;
  description: string;
  evidenceTurnIds: string[];
};

export type ModeratorAssessment = {
  candidateAnchorId?: string | null;
  candidateFieldId?: string | null;
  participantIntent: ParticipantIntent;
  understoodFacts: FieldUpdate[];
  topicCoverage: TopicCoverage;
  unresolvedPoints: UnresolvedPoint[];
  contradictions: Contradiction[];
  replyLanguage: string;
  replyLanguageConfidence: "high" | "medium" | "low";
  nextAction: ModelNextAction;
  actionReason: string;
  candidateReply: string;
  provider: string;
  model: string;
  promptVersion: string;
  replyGeneration?: { candidateReply: string; candidateAnchorId: string | null; candidateFieldId: string | null; provider: string; model: string; promptVersion: string };
};

export type PendingGap = UnresolvedPoint & {
  notBeforeStage?: "final_audit";
  id: string;
  status: GapStatus;
  createdTurnId: string;
  createdTurnIndex: number;
  askedTurnId?: string;
  resolvedTurnId?: string;
  attempts: number;
  score: number;
};

export type ActiveMove = {
  kind: "anchor" | "checkpoint_gap" | "final_audit";
  responseType?: "text";
  anchorId: string;
  gapId?: string;
  resumeAnchorId?: string | null;
};

export type ModeratorState = {
  schemaVersion: "moderator-2.0";
  policyVersion: string;
  promptVersion: string;
  lastParticipantIntent?: ParticipantIntent;
  revision: number;
  activeAnchorId: string | null;
  activePrompt: string | null;
  activeMove: ActiveMove | null;
  activeLanguage: string;
  completedAnchors: string[];
  facts: Record<string, FactRecord>;
  pendingGaps: PendingGap[];
  contradictions: Contradiction[];
  probeCounts: Record<string, number>;
  totalProbeCount: number;
  repairCount: number;
  anchorsSinceCheckpoint: number;
  checkpointQuestions: number;
  finalAuditQuestions: number;
  turnCount: number;
  riskFlags: string[];
  completionQuality: "complete" | "with_evidence_gaps" | null;
};

export type ConversationTurn = {
  id: string;
  turnIndex: number;
  anchorId: string;
  moveKind: ActiveMove["kind"];
  canonicalPrompt: string;
  localizedPrompt: string;
  rawText: string;
  inputPayload: { type: string; selectedValues?: string[]; freeText?: string };
  replyLanguage: string;
  participantIntent: ParticipantIntent;
  topicCoverage: TopicCoverage;
  unresolvedPoints: UnresolvedPoint[];
  contradictions: Contradiction[];
  extractedFields: FieldUpdate[];
  rejectedFieldUpdates: RejectedFieldUpdate[];
  aiSuggestedAction: ModelNextAction;
  serverAction: ServerAction;
  actionReason: string;
  candidateReply: string;
  displayedReply: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  policyVersion: string;
};

export type SessionRecord = {
  sessionId: string;
  entryToken: string;
  participationCode: string;
  studyId: string;
  studyVersion: string;
  status: "active" | "completed" | "completed_with_gaps" | "paused";
  consentVersion: string | null;
  consentLocale: string | null;
  consentedAt: string | null;
  state: ModeratorState;
  turns: ConversationTurn[];
};
