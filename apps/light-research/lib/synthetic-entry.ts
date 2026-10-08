import { testRunSchema } from "./api-schemas";

type SampleKind = "synthetic" | "participant" | "unspecified";

// Preserve ordinary keys exactly; drafts inherit the isolated session key.
export const interviewStorageKeys = (studyId: string, studyVersion: string, consentVersion: string, testRun?: string) => {
  const tag = testRunSchema.optional().parse(testRun);
  const suffix = tag ? `:test-run:${tag}` : "";
  const sessionKey = `research-session:${studyId}:${studyVersion}${suffix}`;
  return {
    sessionKey,
    pendingKey: `${sessionKey}:pending-answer`,
    consentKey: `research-consent:${studyId}:${consentVersion}${suffix}`,
  };
};

// Current-version runtime config may supersede a snapshot, but never its provenance.
export const sessionSampleKind = (snapshot: unknown): SampleKind => {
  if (snapshot && typeof snapshot === "object" && "study" in snapshot) {
    const study = snapshot.study;
    if (study && typeof study === "object" && "sampleKind" in study) {
      const kind = study.sampleKind;
      if (kind === "synthetic" || kind === "participant" || kind === "unspecified") return kind;
    }
  }
  return "unspecified";
};
