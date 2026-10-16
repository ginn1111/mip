// AGE-37: Figma handoff importer (docs/specs/AGE-37.md B1-B4).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {importFigma,readFigmaFile,readFigmaVariables,METHOD} from '../packages/import-figma/index.mjs';
import {validateEvidencePack} from '../packages/evidence/index.mjs';

const FIXTURE='tests/fixtures/figma/file.json';
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const validate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/evidence-pack.schema.json','utf8')));
const opts={uri:'fixture://figma/file.json',capturedAt:'2026-10-15T09:00:00Z',licenseOrPermissionNotes:'Synthetic fixture; redistribution rights not asserted.'};
const VARS='tests/fixtures/figma/variables.json';
const run=()=>importFigma(readFigmaFile(FIXTURE),{...opts,variables:readFigmaVariables(VARS)});
const nodeIds=file=>{const s=new Set(),w=n=>{s.add(n.id);(n.children??[]).forEach(w);};w(file.document);return s;};

test('fixture maps to frames, actors, transitions, constraints (B2)',()=>{
 const out=run();
 assert.deepEqual(out.storyboard.map(f=>f.nodeId),['1:1','2:1']);
 assert.deepEqual(out.actors.map(a=>a.nodeId),['1:2','1:3','1:4','2:2']);
 assert.deepEqual(out.actors[0].bounds,{x:480,y:160,width:320,height:320});
 assert.equal(out.actors[0].name,'Globe');
 const obs=out.pack.observations;
 assert.equal(obs.length,2);
 assert.ok(obs.every(o=>o.measurementMethod===METHOD&&o.measurementMethod==='figma-prototype'));
 assert.deepEqual(obs[0].measuredValue,{destinationId:'2:1',transitionType:'SMART_ANIMATE',durationMs:400,trigger:'ON_CLICK',easing:{value:'EASE_OUT',provenance:'declared-by-figma'}});
 assert.deepEqual(obs[0].timeRangeMs,[0,400]);
 assert.deepEqual(out.constraints.map(c=>c.name),['color/bg']);
});

test('every actor and observation traces to a node id in the file (B2)',()=>{
 const file=readFigmaFile(FIXTURE),ids=nodeIds(file),out=importFigma(file,opts);
 for(const a of out.actors)assert.ok(ids.has(a.nodeId),a.nodeId);
 for(const f of out.storyboard)assert.ok(ids.has(f.nodeId),f.nodeId);
 for(const o of out.pack.observations)assert.ok(ids.has(o.actorId),o.id);
 assert.ok(out.actors.length&&out.pack.observations.length);
});

test('missing timing yields unknowns with a capture suggestion, not guesses (B3)',()=>{
 const {pack,unknowns}=run();
 const skip=pack.observations.find(o=>o.actorId==='1:4');
 assert.equal(skip.measuredValue.durationMs,null);
 assert.ok(unknowns.some(u=>u.code==='TRANSITION_TIMING_MISSING'&&u.nodeId==='1:4'));
 assert.ok(!unknowns.some(u=>u.code==='TRANSITION_TIMING_MISSING'&&u.nodeId==='1:3'));
 assert.ok(unknowns.some(u=>u.code==='FRAME_MOVEMENT_UNKNOWN'&&u.nodeId==='2:1'));
 for(const u of unknowns)assert.match(u.suggestion,/screen capture.*AGE-35/);
});

test('unknown transition destination is listed (B3)',()=>{
 const file=readFigmaFile(FIXTURE);file.document.children[0].children[0].children[1].interactions[0].actions[0].destinationId='9:9';
 assert.ok(importFigma(file,opts).unknowns.some(u=>u.code==='TRANSITION_DESTINATION_UNKNOWN'));
});

test('output validates under AGE-34 with source kind figma and user license notes (B4)',()=>{
 const {pack}=run();
 assert.equal(validate(pack),true,JSON.stringify(validate.errors));
 assert.deepEqual(validateEvidencePack(pack),{ok:true,violations:[]});
 assert.equal(pack.sources[0].kind,'figma');
 assert.equal(pack.sources[0].licenseOrPermissionNotes,opts.licenseOrPermissionNotes);
 assert.deepEqual(pack.hypotheses,[]);
 assert.ok(!JSON.stringify(pack).match(/approv|lock/i));
});

test('license notes, uri and capturedAt are required (B4)',()=>{
 const file=readFigmaFile(FIXTURE);
 for(const k of Object.keys(opts))assert.throws(()=>importFigma(file,{...opts,[k]:''}),TypeError,k);
 assert.throws(()=>importFigma({},opts),TypeError);
});

