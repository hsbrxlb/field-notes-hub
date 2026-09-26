import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getLegacyStudyConfig as getStudyConfig } from '@/lib/study-config';
import { evaluateTurn, type ProviderTurnInput } from '@/lib/moderator-provider';
import { applyAssessment, createModeratorState, acceptPlannedReply, type AppliedTurn } from '@/lib/moderator-state';
import { resolvePlannedReply } from '@/lib/moderator-dialogue';

const study = getStudyConfig();
const records: unknown[] = [];
describe.skipIf(process.env.SURVEY_REAL_CLARITY !== '1')('real multilingual clarity acceptance (synthetic)', () => {
  afterAll(() => { mkdirSync('output', { recursive: true }); writeFileSync('output/clarity-real.json', JSON.stringify({ scope: 'Synthetic provider + moderator checks; wording requires human review, no production answers changed', promptVersion: study.model.promptVersion, records }, null, 2)); });
  for (const language of ['en','zh-CN','es']) {
    it(`repairs repeated confusion in ${language} without advancing or inventing road details`, async () => {
      const state = createModeratorState(study), anchor = study.anchors.find(a => a.id === 'recent_experience')!;
      state.activeAnchorId = anchor.id; state.activeLanguage = language; state.activeMove = {kind:'anchor',anchorId:anchor.id,responseType:'text'};
      state.activePrompt = language==='zh-CN' ? '那次你是在什么样的地方开车？' : language==='es' ? '¿En qué tipo de lugar conducías?' : 'What sort of place were you driving in?';
      state.lastParticipantIntent='asks_clarification'; state.repairCount=1;
      state.facts.visibility_problem={factId:'synthetic-fact',fieldId:'visibility_problem',value:'Could not see far in fog',rawValue:'Could not see far in fog',confidence:0.9,status:'confirmed',source:'model',sourceTurnId:'earlier',evidenceTurnIds:['earlier'],updatedAt:new Date().toISOString()};
      state.pendingGaps=[{id:'synthetic-gap',anchorId:anchor.id,fieldId:'recent_location',question:'What type of road were you on?',reason:'Only road type remains unspecified',priority:'important',uncertainty:0.2,answerability:0.9,evidenceTurnIds:['earlier'],status:'pending',attempts:0,score:4.8,createdTurnId:'earlier',createdTurnIndex:1}];
      const rawText = language==='zh-CN' ? '什么样的地方开车 是啥意思 路上啊' : language==='es' ? '¿Qué quieres decir con tipo de lugar? ¡En la carretera!' : 'What do you mean by sort of place? On the road!';
      const i:ProviderTurnInput={study,anchor,state,turnId:'synthetic-clarity',rawText,inputPayload:{type:'text',freeText:rawText},transcript:[]};
      const a=await evaluateTurn(i); const applied=applyAssessment({study,previous:state,assessment:a,turnId:i.turnId,turnIndex:1,rawText,recentPrompts:[state.activePrompt!]});
      const diagnostics:unknown[]=[];
      try {
        await resolvePlannedReply({...i,onWordingDiagnostic:d=>diagnostics.push(d)},applied,a,[state.activePrompt!],async selected=>{const wording=await evaluateTurn(selected); records.push({language,kind:'rewrite',selected:selected.selectedMove,reply:wording.candidateReply,field:wording.candidateFieldId,action:wording.nextAction});return wording;});
      } catch(error) { records.push({language,kind:'failed',candidate:a.candidateReply,field:a.candidateFieldId,diagnostics,rejection:applied.replyRejection});throw error; }
      records.push({language,kind:'confusion',reply:applied.displayedReply,action:applied.serverAction,diagnostics});
      expect(a.provider).toBe('deepseek'); expect(applied.state.activeAnchorId).toBe(anchor.id); expect(applied.displayedReply).toBeTruthy();
      expect(applied.acceptedUpdates).toHaveLength(0);
      expect(applied.state.activeMove?.fieldId).toBe('recent_location');
      expect(applied.displayedReply).toMatch(language==='zh-CN' ? /道路|路段|路的类型/ : language==='es' ? /tipo de (?:vía|carretera)/i : /type of road|kind of road/i);
    }, 90000);
    it(`generates every topic specifically in ${language}`, async () => {
      for (const anchor of study.anchors) {
        const state=createModeratorState(study); state.activeAnchorId=anchor.id; state.activeLanguage=language; state.activeMove={kind:'anchor',anchorId:anchor.id};
        const i:ProviderTurnInput={study,anchor,state,turnId:`synthetic-${anchor.id}`,rawText:language==='zh-CN'?'没有其他要补充的。':language==='es'?'No tengo nada más que añadir.':'Nothing else to add.',inputPayload:{type:'text'},transcript:[],selectedMove:{action:'advance',anchorId:anchor.id,fieldId:null,kind:'anchor',language}};
        const a=await evaluateTurn(i);
        const applied:AppliedTurn={state,serverAction:'advance',prompt:null,displayedReply:null,acceptedUpdates:[],rejectedUpdates:[],actionReason:'Synthetic wording check'};
        const accepted=acceptPlannedReply(study,applied,a,[]);
        records.push({language,kind:'topic',anchor:anchor.id,reply:a.candidateReply,accepted,rejection:applied.replyRejection});
        expect(accepted,`${anchor.id}: ${applied.replyRejection}`).toBe(true);
      }
    },180000);
  }
});
