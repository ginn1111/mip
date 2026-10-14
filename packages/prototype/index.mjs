/**
 * MIP v0.7 deterministic prototype evaluator.
 * Pure absolute-time evaluation. State changes result only from scenario events.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=(x,name)=>name==='ease-in'?x*x:name==='ease-out'?1-(1-x)*(1-x):name==='ease-in-out'?x*x*(3-2*x):x;
const interpolate=(a,b,u)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length?
 a.map((v,i)=>v+(b[i]-v)*u):typeof a==='number'&&typeof b==='number'?a+(b-a)*u:u<1?a:b;
export function validatePrototype(spec){
 if(!Number.isSafeInteger(spec.durationMs)||spec.durationMs<=0)throw new Error('Invalid duration');
 const ids=new Set();
 for(const actor of spec.actors??[]){if(!actor.id||ids.has(actor.id))throw new Error('Duplicate actor');ids.add(actor.id);}
 const occupied=new Set();
 for(const track of spec.tracks??[]){
  if(!ids.has(track.actorId))throw new Error('Unknown actor');
  const key=track.actorId+':'+track.property;
  if(occupied.has(key))throw new Error('Conflicting tracks: '+key);
  occupied.add(key);
  let last=-1;
  for(const f of track.keyframes??[]){
   if(!Number.isFinite(f.timeMs)||f.timeMs<=last||f.timeMs>spec.durationMs)throw new Error('Invalid keyframe times');
   last=f.timeMs;
  }
 }
 for(const scenario of spec.scenarios??[]){
  if(!scenario.id)throw new Error('Scenario ID required');
  let last=-1;
  for(const e of scenario.events??[]){
   if(!Number.isFinite(e.timeMs)||e.timeMs<last||e.timeMs>spec.durationMs)throw new Error('Unordered scenario events');
   last=e.timeMs;
  }
 }
 return true;
}
export function evaluate(spec,scenarioId,timeMs){
 validatePrototype(spec);
 if(!Number.isFinite(timeMs)||timeMs<0||timeMs>spec.durationMs)throw new Error('Time outside timeline');
 const scenario=spec.scenarios.find(s=>s.id===scenarioId);
 if(!scenario)throw new Error('Unknown scenario');
 const state={actors:Object.fromEntries(spec.actors.map(actor=>[actor.id,{...(actor.initialProperties??{})}])),state:scenario.initialState,events:[]};
 for(const e of scenario.events){if(e.timeMs>timeMs)break;state.events.push({type:e.type,timeMs:e.timeMs});if(e.toState)state.state=e.toState;}
 for(const track of spec.tracks){
  const frames=track.keyframes;
  if(!frames.length)continue;
  let value=frames[0].value;
  for(let i=1;i<frames.length;i++){
   const a=frames[i-1],b=frames[i];
   if(timeMs>=b.timeMs){value=b.value;continue;}
   if(timeMs>a.timeMs){value=interpolate(a.value,b.value,ease(clamp((timeMs-a.timeMs)/(b.timeMs-a.timeMs),0,1),b.easing??'linear'));}
   break;
  }
  state.actors[track.actorId][track.property]=value;
 }
 return state;
}
