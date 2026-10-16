// AGE-31 B1/B3: GSAP adapter. A paused linear timeline maps progress to absolute time; values come only from evaluate().
import {gsap} from 'gsap';
import {evaluate} from '../prototype/index.mjs';

/**
 * target: {actors:{[actorId]:object}}; each bound property is written as actors[actorId][property].
 * Bound set (identical to runtime-three): every track property plus every actor initialProperties key.
 */
export function bind(spec,scenarioId,target){
 evaluate(spec,scenarioId,0); // fail closed at bind time: invalid spec or unknown scenario throws here, not at first seek
 const actors=target?.actors??{};
 const props=new Map();
 for(const t of spec.tracks??[])props.set(t.actorId+'.'+t.property,[t.actorId,t.property]);
 for(const a of spec.actors??[])for(const p of Object.keys(a.initialProperties??{}))props.set(a.id+'.'+p,[a.id,p]);
 for(const [id,p] of props.values())if(!actors[id])throw new Error(`Unknown binding: ${id}.${p}`);
 let destroyed=false;
 const apply=timeMs=>{
  if(destroyed)return;
  const {actors:values}=evaluate(spec,scenarioId,timeMs);
  for(const [id,p] of props.values())actors[id][p]=values[id][p];
 };
 const D=spec.durationMs;
 const timeline=gsap.timeline({paused:true});
 // Linear tween of absolute ms; easing lives only in evaluate().
 const clock={t:0};
 timeline.to(clock,{t:D,duration:D/1000,ease:'none',onUpdate:()=>apply(clock.t)});
 return {
  timeline,
  // suppressEvents=true: onUpdate must not fire a second apply; seek applies exactly once.
  seek(timeMs){if(destroyed)throw new Error('Adapter destroyed');timeline.time(timeMs/1000,true);apply(timeMs);},
  destroy(){destroyed=true;timeline.kill();},
 };
}
