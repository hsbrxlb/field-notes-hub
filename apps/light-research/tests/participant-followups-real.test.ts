import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { getStudyConfig } from "@/lib/study-config";
import { evaluateTurn, type ProviderTurnInput } from "@/lib/moderator-provider";
import { applyAssessment, createModeratorState, acceptPlannedReply, type AppliedTurn } from "@/lib/moderator-state";
import { resolvePlannedReply } from "@/lib/moderator-dialogue";

const study = getStudyConfig();
const records: unknown[] = [];
const cases = [
  { kind: "action", anchor: "recent_experience", field: "visibility_problem", meaning: "reported_problem", action: "probe_now", target: "recent_experience", probe: "user_action", text: ["Not sure what it was, but something blocked my view", "我不确定是什么挡住了视线，但是前面确实看不清。", "No sé qué era, pero algo me tapaba la vista."] },
  { kind: "no_problem", anchor: "recent_experience", field: "visibility_problem", meaning: "no_problem", action: "advance", target: "current_lights", text: ["Everything was easy to see", "没有困难", "No me costó ver nada"] },
  { kind: "no_need", anchor: "concept", field: "beam_use", meaning: "no_need", action: "advance", target: "optics_proof", text: ["I don't need it", "我用不上", "No lo necesito"] },
  { kind: "one_mode", anchor: "concept", field: "beam_use", meaning: "one_mode_only", action: "advance", target: "optics_proof", text: ["I'd only use the farther-reaching setting on rural roads; I would never switch", "我只会在乡间路上用照远处的那种，不会切换", "Solo usaría el modo de largo alcance en carreteras rurales; nunca cambiaría de modo"] },
  { kind: "switch", anchor: "concept", field: "beam_use", meaning: "possible_use", action: "probe_now", target: "concept", probe: "switch_use", text: ["I might use it off road", "我可能会在越野时用", "Quizá la usaría fuera de carretera"] },
  { kind: "price_refusal", anchor: "price", action: "advance", target: "final_change", text: ["I prefer not to answer this price question", "价格我不想回答", "Prefiero no responder esta pregunta sobre el precio"] },
  { kind: "baseline", anchor: "current_lights", action: "advance", target: "priorities", text: ["Only the factory high beams", "只用了原车远光灯", "Solo usé las luces largas de fábrica"] },
];

describe.skipIf(process.env.SURVEY_REAL_FOLLOWUPS !== "1")("current multilingual follow-ups with real provider (synthetic only)", () => {
  afterAll(() => {
    mkdirSync("output", { recursive: true });
    writeFileSync("output/participant-followups-real.json", JSON.stringify({ studyVersion: study.study.version, promptVersion: study.model.promptVersion, scope: "Synthetic provider and routing checks; no participant or database records", records }, null, 2));
  });
  for (const [index, language] of ["en", "zh-CN", "es"].entries()) {
    for (const scenario of cases) {
      it.concurrent(`${language}: ${scenario.kind}`, async () => {
        const state = createModeratorState(study);
        const anchor = study.anchors.find((item) => item.id === scenario.anchor)!;
        state.activeAnchorId = anchor.id;
        state.activeLanguage = language;
        state.activeMove = { kind: "anchor", anchorId: anchor.id };
        state.activePrompt = anchor.questionLocales![language];
        if (scenario.kind === "no_need" || scenario.kind === "one_mode") {
          state.anchorsSinceCheckpoint = 2;
          state.pendingGaps.push({ id: "synthetic-old-switch", anchorId: "concept", fieldId: "switch_use", question: "When would you switch?", reason: "A prior answer was vague.", priority: "critical", uncertainty: 0.9, answerability: 0.9, evidenceTurnIds: ["old-turn"], status: "pending", createdTurnId: "old-turn", createdTurnIndex: 0, attempts: 0, score: 8 });
        }
        const rawText = scenario.text[index];
        const input: ProviderTurnInput = { study, anchor, state, turnId: `synthetic-${language}-${scenario.kind}`, rawText, inputPayload: { type: "text", freeText: rawText }, transcript: [] };
        const assessment = await evaluateTurn(input);
        const applied = applyAssessment({ study, previous: state, assessment, turnId: input.turnId, turnIndex: 1, rawText, recentPrompts: [state.activePrompt] });
        await resolvePlannedReply(input, applied, assessment, [state.activePrompt]);
        records.push({ language, kind: scenario.kind, rawText, facts: applied.acceptedUpdates, action: applied.serverAction, target: applied.state.activeAnchorId, probe: applied.state.activeMove?.fieldId, reply: applied.displayedReply });
        expect(assessment.provider).toBe("deepseek");
        expect(applied.serverAction).toBe(scenario.action);
        expect(applied.state.activeAnchorId).toBe(scenario.target);
        expect(applied.state.activeLanguage).toBe(language);
        expect(applied.displayedReply).toBeTruthy();
        if (scenario.kind === "no_need") {
          expect([applied.state.facts.beam_use?.evidenceMeaning, applied.state.facts.concept_reaction?.evidenceMeaning]).toContain("no_need");
          expect(applied.state.pendingGaps.filter((gap) => gap.anchorId === "concept" && gap.status === "pending")).toEqual([]);
        } else if (scenario.field) expect(applied.state.facts[scenario.field]?.evidenceMeaning).toBe(scenario.meaning);
        if (scenario.kind === "no_need" || scenario.kind === "one_mode") expect(applied.state.pendingGaps.find((gap) => gap.id === "synthetic-old-switch")?.status).toBe("dropped");
        if (scenario.probe) expect(applied.state.activeMove?.fieldId).toBe(scenario.probe);
        if (scenario.kind === "price_refusal") {
          expect(applied.state.declinedAnchors).toContain("price");
          expect(applied.state.facts.price_fit).toBeUndefined();
        }
      }, 90000);
    }
    it.concurrent(`${language}: plain night-test question`, async () => {
      const state = createModeratorState(study), anchor = study.anchors.find((item) => item.id === "optics_proof")!;
      state.activeAnchorId = anchor.id; state.activeLanguage = language; state.activeMove = { kind: "anchor", anchorId: anchor.id };
      const input: ProviderTurnInput = { study, anchor, state, turnId: `synthetic-${language}-optics`, rawText: ["Nothing else to add", "没有其他补充", "No tengo nada más que añadir"][index], inputPayload: { type: "text" }, transcript: [], selectedMove: { action: "advance", anchorId: anchor.id, fieldId: null, kind: "anchor", language } };
      const assessment = await evaluateTurn(input);
      const applied: AppliedTurn = { state, serverAction: "advance", prompt: null, displayedReply: null, acceptedUpdates: [], rejectedUpdates: [], actionReason: "Synthetic question wording check" };
      const accepted = acceptPlannedReply(study, applied, assessment, []);
      records.push({ language, kind: "optics", reply: assessment.candidateReply, accepted, rejection: applied.replyRejection });
      expect(accepted).toBe(true);
    }, 90000);
  }
});
