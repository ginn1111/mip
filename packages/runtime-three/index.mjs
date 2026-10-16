// AGE-31 B1/B4: plain Three.js adapter. Explicit binding table; no easing, values come only from evaluate().
import {evaluate} from '../prototype/index.mjs';

const resolve=(root,path)=>{const keys=path.split('.');const last=keys.pop();let o=root;for(const k of keys)o=o?.[k];return [o,last];};

/**
 * target.bindings: {'actorId.property': {object, path}} e.g. {'globe.rotation': {object: mesh, path: 'rotation.y'}}
 * Bound set (identical to runtime-gsap): every track property plus every actor initialProperties key; each needs a binding.
 */
export function bind(spec,scenarioId,target){
 evaluate(spec,scenarioId,0); // fail closed at bind time: invalid spec or unknown scenario throws here, not at first seek
 const table=target?.bindings??{};
 const known=new Set((spec.tracks??[]).map(t=>t.actorId+'.'+t.property));
 for(const a of spec.actors??[])for(const p of Object.keys(a.initialProperties??{}))known.add(a.id+'.'+p);
 const entries=[];
 for(const key of new Set([...known,...Object.keys(table)])){
  const [id,...rest]=key.split('.'),p=rest.join('.');
  const b=table[key];
  const [parent,field]=b?.object&&typeof b.path==='string'?resolve(b.object,b.path):[];
  if(!known.has(key)||!parent||!(field in parent))throw new Error(`Unknown binding: ${id}.${p}`);
  entries.push([id,p,parent,field]);
 }
 let destroyed=false;
 return {
  seek(timeMs){
   if(destroyed)throw new Error('Adapter destroyed');
   const {actors}=evaluate(spec,scenarioId,timeMs);
   for(const [id,p,parent,field] of entries){
    const v=actors[id][p];
    if(Array.isArray(v)&&typeof parent[field]?.set==='function')parent[field].set(...v);else parent[field]=v;
   }
  },
  destroy(){destroyed=true;entries.length=0;},
 };
}
