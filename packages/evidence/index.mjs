// Reference Evidence Pack checks that JSON Schema cannot express (docs/specs/AGE-34.md B6-B8).
// Pure: no I/O. The pack is not an artifact kind; it is referenced from an artifact's `evidence[]`.
import {digest} from '../artifacts/index.mjs';

export const PACK_MEDIA_TYPE='application/vnd.mip.reference-evidence-pack+json';
const list=v=>Array.isArray(v)?v:[];

/** Referential integrity and provenance rules. Returns `{ok, violations:[{code, ...}]}`; never throws on bad data. */
export function validateEvidencePack(pack){
 const violations=[],add=(code,detail={})=>violations.push({code,...detail});
 const sources=list(pack?.sources),observations=list(pack?.observations),hypotheses=list(pack?.hypotheses),bindings=list(pack?.bindings);
 for(const [kind,items] of [['source',sources],['observation',observations],['hypothesis',hypotheses]]){
  const seen=new Set();
  for(const item of items){if(seen.has(item?.id))add('DUPLICATE_ID',{kind,id:item.id});seen.add(item?.id);}
 }
 const sourceIds=new Set(sources.map(s=>s?.id)),obsIds=new Set(observations.map(o=>o?.id)),hypIds=new Set(hypotheses.map(h=>h?.id));
 for(const o of observations){
  if(!sourceIds.has(o?.sourceId))add('UNKNOWN_SOURCE',{observation:o?.id,sourceId:o?.sourceId});
  const [start,end]=list(o?.timeRangeMs);
  if(start>end)add('TIME_RANGE_REVERSED',{observation:o?.id});
 }
 for(const h of hypotheses)for(const id of list(h?.sourceObservationIds))if(!obsIds.has(id))add('UNKNOWN_OBSERVATION',{hypothesis:h?.id,observationId:id});
 for(const b of bindings){
  const at=b?.intentField,obs=list(b?.observationIds),hyp=list(b?.hypothesisIds);
  for(const id of obs)if(!obsIds.has(id))add('UNKNOWN_OBSERVATION',{binding:at,observationId:id});
  for(const id of hyp)if(!hypIds.has(id))add('UNKNOWN_HYPOTHESIS',{binding:at,hypothesisId:id});
  const cls=b?.provenanceClass;
  if(cls!=='DECLARED'&&!obs.length&&!hyp.length)add('EMPTY_BINDING',{binding:at});
  else if(cls==='OBSERVED'&&!obs.length)add('PROVENANCE_MISMATCH',{binding:at,reason:'OBSERVED needs an observation'});
  else if(cls==='INFERRED'&&!hyp.length)add('PROVENANCE_MISMATCH',{binding:at,reason:'INFERRED needs a hypothesis'});
 }
 return {ok:!violations.length,violations};
}

/** B8: artifact `evidence[]` entry bound to the pack's JCS digest. */
export const packEvidence=(pack,uri)=>({uri,digest:digest(pack),mediaType:PACK_MEDIA_TYPE});
