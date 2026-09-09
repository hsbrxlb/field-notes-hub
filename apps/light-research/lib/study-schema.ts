import { z } from "zod";
import { questionPolicyViolation } from "./question-policy";

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/);
const localizedTextSchema = z.record(z.string().min(2), z.string().min(1));

const optionSchema = z.object({
  id: idSchema,
  labels: localizedTextSchema,
}).strict();

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), placeholder: localizedTextSchema.optional() }).strict(),
  z.object({
    type: z.literal("single_choice"),
    options: z.array(optionSchema).min(2),
    allowOther: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("multiple_choice"),
    options: z.array(optionSchema).min(2),
    allowOther: z.boolean(),
    maxSelections: z.number().int().min(1).max(12).optional(),
  }).strict(),
  z.object({
    type: z.literal("scale"),
    min: z.number().int().min(0).max(9),
    max: z.number().int().min(1).max(10),
    minLabels: localizedTextSchema.optional(),
    maxLabels: localizedTextSchema.optional(),
  }).strict().refine((value) => value.min < value.max, { message: "scale min must be less than max" }),
]);

export const studyManifestSchema = z.object({
  schemaVersion: z.literal("2.0"),
  study: z.object({
    id: idSchema,
    version: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["draft", "review_ready"]),
    readiness: z.enum(["technical_prototype", "conversation_validated", "research_ready"]),
    sampleKind: z.enum(["synthetic", "participant", "unspecified"]).default("unspecified"),
    goal: z.string().min(1),
    decisionQuestions: z.array(z.string().min(1)).min(1),
    audience: z.object({
      description: z.string().min(1),
      eligibility: z.array(z.string().min(1)),
    }).strict(),
    languagePolicy: z.object({
      entryLanguage: z.string().min(2),
      fallbackLanguage: z.string().min(2),
      autoReplyLanguage: z.literal(true),
      preserveOriginal: z.literal(true),
    }).strict(),
    estimatedMinutes: z.number().int().min(1).max(60),
  }).strict(),
  brand: z.object({
    name: z.string().min(1),
    shortLabel: z.string().min(1),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    surface: z.enum(["light", "immersive"]).default("light"),
    tagline: z.string().min(1).optional(),
    backgroundImage: z.string().startsWith("/study-assets/").optional(),
  }).strict(),
  claims: z.array(z.object({
    id: idSchema,
    text: z.string().min(1),
    status: z.enum(["approved_for_participants", "internal_only", "unconfirmed"]),
    source: z.string().min(1),
  }).strict()),
  consent: z.object({
    version: z.string().min(1),
    enabledByDefault: z.literal(false),
    internalOnly: z.boolean(),
    locales: z.record(z.string().min(2), z.object({
      languageLabel: z.string().min(1),
      title: z.string().min(1),
      intro: z.string().min(1),
      items: z.array(z.string().min(1)).min(2),
      checkbox: z.string().min(1),
      accept: z.string().min(1),
      decline: z.string().min(1),
      declinedTitle: z.string().min(1),
      declinedText: z.string().min(1),
    }).strict()),
  }).strict(),
  dataPolicy: z.object({
    retentionDays: z.number().int().min(1).max(3650),
    collectPii: z.literal(false),
    allowWithdrawal: z.literal(true),
    providerDisclosure: z.string().min(1),
  }).strict(),
  moderation: z.object({
    policyVersion: z.string().min(1),
    maxTotalProbes: z.number().int().min(0).max(20),
    checkpointEveryAnchors: z.number().int().min(2).max(3),
    maxCheckpointQuestions: z.number().int().min(0).max(4),
    maxFinalAuditQuestions: z.number().int().min(0).max(3),
    maxRepairTurns: z.number().int().min(1).max(10),
    repairConsumesProbeBudget: z.literal(false),
    oneQuestionPerReply: z.literal(true),
  }).strict(),
  model: z.object({
    provider: z.enum(["deepseek", "mock"]),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    timeoutMs: z.number().int().min(1000).max(120000),
    maxRetries: z.number().int().min(0).max(2),
  }).strict(),
  fields: z.array(z.object({
    id: idSchema,
    description: z.string().min(1),
    type: z.enum(["text", "number", "string_list", "choice", "scale"]),
    decisionRelevance: z.enum(["critical", "important", "context"]),
  }).strict()).min(1),
  anchors: z.array(z.object({
    id: idSchema,
    label: z.string().min(1),
    objective: z.string().min(1),
    question: z.string().min(1),
    questionLocales: localizedTextSchema.optional(),
    clarification: z.string().min(1),
    clarificationLocales: localizedTextSchema.optional(),
    followUpQuestions: z.record(idSchema, localizedTextSchema).optional(),
    sufficiencyCriteria: z.array(z.string().min(1)).min(1),
    highValueProbeTargets: z.array(z.string().min(1)),
    requiredFields: z.array(idSchema),
    evidenceFields: z.array(idSchema).min(1).optional(),
    optional: z.boolean(),
    skipWhenCovered: z.boolean(),
    maxImmediateProbes: z.number().int().min(0).max(3),
    measurementStage: z.enum(["baseline", "conversation", "post_intervention"]),
    claimRefs: z.array(idSchema),
    media: z.array(z.object({
      type: z.literal("image"),
      src: z.string().startsWith("/study-assets/"),
      alt: localizedTextSchema,
    }).strict()),
    input: inputSchema,
  }).strict()).min(1),
  completion: z.object({
    requiredAnchors: z.array(idSchema).min(1),
    messages: localizedTextSchema,
  }).strict(),
  analysis: z.object({
    outputs: z.array(z.enum(["individual_summary", "theme_matrix", "decision_report", "evidence_packet"])).min(1),
    primaryDecisionQuestion: z.string().min(1),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const fieldSet = new Set(manifest.fields.map((field) => field.id));
  const anchorSet = new Set(manifest.anchors.map((anchor) => anchor.id));
  const claimMap = new Map(manifest.claims.map((claim) => [claim.id, claim]));
  const unique = (items: string[]) => items.length === new Set(items).size;
  if (!unique(manifest.fields.map((field) => field.id))) context.addIssue({ code: "custom", message: "field ids must be unique", path: ["fields"] });
  if (!unique(manifest.anchors.map((anchor) => anchor.id))) context.addIssue({ code: "custom", message: "anchor ids must be unique", path: ["anchors"] });
  if (!manifest.consent.locales[manifest.study.languagePolicy.entryLanguage]) {
    context.addIssue({ code: "custom", message: "consent copy must include entryLanguage for optional consent mode", path: ["consent", "locales"] });
  }
  if (!manifest.completion.messages[manifest.study.languagePolicy.entryLanguage]) {
    context.addIssue({ code: "custom", message: "completion message must include entryLanguage", path: ["completion", "messages"] });
  }
  for (const [index, anchor] of manifest.anchors.entries()) {
    const questions = [anchor.question, anchor.clarification, ...Object.values(anchor.questionLocales ?? {}), ...Object.values(anchor.clarificationLocales ?? {}), ...Object.values(anchor.followUpQuestions ?? {}).flatMap(Object.values)];
    for (const question of questions) {
      const violation = questionPolicyViolation(question);
      if (violation) context.addIssue({ code: "custom", message: `participant copy violates ${violation}`, path: ["anchors", index] });
    }
    for (const field of anchor.requiredFields) {
      if (!fieldSet.has(field)) context.addIssue({ code: "custom", message: `unknown field ${field}`, path: ["anchors", index, "requiredFields"] });
    }
    for (const field of anchor.evidenceFields ?? []) {
      if (!fieldSet.has(field)) context.addIssue({ code: "custom", message: `unknown evidence field ${field}`, path: ["anchors", index, "evidenceFields"] });
    }
    for (const field of Object.keys(anchor.followUpQuestions ?? {})) {
      if (!(anchor.evidenceFields ?? anchor.requiredFields).includes(field)) context.addIssue({ code: "custom", message: `follow-up field ${field} is not owned by this anchor`, path: ["anchors", index, "followUpQuestions"] });
    }
    for (const field of anchor.requiredFields) {
      if (anchor.evidenceFields && !anchor.evidenceFields.includes(field)) context.addIssue({ code: "custom", message: `required field ${field} must be included in evidenceFields`, path: ["anchors", index, "evidenceFields"] });
    }
    for (const claimId of anchor.claimRefs) {
      const claim = claimMap.get(claimId);
      if (!claim) context.addIssue({ code: "custom", message: `unknown claim ${claimId}`, path: ["anchors", index, "claimRefs"] });
      else if (claim.status !== "approved_for_participants") context.addIssue({ code: "custom", message: `claim ${claimId} is not participant-approved`, path: ["anchors", index, "claimRefs"] });
    }
  }
  for (const anchor of manifest.completion.requiredAnchors) {
    if (!anchorSet.has(anchor)) context.addIssue({ code: "custom", message: `unknown completion anchor ${anchor}`, path: ["completion", "requiredAnchors"] });
  }
});

export type StudyManifest = z.infer<typeof studyManifestSchema>;
export type StudyAnchor = StudyManifest["anchors"][number];
export type StudyInput = StudyAnchor["input"];
export type ConsentLocale = keyof StudyManifest["consent"]["locales"];

export type PublicStudyConfig = Pick<StudyManifest, "schemaVersion" | "brand" | "consent"> & {
  study: Pick<StudyManifest["study"], "id" | "version" | "title" | "status" | "sampleKind" | "estimatedMinutes" | "languagePolicy">;
  anchors: Array<Pick<StudyAnchor, "id">>;
  approvedClaims: Array<Pick<StudyManifest["claims"][number], "id" | "text">>;
};
