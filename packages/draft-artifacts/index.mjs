// Draft MIP artifacts from a Reference Evidence Pack (docs/specs/AGE-38.md B1-B7).
// Never approves or locks: every artifact is lifecycle `draft` with empty `approvals` (approval is human, in the reviewer).
import {artifactDigest} from '../artifacts/index.mjs';
import {validateEvidencePack,packEvidence} from '../evidence/index.mjs';
import {resolve} from '../glossary/index.mjs';

/** Prefix of every explicit unresolved marker; each one is also listed in `report.unresolved` and in `blockingAmbiguities`. */
export const UNRESOLVED='UNRESOLVED';
const list=v=>Array.isArray(v)?v:[];
const numeric=v=>Number.isFinite(v)||(Array.isArray(v)&&v.length>0&&v.every(Number.isFinite));
const str=v=>typeof v==='string'&&v.trim()!=='';
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const draft=(pack,opts,id,kind,payload,dependencies=[])=>({protocol:'mip/0.7',id:`${pack.id}-${id}`,projectId:opts.projectId,kind,revision:1,
 lifecycle:'draft',dependencies,payload,evidence:[packEvidence(pack,opts.packUri??`mip:evidence-pack/${pack.id}`)],approvals:[]});
const ref=a=>({id:a.id,revision:a.revision,digest:artifactDigest(a)});
const fail=violations=>Object.assign(new Error('Invalid evidence pack'),{violations});

/** Shape checks the generator relies on beyond AGE-34 integrity. Run only after `validateEvidencePack` passes (so containers are arrays). */
function packShapeViolations(pack){
 const v=[],add=(code,detail)=>v.push({code,...detail});
 for(const s of pack.sources)if(!str(s.uri))add('INVALID_FIELD',{source:s.id,field:'uri'});
 for(const o of pack.observations){
  for(const f of ['actorId','event','property'])if(!str(o[f]))add('INVALID_FIELD',{observation:o.id,field:f});
  const t=o.timeRangeMs;
  if(!Array.isArray(t)||t.length!==2||!t.every(x=>Number.isInteger(x)&&x>=0))add('INVALID_TIME',{observation:o.id});
 }
 for(const h of pack.hypotheses)if(!str(h.concept))add('INVALID_FIELD',{hypothesis:h.id,field:'concept'});
 for(const b of pack.bindings)if(!str(b.intentField))add('INVALID_FIELD',{field:'intentField'});
 return v;
}

/** Checks the generated payloads before anything is written. Returns `[{code, ...}]`; empty = ok. */
export function checkDraftOutputs(artifacts){
 const v=[],add=(code,detail)=>v.push({code,...detail});
 for(const a of artifacts){
  if(a.kind==='intent-profile'&&!str(a.payload.goal))add('INVALID_GOAL',{artifact:a.id});
  if(a.kind!=='prototype-spec')continue;
  const p=a.payload;
  if(!Number.isInteger(p.fps)||p.fps<1)add('INVALID_FPS',{artifact:a.id});
  if(!Number.isInteger(p.durationMs)||p.durationMs<1)add('INVALID_DURATION',{artifact:a.id});
  const times=[...p.tracks.flatMap(t=>t.keyframes.map(k=>k.timeMs)),...p.storyboard.map(s=>s.timeMs)];
  if(!times.every(t=>Number.isInteger(t)&&t>=0&&t<=p.durationMs))add('INVALID_TIME',{artifact:a.id});
 }
 return v;
}

