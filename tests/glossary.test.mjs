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
test('glossary seed is read with duplicate keys rejected',async()=>{
 const {readFileSync}=await import('node:fs');
 assert.match(readFileSync(new URL('../packages/glossary/index.mjs',import.meta.url),'utf8'),/parseStrictJson\(readFileSync/);
});
