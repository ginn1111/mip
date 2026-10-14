import {evaluate} from './index.mjs';
/** Three synchronized read models from one deterministic scene snapshot. */
export function reviewFrame(spec,scenarioId,timeMs){
 const snapshot=evaluate(spec,scenarioId,timeMs);
 const storyboard=(spec.storyboard??[]).filter(f=>f.timeMs<=timeMs).at(-1)??null;
 const activeTransitions=(spec.transitions??[]).filter(t=>t.startMs!==undefined&&t.startMs<=timeMs&&timeMs<t.startMs+t.durationMs);
 return {scenarioId,timeMs,snapshot,storyboard,activeTransitions,animation:snapshot.actors};
}
export function createReviewComment({spec,scenarioId,timeMs,segmentId,authorId,text}){
 if(!authorId||!text?.trim())throw new Error('Author and review comment required');
 const frame=reviewFrame(spec,scenarioId,timeMs);
 return {scenarioId,timeMs,segmentId:segmentId??null,authorId,text,sceneState:frame.snapshot.state};
}
