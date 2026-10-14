import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,validatePrototype} from '../packages/prototype/index.mjs';
const spec={durationMs:5000,fps:30,actors:[{id:'globe',initialProperties:{rotation:0,glow:0}}],states:[{id:'idle'},{id:'selected'}],
 transitions:[],tracks:[{actorId:'globe',property:'rotation',keyframes:[{timeMs:0,value:0},{timeMs:1000,value:0},{timeMs:3000,value:90,easing:'ease-in-out'}]}],
 storyboard:[],scenarios:[{id:'scorpio',initialState:'idle',events:[{timeMs:500,type:'select',toState:'selected'}]}]};
test('deterministic snapshot and backward seeking',()=>{
 const a=evaluate(spec,'scorpio',2000),b=evaluate(spec,'scorpio',2000);
 assert.deepEqual(a,b);
 assert.equal(a.actors.globe.rotation,45);
 evaluate(spec,'scorpio',4000);
 assert.deepEqual(evaluate(spec,'scorpio',2000),a);
 assert.equal(evaluate(spec,'scorpio',0).state,'idle');
 assert.equal(evaluate(spec,'scorpio',500).state,'selected');
});
test('interpolation boundaries and validity',()=>{
 assert.equal(evaluate(spec,'scorpio',1000).actors.globe.rotation,0);
 assert.equal(evaluate(spec,'scorpio',3000).actors.globe.rotation,90);
 assert.throws(()=>evaluate(spec,'bad',1000),/scenario/);
 assert.throws(()=>evaluate(spec,'scorpio',5001),/Time/);
});
test('conflicting tracks are rejected',()=>{
 const bad={...spec,tracks:[...spec.tracks,spec.tracks[0]]};
 assert.throws(()=>validatePrototype(bad),/Conflicting tracks/);
});
test('nonmonotonic keyframes are rejected',()=>{
 const bad=structuredClone(spec);bad.tracks[0].keyframes[1].timeMs=0;
 assert.throws(()=>validatePrototype(bad),/Invalid keyframe/);
});
