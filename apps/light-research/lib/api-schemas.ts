import { z } from "zod";

export const startRequestSchema = z.object({
  consentVersion: z.string().min(1).max(120).optional(),
  consentLocale: z.string().min(2).max(24).optional(),
}).strict();

export const turnRequestSchema = z.object({
  entryToken: z.string().min(20).max(200),
  clientAttemptId: z.string().uuid(),
  stateRevision: z.number().int().min(0),
  anchorId: z.string().min(2).max(64),
  intent: z.enum(["answer", "skip"]).default("answer"),
  text: z.string().min(1).max(6000).refine((value) => value.trim().length > 0, "An answer cannot be blank."),
  inputPayload: z.object({
    type: z.enum(["text", "single_choice", "multiple_choice", "scale"]),
    selectedValues: z.array(z.string().min(1).max(100)).max(12).optional(),
    freeText: z.string().max(3000).optional(),
  }).strict(),
}).strict();

export const tokenRequestSchema = z.object({ entryToken: z.string().min(20).max(200) }).strict();
