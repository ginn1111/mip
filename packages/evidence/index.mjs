// Reference Evidence Pack checks that JSON Schema cannot express (docs/specs/AGE-34.md B6-B8).
// Pure: no I/O. The pack is not an artifact kind; it is referenced from an artifact's `evidence[]`.
import {digest} from '../artifacts/index.mjs';

export const PACK_MEDIA_TYPE='application/vnd.mip.reference-evidence-pack+json';
const CLASSES=['OBSERVED','INFERRED','DECLARED'];
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Referential integrity and provenance rules. Returns `{ok, violations:[{code, ...}]}`; never throws on bad data; fails closed. */
export function validateEvidencePack(pack){
 const violations=[],add=(code,detail={})=>violations.push({code,...detail});
 if(!isObj(pack)){add('NOT_AN_OBJECT');return {ok:false,violations};}
 const arr=(v,detail)=>Array.isArray(v)?v:(add('NOT_AN_ARRAY',detail),[]);
 const get=field=>arr(pack[field],{field}).filter(item=>isObj(item)||(add('INVALID_ITEM',{field}),false));
 const sources=get('sources'),observations=get('observations'),hypotheses=get('hypotheses'),bindings=get('bindings');
 for(const [kind,items] of [['source',sources],['observation',observations],['hypothesis',hypotheses]]){
  const seen=new Set();
  for(const item of items){if(seen.has(item.id))add('DUPLICATE_ID',{kind,id:item.id});seen.add(item.id);}
 }
 const sourceIds=new Set(sources.map(s=>s.id)),obsIds=new Set(observations.map(o=>o.id)),hypIds=new Set(hypotheses.map(h=>h.id));
 for(const o of observations){
  if(!sourceIds.has(o.sourceId))add('UNKNOWN_SOURCE',{observation:o.id,sourceId:o.sourceId});
  const [start,end]=arr(o.timeRangeMs,{field:'timeRangeMs',observation:o.id});
  if(start>end)add('TIME_RANGE_REVERSED',{observation:o.id});
 }
 for(const h of hypotheses)for(const id of arr(h.sourceObservationIds,{field:'sourceObservationIds',hypothesis:h.id}))if(!obsIds.has(id))add('UNKNOWN_OBSERVATION',{hypothesis:h.id,observationId:id});
 const classOf=new Map();
 for(const b of bindings){
  const at=b.intentField,obs=arr(b.observationIds,{field:'observationIds',binding:at}),hyp=arr(b.hypothesisIds,{field:'hypothesisIds',binding:at});
  for(const id of obs)if(!obsIds.has(id))add('UNKNOWN_OBSERVATION',{binding:at,observationId:id});
  for(const id of hyp)if(!hypIds.has(id))add('UNKNOWN_HYPOTHESIS',{binding:at,hypothesisId:id});
  const cls=b.provenanceClass;
  if(!CLASSES.includes(cls)){add('UNKNOWN_PROVENANCE_CLASS',{binding:at});continue;}
  if(classOf.has(at)&&classOf.get(at)!==cls)add('CONFLICTING_PROVENANCE',{binding:at});
  classOf.set(at,cls);
  if(cls!=='DECLARED'&&!obs.length&&!hyp.length)add('EMPTY_BINDING',{binding:at});
  else if(cls==='OBSERVED'&&!obs.length)add('PROVENANCE_MISMATCH',{binding:at,reason:'OBSERVED needs an observation'});
  else if(cls==='INFERRED'&&!hyp.length)add('PROVENANCE_MISMATCH',{binding:at,reason:'INFERRED needs a hypothesis'});
 }
 return {ok:!violations.length,violations};
}

/** B8: artifact `evidence[]` entry bound to the pack's JCS digest. Throws on an invalid pack or empty `uri`. */
export function packEvidence(pack,uri){
 if(typeof uri!=='string'||!uri)throw new Error('packEvidence: uri must be a non-empty string');
 const {ok,violations}=validateEvidencePack(pack);
 if(!ok)throw new Error(`packEvidence: invalid evidence pack: ${violations.map(v=>v.code).join(',')}`);
 return {uri,digest:digest(pack),mediaType:PACK_MEDIA_TYPE};
}