/** B2. `goal` only from a DECLARED binding whose observation carries a non-empty string value; else an explicit UNRESOLVED marker. */
function intentPayload(pack,report){
 const obs=new Map(pack.observations.map(o=>[o.id,o]));
 const bindings=pack.bindings;
 // ponytail: pack has no declared-value field; assumed a DECLARED `goal` binding stores its text as an observation measuredValue. Upgrade when AGE-34 adds one.
 const valueOf=b=>b.provenanceClass==='DECLARED'?list(b.observationIds).map(id=>obs.get(id)?.measuredValue).find(v=>typeof v==='string'&&v.trim()):undefined;
 let declared;
 for(const b of bindings){
  if(b.intentField!=='goal')continue;
  const value=declared===undefined?valueOf(b):undefined;
  if(value!==undefined)declared=value;
  else report.unmapped.push({binding:'goal',provenanceClass:b.provenanceClass,reason:b.provenanceClass==='DECLARED'?'DECLARED goal binding has no string value':'goal is only taken from a DECLARED binding'});
 }
 const constraints=[];
 for(const b of bindings){
  if(b.intentField==='goal')continue;
  if(!b.intentField.startsWith('constraints.')){report.unmapped.push({binding:b.intentField,reason:'no intent-profile field'});continue;}
  const refs=[...list(b.observationIds),...list(b.hypothesisIds)];
  constraints.push(`${b.intentField.slice('constraints.'.length)}: ${b.provenanceClass}${refs.length?` (${refs.join(', ')})`:''}`);
 }
 const references=[...new Set([...pack.sources.map(s=>s.uri),...pack.observations.flatMap(o=>list(o.evidenceRefs).map(e=>e.uri))])];
 let goal=declared;
 if(goal===undefined){
  goal=`${UNRESOLVED}: no DECLARED goal in the evidence pack`;
  report.unresolved.push({artifact:'intent-profile',field:'goal',value:goal,blocking:'intent-profile.goal'});
 }
 return {scene:pack.id,goal,constraints,references};
}

/** B3. Hypotheses are INFERRED: glossary-known ones stay `ambiguous`, unnamed ones `unknown`; every one blocks until a human decides.
 *  Unresolved markers written by the other generators also block, so a human cannot lock them unnoticed. */
function semanticPayload(pack,report){
 const concepts=new Map();
 for(const h of pack.hypotheses){
  if(concepts.has(h.concept))continue;
  const m=resolve(h.concept,{candidates:[h.concept]})[0];
  concepts.set(h.concept,{phrase:h.concept,interpretation:'',status:m.status==='unknown'?'unknown':'ambiguous',...(m.id?{glossaryId:m.id}:{})});
 }
 const all=[...concepts.values()];
 return {concepts:all,blockingAmbiguities:[...all.map(c=>c.phrase),...report.unresolved.map(u=>u.blocking)]};
}

/** B4. One track per actor+property; a keyframe at each observation's range end (measured time), citing the observation id.
 *  Everything not taken from an observation (easing, fps, scenario, segment, initial state) is reported in `report.assumptions`. */
