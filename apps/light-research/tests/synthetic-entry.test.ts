import { beforeEach, describe, expect, it, vi } from "vitest";
import { startRequestSchema } from "@/lib/api-schemas";
import { interviewStorageKeys, sessionSampleKind } from "@/lib/synthetic-entry";
import { getStudyConfig } from "@/lib/study-config";
import { startConversation, getConversation } from "@/lib/conversation-service";

const storage = vi.hoisted(() => ({ createSession: vi.fn(), getSessionByToken: vi.fn(), listTurns: vi.fn() }));
vi.mock("@/lib/storage", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/storage")>(), ...storage }));

describe("real-runtime synthetic entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.listTurns.mockResolvedValue([]);
    storage.createSession.mockImplementation(async ({ study, state }) => {
      storage.getSessionByToken.mockResolvedValue({
        id: "isolated-session", study_snapshot: study, study_version: study.study.version,
        state, status: "active", participation_code: "QA-REFERENCE",
      });
      return { entryToken: "isolated-session-token", participationCode: "QA-REFERENCE", studyVersion: study.study.version };
    });
  });

  it("validates tags without accepting path, whitespace, duplicate query, or overlong input", () => {
    expect(startRequestSchema.parse({ testRun: "e2e-20261008-en-normal" }).testRun).toBe("e2e-20261008-en-normal");
    for (const testRun of ["", "../real", "has space", "UPPER", "a".repeat(65), ["a", "b"]]) {
      expect(startRequestSchema.safeParse({ testRun }).success).toBe(false);
    }
    expect(startRequestSchema.parse({})).toEqual({});
  });

  it("keeps ordinary keys unchanged and separates every browser key by test tag", () => {
    const real = interviewStorageKeys("study", "v1", "consent-v1");
    expect(real).toEqual({ sessionKey: "research-session:study:v1", pendingKey: "research-session:study:v1:pending-answer", consentKey: "research-consent:study:consent-v1" });
    const first = interviewStorageKeys("study", "v1", "consent-v1", "qa-one");
    const second = interviewStorageKeys("study", "v1", "consent-v1", "qa-two");
    for (const key of ["sessionKey", "pendingKey", "consentKey"] as const) {
      expect(first[key]).not.toBe(real[key]);
      expect(first[key]).not.toBe(second[key]);
      expect(first[key]).toContain(":test-run:qa-one");
    }
    expect(`${first.sessionKey}:draft`).not.toBe(`${real.sessionKey}:draft`);
  });

  it("stores synthetic provenance without changing questions or the cached participant manifest, and restores the label", async () => {
    const study = getStudyConfig();
    const started = await startConversation(study.consent.version, "en", "e2e-en-normal");
    const savedStudy = storage.createSession.mock.calls[0][0].study;
    expect(savedStudy.study).toEqual({ ...study.study, sampleKind: "synthetic" });
    expect(savedStudy.anchors).toBe(study.anchors);
    expect(savedStudy.completion).toBe(study.completion);
    expect(getStudyConfig().study.sampleKind).toBe("participant");
    expect(started.conversation.sampleKind).toBe("synthetic");
    expect((await getConversation(started.entryToken)).sampleKind).toBe("synthetic");
    const session = await storage.getSessionByToken();
    session.status = "completed";
    const completed = await getConversation(started.entryToken);
    expect(completed.sampleKind).toBe("synthetic");
    expect(completed.completion).toMatchObject({ participationCode: "QA-REFERENCE", rewardStatus: "not_connected" });
  });

  it("missing or invalid snapshot provenance remains unspecified", async () => {
    for (const snapshot of [null, undefined, {}, { study: {} }, { study: { sampleKind: "unknown" } }]) {
      expect(sessionSampleKind(snapshot)).toBe("unspecified");
    }
    const study = getStudyConfig();
    const started = await startConversation(study.consent.version, "en");
    const session = await storage.getSessionByToken();
    session.study_snapshot = null;
    expect((await getConversation(started.entryToken)).sampleKind).toBe("unspecified");
  });

  it("ordinary starts retain participant provenance and invalid tags never create a session", async () => {
    const study = getStudyConfig();
    const started = await startConversation(study.consent.version, "en");
    expect(started.conversation.sampleKind).toBe("participant");
    expect(storage.createSession.mock.calls[0][0].study).toBe(study);
    await expect(startConversation(study.consent.version, "en", "../bad")).rejects.toMatchObject({ code: "test_run" });
    expect(storage.createSession).toHaveBeenCalledTimes(1);
  });
});
