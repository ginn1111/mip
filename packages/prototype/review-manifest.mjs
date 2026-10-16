// Digest-bound frame-manifest evidence for prototype reviews (docs/specs/AGE-27.md B1-B4).
// Pure: recomputed by the review service and the phase gate; manifests are never stored.
import {digest} from '../artifacts/index.mjs';
import {reviewFrame} from './review.mjs';

export const FRAME_MANIFEST_MEDIA_TYPE='application/vnd.mip.frame-manifest+json';
const round=v=>typeof v==='number'?Math.round(v*1e6)/1e6:Array.isArray(v)?v.map(round):
 v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,round(x)])):v;
const comments=(scenarioReviews,scenarioId)=>(scenarioReviews??[]).filter(r=>r?.scenarioId===scenarioId)
 .flatMap(r=>(r.segmentReviews??[]).flatMap(s=>(s.comments??[]).map(c=>c.timeMs)));

/** B2: sorted unique integer instants: bounds, in-range keyframes, segment edges, comment times. */
export function reviewInstants(spec,scenarioId,scenarioReviews){
 const inRange=t=>Number.isInteger(t)&&t>=0&&t<=spec.durationMs;
 const all=[0,spec.durationMs,...(spec.storyboard??[]).map(f=>f.timeMs),
  ...(spec.reviewSegments??[]).filter(s=>s.scenarioIds?.includes(scenarioId)).flatMap(s=>[s.startMs,s.endMs]),
  ...comments(scenarioReviews,scenarioId)];
 return [...new Set(all.filter(inRange))].sort((a,b)=>a-b);
}

/** B1: one rounded frame per instant. */
export const reviewManifest=(spec,scenarioId,instants)=>({scenarioId,instants,frames:instants.map(t=>round(reviewFrame(spec,scenarioId,t)))});

/** B3/B4: one evidence entry per scenario, in spec order. */
export const expectedEvidence=(prototype,scenarioReviews)=>prototype.payload.scenarios.map(({id})=>({
 uri:`mip:frame-manifest/${prototype.id}@${prototype.revision}/${id}`,
 digest:digest(reviewManifest(prototype.payload,id,reviewInstants(prototype.payload,id,scenarioReviews))),
 mediaType:FRAME_MANIFEST_MEDIA_TYPE}));
