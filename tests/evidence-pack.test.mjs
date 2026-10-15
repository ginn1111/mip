// AGE-34: Reference Evidence Pack (docs/specs/AGE-34.md B1-B9).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {digest} from '../packages/artifacts/index.mjs';
import {validateEvidencePack,packEvidence,PACK_MEDIA_TYPE} from '../packages/evidence/index.mjs';

const dir='tests/fixtures/evidence-pack/';
const load=f=>JSON.parse(readFileSync(dir+f,'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const schema=JSON.parse(readFileSync('schemas/v0.7/evidence-pack.schema.json','utf8'));
const validate=ajv.compile(schema);
const artifactValidate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/artifact.schema.json','utf8')));
const index=load('index.json');
const expectedCode={
 'integrity-unknown-source':'UNKNOWN_SOURCE','integrity-unknown-observation':'UNKNOWN_OBSERVATION','integrity-unknown-hypothesis':'UNKNOWN_HYPOTHESIS',
 'integrity-duplicate-id':'DUPLICATE_ID','integrity-time-reversed':'TIME_RANGE_REVERSED','integrity-empty-binding':'EMPTY_BINDING',
 'provenance-observed-only-hypothesis':'PROVENANCE_MISMATCH','provenance-inferred-no-hypothesis':'PROVENANCE_MISMATCH'};

test('fixture index lists every invalid fixture file and no other',()=>{
 const files=readdirSync(dir).filter(f=>f!=='index.json'&&f!=='valid-scorpio.json').sort();
 assert.deepEqual(index.map(x=>x.file).sort(),files);
});
test('valid Scorpio pack passes the schema and the integrity checks',()=>{
 const pack=load('valid-scorpio.json');
 assert.equal(validate(pack),true,JSON.stringify(validate.errors));
 assert.deepEqual(validateEvidencePack(pack),{ok:true,violations:[]});
});
for(const {file,reason} of load('index.json').filter(x=>x.file.startsWith('schema-')))
 test(`schema rejects ${file}: ${reason}`,()=>assert.equal(validate(load(file)),false));
for(const {file} of load('index.json').filter(x=>!x.file.startsWith('schema-')))
 test(`${file} is schema-valid but fails integrity with ${expectedCode[file.replace('.json','')]}`,()=>{
  const pack=load(file);
  assert.equal(validate(pack),true,JSON.stringify(validate.errors));
  const out=validateEvidencePack(pack);
  assert.equal(out.ok,false);
  assert.ok(out.violations.some(v=>v.code===expectedCode[file.replace('.json','')]),JSON.stringify(out.violations));
 });
test('DECLARED binding may be empty, and an instant observation is valid',()=>{
 const pack=load('valid-scorpio.json');
 assert.ok(pack.bindings.some(b=>b.provenanceClass==='DECLARED'&&!b.observationIds.length&&!b.hypothesisIds.length));
 assert.ok(pack.observations.some(o=>o.timeRangeMs[0]===o.timeRangeMs[1]));
 assert.equal(validateEvidencePack(pack).ok,true);
});
test('a pack with only OBSERVED bindings and no hypotheses is valid',()=>{
 const pack=load('valid-scorpio.json');
 pack.hypotheses=[];pack.bindings=[pack.bindings[0]];
 assert.equal(validate(pack),true,JSON.stringify(validate.errors));assert.equal(validateEvidencePack(pack).ok,true);
});
test('packEvidence builds an artifact evidence entry bound to the pack digest',()=>{
 const pack=load('valid-scorpio.json'),entry=packEvidence(pack,'mip:evidence-pack/scorpio-reference-pack');
 assert.deepEqual(entry,{uri:'mip:evidence-pack/scorpio-reference-pack',digest:digest(pack),mediaType:PACK_MEDIA_TYPE});
 assert.equal(PACK_MEDIA_TYPE,'application/vnd.mip.reference-evidence-pack+json');
 const artifact={protocol:'mip/0.7',id:'intent',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'draft',dependencies:[],payload:{scene:'scorpio',goal:'reveal',constraints:[]},evidence:[entry],approvals:[]};
 assert.equal(artifactValidate(artifact),true,JSON.stringify(artifactValidate.errors));
 const changed={...pack,observations:[{...pack.observations[0],measuredValue:9},...pack.observations.slice(1)]};
 assert.notEqual(packEvidence(changed,entry.uri).digest,entry.digest,'a changed pack changes the evidence digest');
});
test('schema has no field asserting original code or exact easing, and requires method and confidence',()=>{
 const obs=schema.properties.observations.items;
 assert.ok(obs.required.includes('measurementMethod')&&obs.required.includes('confidence'));
 assert.equal(obs.additionalProperties,false);
 assert.equal(JSON.stringify(schema).match(/originalCode|easing|implementation/gi),null);
});
