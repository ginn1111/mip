// Pure helpers shared by the alignment server and its browser client.
/** Reference frames from a Reference Evidence Pack. Assumption (open decision): a frame's instant is the start of its observation's timeRangeMs. */
export const framesOf=pack=>(pack?.observations??[]).flatMap(o=>(o.evidenceRefs??[]).map(e=>({timeMs:o.timeRangeMs[0],uri:e.uri,digest:e.digest,mediaType:e.mediaType,observationId:o.id})));
/** Nearest frame to instant `t` (earlier one on a tie) and its signed offset `frame.timeMs - t`; null without frames. */
export function nearestFrame(frames,t){
 let best=null;
 for(const f of frames){const d=Math.abs(f.timeMs-t);if(!best||d<best.d||(d===best.d&&f.timeMs<best.frame.timeMs))best={frame:f,d};}
 return best&&{frame:best.frame,offsetMs:best.frame.timeMs-t};
}
/** Every keyframe that cites an observation: the inferred transitions a human accepts, rejects or edits. */
export const keyframesOf=spec=>(spec.tracks??[]).flatMap(t=>t.keyframes.filter(k=>k.observationId).map(k=>({observationId:k.observationId,actorId:t.actorId,property:t.property,timeMs:k.timeMs,value:k.value})));
