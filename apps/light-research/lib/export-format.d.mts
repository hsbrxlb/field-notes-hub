import type { SessionRow, TurnRow } from "./storage";

export function retentionExpiresAt(session: Pick<SessionRow, "created_at" | "study_snapshot">): Date | null;
export function participantStudySnapshot(snapshot: SessionRow["study_snapshot"]): Record<string, unknown> | null;
export function serializeSessionExport(session: SessionRow, turns: TurnRow[], options?: { audience?: "participant" | "operator" }): {
  [key: string]: unknown;
  participationCode: string;
  studySnapshot: Record<string, unknown> | null;
  dataProvenance: { sampleKind: "synthetic" | "participant" | "unspecified"; source: "study_snapshot" };
  turns: Array<{ [key: string]: unknown; id: string; rawText: string; processingStatus: TurnRow["processing_status"] | "not_exported"; processingAttempts: number | null; errorCode: string | null; providerDiagnostics: unknown[] | null }>;
};
