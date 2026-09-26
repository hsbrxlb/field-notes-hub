import { describe, expect, it } from "vitest";
import { createModeratorState } from "@/lib/moderator-state";
import { getLegacyStudyConfig } from "@/lib/study-config";
import { createSession, deleteSession } from "@/lib/storage";
import { getConversation, respondToConversation } from "@/lib/conversation-service";

describe.skipIf(process.env.SURVEY_MIGRATION_DB !== "1")("saved synthetic interview after pilot upgrade", () => {
  it("restores and continues the original study version", async () => {
    const legacy = getLegacyStudyConfig();
    const created = await createSession({ study: legacy, state: createModeratorState(legacy), consentVersion: null, consentLocale: null, consentedAt: null });
    try {
      const before = await getConversation(created.entryToken);
      expect(before.progress.total).toBe(7);
      expect(before.anchorId).toBe("use_context");
      const after = await respondToConversation({
        entryToken: created.entryToken,
        clientAttemptId: crypto.randomUUID(),
        stateRevision: before.stateRevision,
        anchorId: before.anchorId!,
        text: "I drove home from work after dark.",
        inputPayload: { type: "text", freeText: "I drove home from work after dark." },
      });
      expect(after.progress.total).toBe(7);
      expect(after.messages.some((message) => message.text === "I drove home from work after dark.")).toBe(true);
    } finally {
      await deleteSession(created.entryToken);
    }
  });
});
