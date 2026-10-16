// AGE-40 B2: deterministic import-pipeline metrics. Pure; no clock, no I/O, no approvals, no locks.
const list=v=>Array.isArray(v)?v:[];
const ratio=(n,d)=>d?n/d:null; // null = nothing to measure, never 0

/** Run one pipeline stage; a throw becomes a recorded failure (spec edge case). */
export async function stage(fn){try{return {ok:true,value:await fn()};}catch(e){return {ok:false,error:String(e?.message??e)};}}

/** Concept coverage: share of ground-truth concepts named by a hypothesis concept or an observation actor/event/property. */
export function conceptCoverage(concepts,pack){
 if(list(concepts).some(c=>typeof c!=='string'||!c.trim()))throw new TypeError('truth.concepts must be non-empty strings'); // '' would match every string
 const hay=[...list(pack?.hypotheses).map(h=>h.concept),...list(pack?.observations).flatMap(o=>[o.actorId,o.event,o.property])].map(s=>String(s).toLowerCase());
 const found=list(concepts).filter(c=>hay.some(h=>h.includes(String(c).toLowerCase())));
 return {found:found.length,total:list(concepts).length,ratio:ratio(found.length,list(concepts).length)};
}

/** Timing fidelity at review instants: distance from each truth instant to the nearest draft keyframe of the same actor+property. */
export function timingFidelity(instants,prototype,toleranceMs){
 const tracks=list(prototype?.payload?.tracks);
 const errors=list(instants).map(i=>{
  const ts=tracks.filter(t=>t.actorId===i.actorId&&t.property===i.property).flatMap(t=>list(t.keyframes).map(k=>Math.abs(k.timeMs-i.timeMs)));
  return ts.length?Math.min(...ts):null; // null = no keyframe: counts as a miss
 });
 const hit=errors.filter(e=>e!==null&&e<=toleranceMs).length;
 return {errorsMs:errors,withinTolerance:hit,total:errors.length,ratio:ratio(hit,errors.length)};
}

/** Missed transitions: truth transitions with no observation range within toleranceMs. */
export function missedTransitions(transitions,pack,toleranceMs){
 const obs=list(pack?.observations).map(o=>o.timeRangeMs);
 const missed=list(transitions).filter(t=>!obs.some(([s,e])=>t.timeMs>=s-toleranceMs&&t.timeMs<=e+toleranceMs));
 return {missed:missed.length,total:list(transitions).length,times:missed.map(t=>t.timeMs)};
}

/**
 * One reference. `stages` = {extract,draft}, each from `stage()`; `truth` and `session` may be absent (reported as missing).
 * A failed stage => `failed:true` and no downstream metric.
 */
export const ARMS=['manual','import'];
export function evaluate({arm,reference,stages={},truth=null,session=null,toleranceMs=100}){
 if(!ARMS.includes(arm))throw new TypeError(`arm must be one of ${ARMS.join('|')}`);
 if(session&&session.arm!==arm)throw new TypeError(`session arm ${JSON.stringify(session.arm)} does not match row arm ${arm}`);
 if(session&&!(Number.isFinite(session.humanMs)&&session.humanMs>=0))throw new TypeError('session.humanMs must be a finite number >= 0');
 const manual=arm==='manual'; // manual briefing: human time only; no pipeline stages or fidelity metrics
 const failedStage=manual?undefined:Object.entries(stages).find(([,s])=>!s.ok);
 const out={arm,reference,failed:Boolean(failedStage),failedStage:failedStage?.[0]??null,error:failedStage?.[1].error??null,
  concepts:null,timing:null,transitions:null,ambiguities:null,humanMs:session?session.humanMs:null,
  missing:[]};
 if(!truth&&!manual)out.missing.push('ground truth');
 if(out.humanMs===null)out.missing.push('human session');
 if(out.failed||manual)return out;
 const pack=stages.extract.value?.pack,drafts=stages.draft.value;
 out.ambiguities=list(drafts?.report?.blocking).length;
 if(truth){
  out.concepts=conceptCoverage(truth.concepts,pack);
  out.timing=timingFidelity(truth.instants,list(drafts?.artifacts).find(a=>a.kind==='prototype-spec'),toleranceMs);
  out.transitions=missedTransitions(truth.transitions,pack,toleranceMs);
 }
 return out;
}
