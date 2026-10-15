// AGE-31 B1/B3: GSAP adapter. A paused linear timeline maps progress to absolute time; values come only from evaluate().
import {gsap} from 'gsap';
import {evaluate} from '../prototype/index.mjs';

/** target: {actors:{[actorId]:object}}; each bound property is written as actors[actorId][property]. */
export function bind(spec,scenarioId,target){
 const actors=target?.actors??{};
 const props=new Map();
 for(const t of spec.tracks??[])props.set(t.actorId+'.'+t.property,[t.actorId,t.property]);
 for(const [id,p] of props.values())if(!actors[id])throw new Error(`Unknown binding: ${id}.${p}`);
 const apply=timeMs=>{
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
  seek(timeMs){apply(timeMs);timeline.time(timeMs/1000);},
  destroy(){timeline.kill();},
 };
}
