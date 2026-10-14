// Pure, defensive prototype-review rules shared by the approval service and the phase gate.
// ponytail: hand-rolled shape checks avoid a runtime ajv dependency; swap for compiled schema when ajv ships as a dependency.
const arr=v=>Array.isArray(v)?v:[];
const unique=a=>new Set(a).size===a.length;
const sameSet=(a,b)=>unique(a)&&unique(b)&&a.length===b.length&&b.every(x=>a.includes(x));
const text=v=>typeof v==='string'&&v.length>0;
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>k in o);

/** Non-empty, unique, time-valid plan in which every scenario has at least one segment. */
export function planValid(spec){
 const scenarios=arr(spec?.scenarios).map(s=>s?.id),segments=arr(spec?.reviewSegments);
 if(!scenarios.length||!segments.length||!scenarios.every(text)||!unique(scenarios))return false;
 const ids=segments.map(s=>s?.id);
 if(!ids.every(text)||!unique(ids))return false;
 const valid=segments.every(s=>Array.isArray(s.scenarioIds)&&s.scenarioIds.length>0&&unique(s.scenarioIds)&&s.scenarioIds.every(id=>scenarios.includes(id))&&
  Number.isInteger(s.startMs)&&Number.isInteger(s.endMs)&&s.startMs>=0&&s.startMs<s.endMs&&s.endMs<=spec.durationMs);
 return valid&&scenarios.every(id=>segments.some(s=>s.scenarioIds.includes(id)));
}

export const requiredSegments=(spec,scenarioId)=>arr(spec.reviewSegments).filter(s=>s.scenarioIds.includes(scenarioId)).map(s=>s.id);

export function reviewShapeValid(scenarioReviews){
 return Array.isArray(scenarioReviews)&&scenarioReviews.every(r=>exact(r,['scenarioId','accepted','segmentReviews'])&&text(r.scenarioId)&&
  typeof r.accepted==='boolean'&&Array.isArray(r.segmentReviews)&&r.segmentReviews.every(s=>exact(s,['segmentId','accepted','comments'])&&
   text(s.segmentId)&&typeof s.accepted==='boolean'&&Array.isArray(s.comments)&&s.comments.every(c=>typeof c==='string')));
}

/** Every scenario and every required segment is present exactly once and accepted. */
export function reviewComplete(spec,scenarioReviews){
 if(!planValid(spec)||!reviewShapeValid(scenarioReviews))return false;
 if(!sameSet(scenarioReviews.map(r=>r.scenarioId),spec.scenarios.map(s=>s.id)))return false;
 return scenarioReviews.every(r=>r.accepted&&sameSet(r.segmentReviews.map(s=>s.segmentId),requiredSegments(spec,r.scenarioId))&&r.segmentReviews.every(s=>s.accepted));
}
