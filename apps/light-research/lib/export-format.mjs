// Shared by the token API and the explicitly scoped local operator exporter.
export const retentionExpiresAt = (session) => {
  const days = session.study_snapshot?.dataPolicy?.retentionDays;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 3650) return null;
  const created = new Date(session.created_at).getTime();
  return Number.isFinite(created) ? new Date(created + days * 86_400_000) : null;
};

export const participantStudySnapshot = (snapshot) => snapshot ? {
  schemaVersion: snapshot.schemaVersion,
  study: { id: snapshot.study?.id, version: snapshot.study?.version, title: snapshot.study?.title,
    sampleKind: snapshot.study?.sampleKind ?? "unspecified", decisionQuestions: snapshot.study?.decisionQuestions },
  fields: snapshot.fields?.map(({ id, type, description }) => ({ id, type, description })),
  anchors: snapshot.anchors?.map(({ id, label, question, questionLocales, requiredFields, evidenceFields, measurementStage, input }) =>
    ({ id, label, question, questionLocales, requiredFields, evidenceFields, measurementStage, input })),
  claims: snapshot.claims?.filter((claim) => claim.status === "approved_for_participants").map(({ id, text }) => ({ id, text })),
} : null;

export const serializeSessionExport = (session, turns, { audience = "participant" } = {}) => {
  const snapshot = session.study_snapshot;
  const kind = snapshot?.study?.sampleKind;
  const sampleKind = kind === "synthetic" || kind === "participant" ? kind : "unspecified";
  return {
    schemaVersion: session.state.schemaVersion === "moderator-2.0" ? "2.0" : "1.0",
    sourceStateSchema: session.state.schemaVersion,
    sessionId: session.id,
    participationCode: session.participation_code,
    studyId: session.study_id,
    studyVersion: session.study_version,
    status: session.status,
    completionQuality: session.state.completionQuality,
    policyVersion: session.policy_version,
    promptVersion: session.prompt_version,
    modelSnapshot: session.model_snapshot,
    studySnapshot: audience === "operator" ? snapshot : participantStudySnapshot(snapshot),
    snapshotAudience: audience,
    dataProvenance: { sampleKind, source: "study_snapshot" },
    createdAt: new Date(session.created_at).toISOString(),
    retentionExpiresAt: retentionExpiresAt(session)?.toISOString() ?? null,
    consent: session.consent_version && session.consent_locale && session.consented_at
      ? { version: session.consent_version, locale: session.consent_locale, consentedAt: new Date(session.consented_at).toISOString() } : undefined,
    // Preserve exported history/status; consumers decide which facts are current.
    facts: Object.values(session.state.facts ?? {}),
    pendingGaps: session.state.pendingGaps ?? [],
    contradictions: session.state.contradictions ?? [],
    turns: turns.map((turn) => ({
      id: turn.id, turnIndex: turn.turn_index, anchorId: turn.anchor_id, moveKind: turn.move_kind,
      measurementStage: snapshot?.anchors?.find((anchor) => anchor.id === turn.anchor_id)?.measurementStage ?? "unknown",
      evidenceFieldIds: snapshot?.anchors?.find((anchor) => anchor.id === turn.anchor_id)?.evidenceFields ?? [],
      canonicalPrompt: turn.canonical_prompt, localizedPrompt: turn.localized_prompt,
      rawText: turn.raw_text, inputPayload: turn.input_payload, assessment: turn.assessment,
      replyLanguage: turn.reply_language, modelReplyLanguage: turn.assessment?.replyLanguage ?? null, requestIntent: turn.request_intent,
      serverAction: turn.server_action, actionReason: turn.action_reason, displayedReply: turn.displayed_reply,
      rejectedFieldUpdates: turn.rejected_field_updates, extractedFields: turn.extracted_fields,
      policyVersion: turn.policy_version, promptVersion: turn.prompt_version,
      processingStatus: turn.processing_status ?? "not_exported", processingAttempts: turn.processing_attempts ?? null,
      providerDiagnostics: turn.provider_diagnostics ?? null, errorCode: turn.error_code ?? null,
    })),
  };
};
