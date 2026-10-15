// AGE-18: glossary examples and governance (docs/specs/AGE-18.md B1, B3, B4, B5).
// Separate file so it never collides with other changes to tests/glossary.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {glossary,resolve,extractIntent} from '../packages/glossary/index.mjs';
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
test('governance document covers lifecycle, revision, ids, precedence and the two approval sources',()=>{
 const t=readFileSync('glossary/GOVERNANCE.md','utf8');
 for(const word of ['proposed','approved','deprecated','revision','id','specialize','Direct human requirement','Official source','never approves its own'])assert.ok(t.includes(word),'GOVERNANCE.md must mention '+word);
});
