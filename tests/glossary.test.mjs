import test from 'node:test';
import assert from 'node:assert/strict';
import {glossary,resolve,extractIntent,proposeSemanticContract,reviewSemanticContract} from '../packages/glossary/index.mjs';
test('30 curated proposed entries with provenance',()=>{const g=glossary();assert.equal(g.length,30);assert.ok(g.every(e=>e.status==='proposed' && e.provenance.reference));});
test('resolve organic and cinematic phrases',()=>{const results=resolve('Make the globe organic and cinematic');assert.deepEqual(results.map(r=>r.term),['organic','cinematic']);});
test('word boundaries avoid accidental matches',()=>assert.equal(resolve('my snappiness').length,0));
test('project overrides core interpretation',()=>{const override={...glossary().find(t=>t.term==='magnetic'),interpretations:[{id:'attention',context:['zodiac'],meaning:'focus attraction',motionHints:['dolly-in']}]};assert.equal(resolve('magnetic',{project:[override]})[0].interpretations[0].meaning,'focus attraction');});
test('ambiguity is raised for magnetic',()=>{const i=extractIntent('Make it magnetic');assert.deepEqual(i.blockingAmbiguities,['magnetic']);assert.equal(proposeSemanticContract(i).concepts[0].status,'ambiguous');});
test('human resolution yields a proposed, not fabricated, approval',()=>{
 const i=extractIntent('Make it magnetic',{sceneId:'scorpio'});
 const r=reviewSemanticContract(proposeSemanticContract(i),{actorId:'human-1',reviewedDigest:'sha256:'+ '0'.repeat(64),decisions:[{phrase:'magnetic',interpretation:'focus attraction'}]});
 assert.deepEqual(r.contract.blockingAmbiguities,[]);
 assert.equal(r.review.decision,'proposed_for_approval');
 assert.throws(()=>reviewSemanticContract(proposeSemanticContract(i)),/human identity/);
});
test('intent proposal preserves raw language',()=>{const i=extractIntent('Make it weighty',{sceneId:'scorpio'});assert.equal(i.scene,'scorpio');assert.equal(i.goal,'Make it weighty');assert.equal(proposeSemanticContract(i).concepts[0].phrase,'weighty');});

// AGE-18: every core seed entry has grounded examples (docs/specs/AGE-18.md B1, B3, B5)
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
test('every core seed entry has a valid, findable example and the seed validates against the schema',()=>{
 const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
 const validate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/glossary.schema.json','utf8')));
 for(const e of glossary()){
  assert.equal(validate(e),true,e.id+' '+JSON.stringify(validate.errors));
  assert.ok(Array.isArray(e.examples)&&e.examples.length>=1,e.id+' needs at least one example');
  for(const x of e.examples)assert.ok(resolve(x.phrase).some(m=>m.id===e.id),e.id+': phrase "'+x.phrase+'" must resolve to its own entry');
 }
});
test('seed governance unchanged by examples: 30 entries, all proposed, magnetic still ambiguous',()=>{
 const g=glossary();
 assert.equal(g.length,30);assert.ok(g.every(e=>e.status==='proposed'&&e.provenance.source==='project'));
 assert.deepEqual(extractIntent('Make it magnetic').blockingAmbiguities,['magnetic']);
});
test('governance document exists and covers lifecycle, revision, ids, deprecation and precedence',()=>{
 const t=readFileSync('glossary/GOVERNANCE.md','utf8');
 for(const word of ['proposed','approved','deprecated','revision','id','specialize','TBD: approver'])assert.ok(t.includes(word),'GOVERNANCE.md must mention '+word);
});
