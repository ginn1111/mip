// Draft MIP artifacts from a Reference Evidence Pack (docs/specs/AGE-38.md B1-B6).
// Never approves or locks: every artifact is lifecycle `draft` with empty `approvals` (approval is human, in the reviewer).
import {artifactDigest} from '../artifacts/index.mjs';
import {validateEvidencePack,packEvidence} from '../evidence/index.mjs';
import {resolve} from '../glossary/index.mjs';

const list=v=>Array.isArray(v)?v:[];
const numeric=v=>Number.isFinite(v)||(Array.isArray(v)&&v.length>0&&v.every(Number.isFinite));
const draft=(pack,opts,id,kind,payload,dependencies=[])=>({protocol:'mip/0.7',id:`${pack.id}-${id}`,projectId:opts.projectId,kind,revision:1,
 lifecycle:'draft',dependencies,payload,evidence:[packEvidence(pack,opts.packUri??`mip:evidence-pack/${pack.id}`)],approvals:[]});
const ref=a=>({id:a.id,revision:a.revision,digest:artifactDigest(a)});

/** B2. `goal` only from a DECLARED binding whose observation carries a non-empty string value; else explicitly unresolved. */
function intentPayload(pack,report){
 const obs=new Map(list(pack.observations).map(o=>[o.id,o]));
 const bindings=list(pack.bindings);
 // ponytail: pack has no declared-value field; assumed a DECLARED `goal` binding stores its text as an observation measuredValue. Upgrade when AGE-34 adds one.
 const declared=bindings.filter(b=>b.intentField==='goal'&&b.provenanceClass==='DECLARED')
  .flatMap(b=>list(b.observationIds).map(id=>obs.get(id)?.measuredValue)).find(v=>typeof v==='string'&&v.trim());
 const constraints=[];
 for(const b of bindings){
  if(b.intentField==='goal')continue;
  if(!b.intentField?.startsWith('constraints.')){report.unmapped.push({binding:b.intentField,reason:'no intent-profile field'});continue;}
  const refs=[...list(b.observationIds),...list(b.hypothesisIds)];
  constraints.push(`${b.intentField.slice('constraints.'.length)}: ${b.provenanceClass}${refs.length?` (${refs.join(', ')})`:''}`);
 }
 const references=[...new Set([...list(pack.sources).map(s=>s.uri),...list(pack.observations).flatMap(o=>list(o.evidenceRefs).map(e=>e.uri))])];
 return {scene:pack.id,goal:declared??'UNRESOLVED: no DECLARED goal in the evidence pack',constraints,references};
}

/** B3. Hypotheses are INFERRED: glossary-known ones stay `ambiguous`, unnamed ones `unknown`; every one blocks until a human decides. */
function semanticPayload(pack){
 const concepts=new Map();
 for(const h of list(pack.hypotheses)){
  if(concepts.has(h.concept))continue;
  const m=resolve(h.concept,{candidates:[h.concept]})[0];
  concepts.set(h.concept,{phrase:h.concept,interpretation:'',status:m.status==='unknown'?'unknown':'ambiguous',...(m.id?{glossaryId:m.id}:{})});
 }
 const all=[...concepts.values()];
 return {concepts:all,blockingAmbiguities:all.map(c=>c.phrase)};
}

/** B4. One track per actor+property; a keyframe at each observation's range end (measured time), easing `linear`, citing the observation id. */
function prototypePayload(pack,report){
 const observations=list(pack.observations),tracks=new Map(),storyboard=[];
 for(const o of observations){
  const [start,end]=list(o.timeRangeMs);
  storyboard.push({timeMs:start,caption:`${o.actorId} ${o.event} ${o.property}`,observationId:o.id});
  if(!numeric(o.measuredValue)){report.unmapped.push({observation:o.id,reason:'measuredValue is not numeric'});continue;}
  const key=`${o.actorId}\u0000${o.property}`;
  if(!tracks.has(key))tracks.set(key,{actorId:o.actorId,property:o.property,keyframes:[]});
  const frames=tracks.get(key).keyframes;
  if(frames.some(f=>f.timeMs===end)){report.unmapped.push({observation:o.id,reason:`duplicate keyframe time ${end}`});continue;}
  frames.push({timeMs:end,value:o.measuredValue,easing:'linear',observationId:o.id});
 }
 for(const t of tracks.values())t.keyframes.sort((a,b)=>a.timeMs-b.timeMs);
 storyboard.sort((a,b)=>a.timeMs-b.timeMs);
 const durationMs=Math.max(1,...observations.flatMap(o=>list(o.timeRangeMs)));
 const fps=Math.round(list(pack.sources).map(s=>s.environment?.frameRate).find(Number.isFinite)??30)||30;
 return {durationMs,fps,actors:[...new Set(observations.map(o=>o.actorId))].map(id=>({id})),states:[],transitions:[],tracks:[...tracks.values()],
  storyboard,scenarios:[{id:'reference',initialState:'idle',events:[]}],reviewSegments:[{id:'full',startMs:0,endMs:durationMs,scenarioIds:['reference']}]};
}

/**
 * Pure. Returns `{artifacts:[intent,semantic,prototype], report}`. `report` is the uncertainty report
 * (assumed place to show assumptions to the human, spec open decision): blocking concepts + what could not be mapped.
 * Rejects a pack failing AGE-34 integrity checks (ponytail: schema check stays in tests because ajv is a devDependency).
 */
export function buildDrafts(pack,{projectId,packUri}={}){
 if(!projectId)throw new Error('projectId required');
 const check=validateEvidencePack(pack);
 if(!check.ok)throw Object.assign(new Error('Invalid evidence pack'),{violations:check.violations});
 const report={blocking:[],unmapped:[]},opts={projectId,packUri};
 const intent=draft(pack,opts,'intent','intent-profile',intentPayload(pack,report));
 const semanticBody=semanticPayload(pack);
 report.blocking=semanticBody.blockingAmbiguities;
 const semantic=draft(pack,opts,'semantic','semantic-contract',semanticBody,[ref(intent)]);
 const prototype=draft(pack,opts,'prototype','prototype-spec',prototypePayload(pack,report),[ref(intent),ref(semantic)]);
 return {artifacts:[intent,semantic,prototype],report};
}

/** B1-B6: validate, build and write the three drafts to an ArtifactStore. */
export async function createDrafts(store,pack,options){
 const {artifacts,report}=buildDrafts(pack,options);
 const refs=[];
 for(const a of artifacts)refs.push(await store.create(a));
 return {refs,report};
}