function prototypePayload(pack,report){
 const observations=pack.observations,tracks=new Map(),storyboard=[];
 const assume=(field,value,reason)=>report.assumptions.push({field,value,reason});
 let easingUsed=false;
 for(const o of observations){
  const [start,end]=o.timeRangeMs;
  storyboard.push({timeMs:start,caption:`${o.actorId} ${o.event} ${o.property}`,observationId:o.id});
  if(!numeric(o.measuredValue)){report.unmapped.push({observation:o.id,reason:'measuredValue is not numeric'});continue;}
  const key=`${o.actorId}\u0000${o.property}`;
  if(!tracks.has(key))tracks.set(key,{actorId:o.actorId,property:o.property,keyframes:[]});
  const frames=tracks.get(key).keyframes;
  if(frames.some(f=>f.timeMs===end)){report.unmapped.push({observation:o.id,reason:`duplicate keyframe time ${end}`});continue;}
  frames.push({timeMs:end,value:o.measuredValue,easing:'linear',observationId:o.id});easingUsed=true;
 }
 if(easingUsed)assume('easing','linear','no DECLARED easing binding; generator default applied to every keyframe');
 for(const t of tracks.values())t.keyframes.sort((a,b)=>a.timeMs-b.timeMs);
 storyboard.sort((a,b)=>a.timeMs-b.timeMs);
 const maxTime=Math.max(0,...observations.flatMap(o=>o.timeRangeMs));
 const durationMs=Math.max(1,maxTime);
 if(maxTime<1)assume('durationMs',1,'no observation time above 0; schema minimum applied');
 const DEFAULT_FPS=30,rates=pack.sources.map(s=>s.environment?.frameRate).filter(r=>typeof r==='number'&&Number.isFinite(r)&&Math.round(r)>=1);
 const fps=rates.length?Math.round(rates[0]):DEFAULT_FPS;
 if(!rates.length)assume('fps',DEFAULT_FPS,'no source frameRate that rounds to a positive integer; generator default applied');
 else if(rates[0]!==fps)assume('fps',fps,`source frameRate ${rates[0]} rounded to an integer`);
 // ponytail: the pack has no state model, so `states` stays empty and the scenario cannot name a declared state.
 const initialState=`${UNRESOLVED}: no declared state in the evidence pack`;
 report.unresolved.push({artifact:'prototype-spec',field:'scenarios[0].initialState',value:initialState,blocking:'prototype-spec.scenarios[0].initialState'});
 assume('scenarios[0].initialState',initialState,'pack declares no states; schema requires a string, human must name a declared state');
 assume('scenarios[0]',{id:'reference',events:[]},'placeholder scenario required by the schema; not from evidence');
 assume('reviewSegments[0]',{id:'full',startMs:0,endMs:durationMs,scenarioIds:['reference']},'placeholder segment required by the schema; not from evidence');
 return {durationMs,fps,actors:[...new Set(observations.map(o=>o.actorId))].map(id=>({id})),states:[],transitions:[],tracks:[...tracks.values()],
  storyboard,scenarios:[{id:'reference',initialState,events:[]}],reviewSegments:[{id:'full',startMs:0,endMs:durationMs,scenarioIds:['reference']}]};
}

/**
 * Pure. Returns `{artifacts:[intent,semantic,prototype], report}`.
 * `report` = `{assumptions:[{field,value,reason}], unresolved:[{artifact,field,value,blocking}], unmapped:[...], blocking}`;
 * `report.blocking` IS `semantic.payload.blockingAmbiguities` (one source). Throws `{violations}` for an invalid pack or invalid output.
 * (ponytail: schema check stays in tests because ajv is a devDependency.)
 */
export function buildDrafts(pack,{projectId,packUri}={}){
 if(!projectId)throw new Error('projectId required');
 const check=validateEvidencePack(pack);
 if(!check.ok)throw fail(check.violations);
 const shape=packShapeViolations(pack);
 if(shape.length)throw fail(shape);
 const report={assumptions:[],unresolved:[],unmapped:[]},opts={projectId,packUri};
 const intent=draft(pack,opts,'intent','intent-profile',intentPayload(pack,report));
 const protoBody=prototypePayload(pack,report);
 const semantic=draft(pack,opts,'semantic','semantic-contract',semanticPayload(pack,report),[ref(intent)]);
 report.blocking=semantic.payload.blockingAmbiguities;
 const prototype=draft(pack,opts,'prototype','prototype-spec',protoBody,[ref(intent),ref(semantic)]);
 const artifacts=[intent,semantic,prototype],bad=checkDraftOutputs(artifacts);
 if(bad.length)throw Object.assign(new Error('Invalid draft output'),{violations:bad});
 return {artifacts,report};
}

/**
 * B1-B7: validate, build and write the three drafts to an ArtifactStore.
 * Same pack again: existing identical revisions are reused. Changed pack: next revision per artifact,
 * dependencies re-pinned to the new upstream revisions (RFC 0007); nothing already stored is mutated.
 */
export async function createDrafts(store,pack,options){
 const {artifacts,report}=buildDrafts(pack,options);
 const refs=[];
 for(const a of artifacts){
  const history=await store.history(a.id).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const latest=history.at(-1);
  const next={...a,dependencies:refs.slice(0,a.dependencies.length)};
  if(latest){
   const old=await store.read(a.id,latest);
   if(artifactDigest(old)===artifactDigest({...next,revision:latest})){refs.push({id:a.id,revision:latest,digest:artifactDigest(old)});continue;}
   next.revision=latest+1;
  }
  refs.push(await store.create(next));
 }
 return {refs,report};
}
