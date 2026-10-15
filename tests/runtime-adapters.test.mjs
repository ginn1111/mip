// AGE-31: Three.js and GSAP runtime adapters (docs/specs/AGE-31.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {Object3D,Mesh,Vector3} from 'three';
import {scorpio} from '../examples/scorpio/review.mjs';
import {bind as bindThree} from '../packages/runtime-three/index.mjs';
import {bind as bindGsap} from '../packages/runtime-gsap/index.mjs';
import {evaluate} from '../packages/prototype/index.mjs';
import {SCENARIO,instants,verificationRecord} from './runtime-support.mjs';

const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const payloadSchema=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/payload.schema.json','utf8')));
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const threeTarget=()=>{const globe=new Mesh(),stars=new Object3D();stars.material={opacity:0};
 return {globe,stars,target:{bindings:{'globe.rotation':{object:globe,path:'rotation.y'},'stars.opacity':{object:stars,path:'material.opacity'}}}};};
const gsapTarget=()=>{const actors={globe:{},stars:{}};return {actors,target:{actors}};};

test('B1/B5 three: values equal evaluator at every review instant, recorded as unlocked verification-record',()=>{
 const {globe,stars,target}=threeTarget(),a=bindThree(scorpio,SCENARIO,target);
 const rec=verificationRecord('three',a,(id,p)=>id==='globe'?globe.rotation.y:stars.material.opacity);
 assert.equal(rec.checks.length,instants().length);assert.equal(rec.result,'pass');
 assert.equal(payloadSchema({kind:'verification-record',payload:rec}),true,JSON.stringify(payloadSchema.errors));
 a.destroy();
});
test('B1/B5 gsap: values equal evaluator at every review instant',()=>{
 const {actors,target}=gsapTarget(),a=bindGsap(scorpio,SCENARIO,target);
 const rec=verificationRecord('gsap',a,(id,p)=>actors[id][p]);
 assert.equal(rec.result,'pass');
 assert.equal(payloadSchema({kind:'verification-record',payload:rec}),true,JSON.stringify(payloadSchema.errors));
 a.destroy();
});
test('B3 gsap: timeline progress drives bound values through seek',()=>{
 const {actors,target}=gsapTarget(),a=bindGsap(scorpio,SCENARIO,target);
 a.timeline.progress(2400/scorpio.durationMs);
 const want=evaluate(scorpio,SCENARIO,2400).actors;
 assert.ok(Math.abs(actors.globe.rotation-want.globe.rotation)<1e-6);assert.equal(a.timeline.paused(),true);
 a.destroy();
});
test('B3 mutation: adding a GSAP ease fails the conformance test',()=>{
 const orig=src('packages/runtime-gsap/index.mjs'),mutated=orig.replace("ease:'none'","ease:'power2.in'");
 assert.notEqual(mutated,orig);
 const file='packages/runtime-gsap/mutant-ease.mjs';
 writeFileSync(new URL('../'+file,import.meta.url),mutated);
 return import('../'+file).then(m=>{
  const {actors,target}=gsapTarget(),a=m.bind(scorpio,SCENARIO,target);
  a.timeline.progress(0.5);
  const want=evaluate(scorpio,SCENARIO,scorpio.durationMs*0.5).actors;
  assert.ok(Math.abs(actors.globe.rotation-want.globe.rotation)>1e-6,'ease must change timeline-driven values');
  a.destroy();
 }).finally(()=>rmSync(new URL('../'+file,import.meta.url)));
});
test('B3 gsap source adds no easing other than linear',()=>assert.deepEqual([...src('packages/runtime-gsap/index.mjs').matchAll(/ease:\s*'([^']*)'/g)].map(m=>m[1]),['none']));
test('edge: seeking backwards equals a fresh seek',()=>{
 for(const [make,read] of [
  [()=>{const t=threeTarget();return [bindThree(scorpio,SCENARIO,t.target),()=>[t.globe.rotation.y,t.stars.material.opacity]];}],
  [()=>{const t=gsapTarget();return [bindGsap(scorpio,SCENARIO,t.target),()=>[t.actors.globe.rotation,t.actors.stars.opacity]];}]]){
  const [a,r]=make();a.seek(4000);a.seek(1500);const back=r();
  const [b,rb]=make();b.seek(1500);assert.deepEqual(back,rb());a.destroy();b.destroy();
 }
});
test('edge: unknown binding throws naming actor and property',()=>{
 const {target}=threeTarget();
 assert.throws(()=>bindThree(scorpio,SCENARIO,{bindings:{...target.bindings,'globe.scale':{object:new Mesh(),path:'scale.x'}}}),/Unknown binding: globe\.scale/);
 assert.throws(()=>bindThree(scorpio,SCENARIO,{bindings:{'globe.rotation':target.bindings['globe.rotation']}}),/Unknown binding: stars\.opacity/);
 assert.throws(()=>bindThree(scorpio,SCENARIO,{bindings:{...target.bindings,'globe.rotation':{object:new Mesh(),path:'nope.y'}}}),/Unknown binding: globe\.rotation/);
 assert.throws(()=>bindGsap(scorpio,SCENARIO,{actors:{globe:{}}}),/Unknown binding: stars\.opacity/);
});
test('three: array values use Vector3.set',()=>{
 const spec={durationMs:1000,actors:[{id:'a',initialProperties:{pos:[0,0,0]}}],scenarios:[{id:'s',initialState:'i',events:[]}],tracks:[{actorId:'a',property:'pos',keyframes:[{timeMs:0,value:[0,0,0]},{timeMs:1000,value:[1,2,3]}]}]};
 const o=new Object3D(),a=bindThree(spec,'s',{bindings:{'a.pos':{object:o,path:'position'}}});a.seek(500);
 assert.deepEqual(o.position.toArray(),[0.5,1,1.5]);assert.ok(o.position instanceof Vector3);
});
test('B2 core packages import neither three nor gsap; both are optional peers + dev deps',()=>{
 const pkg=JSON.parse(src('package.json'));
 for(const n of ['three','gsap']){assert.ok(pkg.peerDependencies[n]);assert.equal(pkg.peerDependenciesMeta[n].optional,true);assert.ok(pkg.devDependencies[n]);assert.equal(pkg.dependencies?.[n],undefined);}
 assert.equal(pkg.dependencies,undefined);
 for(const dir of readdirSync(new URL('../packages',import.meta.url)).filter(d=>!d.startsWith('runtime-')))
  for(const f of readdirSync(new URL('../packages/'+dir,import.meta.url)).filter(f=>f.endsWith('.mjs')))
   assert.doesNotMatch(src(`packages/${dir}/${f}`),/from\s+['"](three|gsap)['"]|import\(['"](three|gsap)/,`${dir}/${f}`);
});
test('constraints: adapters create no approval or lock and parse no JSON',()=>{
 for(const p of ['packages/runtime-three/index.mjs','packages/runtime-gsap/index.mjs']){
  assert.doesNotMatch(src(p),/approv|lifecycle|\block|JSON\.parse/i,p);
 }
});
