import test from 'node:test';
import assert from 'node:assert/strict';
import {glossary,resolve,extractIntent,proposeSemanticContract} from '../packages/glossary/index.mjs';
test('30 curated entries with proper provenance',()=>{const g=glossary();assert.equal(g.length,30);assert.ok(g.every(e=>e.status==='proposed' && e.provenance.reference));});
test('resolve organic and cinematic phrases',()=>{const results=resolve('Make the globe organic and cinematic');assert.deepEqual(results.map(r=>r.term),['organic','cinematic']);});
test('word boundaries avoid accidental matches',()=>assert.equal(resolve('my snappiness').length,0));
test('project overrides core interpretation',()=>{const override={...glossary().find(t=>t.term==='magnetic'),interpretations:[{id:'attention',context:['zodiac'],meaning:'focus attraction',motionHints:['dolly-in']}]};assert.equal(resolve('magnetic',{project:[override]})[0].interpretations[0].meaning,'focus attraction');});
test('intent proposal preserves raw language',()=>{const i=extractIntent('Make it weighty',{sceneId:'scorpio'});assert.equal(i.scene,'scorpio');assert.equal(i.goal,'Make it weighty');assert.equal(proposeSemanticContract(i).concepts[0].phrase,'weighty');});