test('unsupported node types are listed, not dropped (edge case)',()=>{
 assert.deepEqual(run().unsupported.map(u=>[u.nodeId,u.type]),[['1:5','STICKY'],['3:1','SECTION']]);
});

test('local file with duplicate keys is rejected (B1)',()=>{
 const p=join(mkdtempSync(join(tmpdir(),'figma-')),'dup.json');
 writeFileSync(p,'{"document":{"id":"0:0","type":"DOCUMENT","type":"CANVAS"}}');
 assert.throws(()=>readFigmaFile(p),/Duplicate JSON key/);
});

const clone=()=>structuredClone(readFigmaFile(FIXTURE));
const frame1=f=>f.document.children[0].children[0];
const withAction=(f,action)=>{frame1(f).children[1].interactions[0].actions[0]=action;return f;};

test('variables come from a separate variables/local response, not the file (B2)',()=>{
 const f=clone();f.variables={'VariableID:9:9':{name:'ignored'}};
 assert.deepEqual(importFigma(f,opts).constraints,[]);
 assert.deepEqual(run().constraints.map(c=>c.variableId),['VariableID:1:1']);
 assert.throws(()=>importFigma(clone(),{...opts,variables:{}}),TypeError);
});

test('frames inside SECTION, GROUP and TRANSFORM_GROUP are walked (blocker)',()=>{
 const f=clone(),page=f.document.children[0];
 const fr=(id,kids=[])=>({id,name:id,type:'FRAME',children:kids});
 page.children.push(
  {id:'4:1',name:'S',type:'SECTION',children:[fr('4:2',[{id:'4:3',name:'L',type:'RECTANGLE'}])]},
  {id:'5:1',name:'G',type:'GROUP',children:[fr('5:2')]},
  {id:'6:1',name:'T',type:'TRANSFORM_GROUP',children:[fr('6:2',[{id:'6:3',name:'X',type:'TRANSFORM_GROUP',children:[{id:'6:4',name:'Y',type:'TEXT'}]}])]});
 const out=importFigma(f,opts);
 assert.deepEqual(out.storyboard.map(s=>s.nodeId),['1:1','2:1','4:2','5:2','6:2']);
 assert.deepEqual(out.actors.filter(a=>a.frameId==='6:2').map(a=>a.nodeId),['6:4']);
 assert.ok(out.actors.some(a=>a.nodeId==='4:3'&&a.frameId==='4:2'));
 for(const id of ['4:1','5:1','6:1','6:3'])assert.equal(out.unsupported.filter(u=>u.nodeId===id).length,1,id);
});

test('invalid durations fail closed (blocker)',()=>{
 for(const d of [1.5,-1,'400',NaN,Infinity,{}])
  assert.throws(()=>importFigma(withAction(clone(),{type:'NODE',destinationId:'2:1',transition:{type:'DISSOLVE',duration:d}}),opts),TypeError,String(d));
 const f=clone();frame1(f).children[2].transitionDuration=0.5;
 assert.throws(()=>importFigma(f,opts),TypeError);
 const ok=importFigma(withAction(clone(),{type:'NODE',destinationId:'2:1',transition:{type:'DISSOLVE',duration:0}}),opts);
 assert.equal(validate(ok.pack),true);
});

test('legacy and modern forms of one transition are deduped (nit)',()=>{
 const f=clone();Object.assign(frame1(f).children[1],{transitionNodeID:'2:1',transitionDuration:400});
 const obs=importFigma(f,opts).pack.observations.filter(o=>o.actorId==='1:3');
 assert.equal(obs.length,1);
 assert.equal(obs[0].measuredValue.transitionType,'SMART_ANIMATE');
 Object.assign(frame1(f).children[1],{transitionNodeID:'1:1'});
 assert.equal(importFigma(f,opts).pack.observations.filter(o=>o.actorId==='1:3').length,2);
});

test('ignored action types are reported as unsupported (nit)',()=>{
 for(const type of ['BACK','URL','CONDITIONAL','SET_VARIABLE']){
  const out=importFigma(withAction(clone(),{type}),opts);
  assert.ok(out.unsupported.some(u=>u.nodeId==='1:3'&&u.type===`ACTION:${type}`),type);
  assert.ok(!out.pack.observations.some(o=>o.actorId==='1:3'),type);
 }
});
