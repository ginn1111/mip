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
import {SCENARIO,TOLERANCE,instants,verificationRecord,storedLockedPrototype,lockedArtifact,prototypeArtifact} from './runtime-support.mjs';
import {mkdtempSync,rmSync as rm} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const payloadSchema=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/payload.schema.json','utf8')));
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const threeTarget=()=>{const globe=new Mesh(),stars=new Object3D();stars.material={opacity:0};
 return {globe,stars,target:{bindings:{'globe.rotation':{object:globe,path:'rotation.y'},'stars.opacity':{object:stars,path:'material.opacity'}}}};};
const gsapTarget=()=>{const actors={globe:{},stars:{}};return {actors,target:{actors}};};

test('B1/B5 three: values equal evaluator at every review instant, recorded as unlocked verification-record',async()=>{
 const proto=await storedLockedPrototype();
 const {globe,stars,target}=threeTarget(),a=bindThree(proto.payload,SCENARIO,target);
 const rec=verificationRecord('three',a,(id,p)=>id==='globe'?globe.rotation.y:stars.material.opacity,proto);
 assert.equal(rec.checks.length,instants().length);assert.equal(rec.result,'pass');
 assert.equal(payloadSchema({kind:'verification-record',payload:rec}),true,JSON.stringify(payloadSchema.errors));
 a.destroy();
});
test('B1/B5 gsap: values equal evaluator at every review instant',async()=>{
 const proto=await storedLockedPrototype();
 const {actors,target}=gsapTarget(),a=bindGsap(proto.payload,SCENARIO,target);
 const rec=verificationRecord('gsap',a,(id,p)=>actors[id][p],proto);
 assert.equal(rec.result,'pass');
 assert.equal(payloadSchema({kind:'verification-record',payload:rec}),true,JSON.stringify(payloadSchema.errors));
 a.destroy();
});
test('B5 verification references the locked prototype-spec digest in implementationRef and checks',async()=>{
 const proto=await storedLockedPrototype(),{actors,target}=gsapTarget(),a=bindGsap(proto.payload,SCENARIO,target);
 const rec=verificationRecord('gsap',a,(id,p)=>actors[id][p],proto);
 assert.ok(proto.lock.digest.startsWith('sha256:'));
 assert.ok(rec.checks.every(c=>c.name.includes(proto.lock.digest)));
 // implementationRef digest depends on the prototype digest: a different locked spec yields a different ref.
 const other=lockedArtifact(prototypeArtifact({...scorpio,fps:60}));
 const {actors:a2,target:t2}=gsapTarget(),b=bindGsap(other.payload,SCENARIO,t2);
 assert.notEqual(verificationRecord('gsap',b,(id,p)=>a2[id][p],other).implementationRef.digest,rec.implementationRef.digest);
});
test('B5 verification refuses an unlocked, unapproved, superseded or digest-changed prototype-spec',async()=>{
 const proto=await storedLockedPrototype(),{actors,target}=gsapTarget(),a=bindGsap(scorpio,SCENARIO,target),read=(id,p)=>actors[id][p];
 const run=p=>verificationRecord('gsap',a,read,p);
 assert.doesNotThrow(()=>run(proto));
 assert.throws(()=>run(prototypeArtifact()),/not locked/);
 assert.throws(()=>run({...proto,lifecycle:'superseded'}),/not locked/);
 assert.throws(()=>run({...proto,approvals:[]}),/lacks human approval/);
 assert.throws(()=>run({...proto,approvals:[{...proto.approvals[0],actor:{role:'agent',id:'a'}}]}),/lacks human approval/);
 assert.throws(()=>run({...proto,payload:{...proto.payload,durationMs:proto.payload.durationMs+1}}),/digest mismatch/);
 assert.throws(()=>run({...proto,kind:'intent-profile'}),/Not a prototype-spec/);
 assert.throws(()=>run(undefined),/Not a prototype-spec/);
});
test('B5 tolerance 1e-6 is marked pending owner decision in code',()=>{
 assert.equal(TOLERANCE,1e-6);
 assert.match(src('tests/runtime-support.mjs'),/1e-6 is an ASSUMPTION pending owner decision/);
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
 // Mutant lives in an OS temp dir, never under packages/; imports are rewritten to absolute URLs so it still resolves.
 const dir=mkdtempSync(join(tmpdir(),'mip-mutant-')),file=join(dir,'mutant-ease.mjs');
 const abs=mutated.replace("'gsap'",JSON.stringify(import.meta.resolve('gsap'))).replace("'../prototype/index.mjs'",JSON.stringify(new URL('../packages/prototype/index.mjs',import.meta.url).href));
 assert.notEqual(abs,mutated);
 writeFileSync(file,abs);
 return import(pathToFileURL(file).href).then(m=>{
  const {actors,target}=gsapTarget(),a=m.bind(scorpio,SCENARIO,target);
  a.timeline.progress(0.5);
  const want=evaluate(scorpio,SCENARIO,scorpio.durationMs*0.5).actors;
  assert.ok(Math.abs(actors.globe.rotation-want.globe.rotation)>1e-6,'ease must change timeline-driven values');
  a.destroy();
 }).finally(()=>rm(dir,{recursive:true,force:true}));
});
test('B3 mutation: the mutant is written outside packages/ and cleaned up',()=>{
 assert.doesNotMatch(src('tests/runtime-adapters.test.mjs'),/packages\/runtime-gsap\/mutant/);
 assert.deepEqual(readdirSync(new URL('../packages/runtime-gsap',import.meta.url)),['index.mjs']);
});
test('gsap: one seek applies bound values once (no double apply)',()=>{
 let writes=0;const actors={};
 for(const [id,p] of [['globe','rotation'],['stars','opacity']]){actors[id]={};Object.defineProperty(actors[id],p,{set(){writes++;},get(){return 0;},enumerable:true});}
 const a=bindGsap(scorpio,SCENARIO,{actors});
 a.seek(2400);assert.equal(writes,2);
 a.seek(2400);assert.equal(writes,4);
 a.destroy();
});
test('destroy stops later seeks on both adapters',()=>{
 for(const [a,probe] of [
  (()=>{const t=threeTarget();return [bindThree(scorpio,SCENARIO,t.target),()=>t.globe.rotation.y];})(),
  (()=>{const t=gsapTarget();return [bindGsap(scorpio,SCENARIO,t.target),()=>t.actors.globe.rotation];})()]){
  a.seek(3200);const before=probe();assert.notEqual(before,0);
  a.destroy();
  assert.throws(()=>a.seek(0),/destroyed/);
  assert.equal(probe(),before);
  assert.doesNotThrow(()=>a.destroy());
 }
});
test('bind validates the scenario and spec at bind time on both adapters',()=>{
 const t=threeTarget(),g=gsapTarget();
 assert.throws(()=>bindThree(scorpio,'nope',t.target),/Unknown scenario/);
 assert.throws(()=>bindGsap(scorpio,'nope',g.target),/Unknown scenario/);
 const bad={...scorpio,durationMs:0};
 assert.throws(()=>bindThree(bad,SCENARIO,t.target),/Invalid duration/);
 assert.throws(()=>bindGsap(bad,SCENARIO,g.target),/Invalid duration/);
});
test('both adapters bind the same property set: tracks plus actor initialProperties',()=>{
 const spec={durationMs:1000,actors:[{id:'a',initialProperties:{x:0,y:5}}],scenarios:[{id:'s',initialState:'i',events:[]}],tracks:[{actorId:'a',property:'x',keyframes:[{timeMs:0,value:0},{timeMs:1000,value:1}]}]};
 const o={x:0,y:0};
 const three=bindThree(spec,'s',{bindings:{'a.x':{object:o,path:'x'},'a.y':{object:o,path:'y'}}});three.seek(500);
 assert.deepEqual(o,{x:0.5,y:5});
 assert.throws(()=>bindThree(spec,'s',{bindings:{'a.x':{object:o,path:'x'}}}),/Unknown binding: a\.y/);
 const actors={a:{}};const gsapA=bindGsap(spec,'s',{actors});gsapA.seek(500);
 assert.deepEqual(actors.a,{x:0.5,y:5});
 assert.throws(()=>bindGsap(spec,'s',{actors:{}}),/Unknown binding: a\.x/);
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
test('package.json: three peer range has an upper bound',()=>{
 const r=JSON.parse(src('package.json')).peerDependencies.three;
 assert.match(r,/<\s*\d/,r);
});
test('constraints: adapters create no approval or lock and parse no JSON',()=>{
 for(const p of ['packages/runtime-three/index.mjs','packages/runtime-gsap/index.mjs']){
  assert.doesNotMatch(src(p),/approv|lifecycle|\block|JSON\.parse/i,p);
 }
});
