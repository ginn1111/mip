// AGE-38: draft MIP artifacts from a Reference Evidence Pack (docs/specs/AGE-38.md B1-B6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';
import {packEvidence} from '../packages/evidence/index.mjs';
import {buildDrafts,createDrafts} from '../packages/draft-artifacts/index.mjs';

const load=f=>JSON.parse(readFileSync('tests/fixtures/evidence-pack/'+f,'utf8'));
const pack=()=>load('valid-scorpio.json');
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const artifactValidate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/artifact.schema.json','utf8')));
const payloadValidate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/payload.schema.json','utf8')));
const opts={projectId:'scorpio'};
const lock=a=>{const h=artifactDigest(a);return {...a,lifecycle:'locked',approvals:[{actor:{role:'human',id:'r'},decision:'approved',reviewedDigest:h}],lock:{digest:h,dependencyDigests:a.dependencies.map(d=>d.digest)}};};

test('Scorpio fixture yields three drafts that validate against artifact and payload schemas (B6)',()=>{
 const {artifacts}=buildDrafts(pack(),opts);
 assert.deepEqual(artifacts.map(a=>a.kind),['intent-profile','semantic-contract','prototype-spec']);
 for(const a of artifacts){
  assert.equal(artifactValidate(a),true,a.kind+JSON.stringify(artifactValidate.errors));
  const ok=payloadValidate({kind:a.kind,payload:a.payload});
  if(a.kind==='semantic-contract'){
   // Open decision flagged in PR: payload schema forbids any blockingAmbiguities, yet B3 needs them to block. Only that rule may fail.
   assert.equal(ok,false);
   assert.ok(payloadValidate.errors.some(e=>e.schemaPath==='#/oneOf/1/properties/payload/properties/blockingAmbiguities/maxItems'));
   // With the blocking list emptied the same payload is schema-valid: that rule is the only violation.
   assert.equal(payloadValidate({kind:a.kind,payload:{...a.payload,blockingAmbiguities:[]}}),true,JSON.stringify(payloadValidate.errors));
  }else assert.equal(ok,true,a.kind+JSON.stringify(payloadValidate.errors));
 }
});
test('drafts are written to an ArtifactStore and read back',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-draft-'));
 try{
  const store=new ArtifactStore(dir),{refs}=await createDrafts(store,pack(),opts);
  assert.equal(refs.length,3);
  for(const r of refs)assert.equal((await store.read(r.id,r.revision)).lifecycle,'draft');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('failing packs are rejected with violations (B1)',()=>{
 for(const f of readdirSync('tests/fixtures/evidence-pack').filter(f=>f.startsWith('integrity-')||f.startsWith('provenance-'))){
  assert.throws(()=>buildDrafts(load(f),opts),e=>e.violations?.length>0,f);
 }
});
test('no DECLARED goal yields an explicitly unresolved goal; a DECLARED string goal is used (B2)',()=>{
 const intent=buildDrafts(pack(),opts).artifacts[0];
 assert.match(intent.payload.goal,/^UNRESOLVED/);
 assert.ok(intent.payload.references.includes('fixture://scorpio-reference.mp4'));
 const p=pack();
 p.observations.push({...p.observations[2],id:'obs-goal',event:'declare',property:'goal',measuredValue:'reveal the constellation',timeRangeMs:[0,0]});
 p.bindings=[{intentField:'goal',observationIds:['obs-goal'],hypothesisIds:[],provenanceClass:'DECLARED'}];
 assert.equal(buildDrafts(p,opts).artifacts[0].payload.goal,'reveal the constellation');
});
test('INFERRED and unknown concepts stay unresolved and keep the prototype gate BLOCKED (B3)',async()=>{
 const p=pack();
 p.hypotheses.push({id:'hyp-2',concept:'zorbly',proposedInterpretation:'x',sourceObservationIds:['obs-1'],confidence:0.3,alternatives:[],reviewStatus:'proposed'});
 const [intent,semantic]=buildDrafts(p,opts).artifacts;
 const byPhrase=Object.fromEntries(semantic.payload.concepts.map(c=>[c.phrase,c]));
 assert.equal(byPhrase.magnetic.status,'ambiguous');
 assert.equal(byPhrase.zorbly.status,'unknown');
 assert.deepEqual(semantic.payload.blockingAmbiguities,['magnetic','zorbly']);
 assert.ok(semantic.payload.concepts.every(c=>c.interpretation===''));
 const i=lock(intent),s=lock({...semantic,dependencies:[{id:i.id,revision:1,digest:artifactDigest(i)}]});
 const out=await validateGate('prototype',[i,s],async()=>i);
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='UNRESOLVED_AMBIGUITY'),JSON.stringify(out.violations));
});
test('prototype-spec: measured times, linear easing, observation ids, nothing invented (B4)',()=>{
 const {artifacts:[,,proto]}=buildDrafts(pack(),opts);
 const globe=proto.payload.tracks.find(t=>t.actorId==='globe'&&t.property==='rotation');
 assert.deepEqual(globe.keyframes,[{timeMs:800,value:0,easing:'linear',observationId:'obs-1'},{timeMs:3600,value:1.2,easing:'linear',observationId:'obs-2'}]);
 assert.equal(proto.payload.tracks.length,2);
 assert.deepEqual(proto.payload.storyboard.map(s=>[s.timeMs,s.observationId]),[[0,'obs-1'],[800,'obs-2'],[3600,'obs-3']]);
 assert.equal(proto.payload.durationMs,3600);
 assert.equal(proto.payload.fps,30);
 assert.deepEqual(proto.payload.scenarios[0].events,[]);
 assert.ok(proto.payload.tracks.flatMap(t=>t.keyframes).every(k=>k.easing==='linear'&&k.observationId));
});
test('non-numeric observations are reported, not invented into tracks (B4)',()=>{
 const p=pack();p.observations[1].measuredValue='fast';
 const {artifacts:[,,proto],report}=buildDrafts(p,opts);
 assert.ok(report.unmapped.some(u=>u.observation==='obs-2'));
 assert.ok(!proto.payload.tracks.flatMap(t=>t.keyframes).some(k=>k.observationId==='obs-2'));
});
test('every draft cites the pack and the digest changes with one observation in all drafts (B5)',()=>{
 const p=pack(),before=buildDrafts(p,opts).artifacts;
 for(const a of before)assert.deepEqual(a.evidence,[packEvidence(p,'mip:evidence-pack/scorpio-reference-pack')]);
 const changed=pack();changed.observations[0].measuredValue=9;
 const after=buildDrafts(changed,opts).artifacts;
 before.forEach((a,i)=>assert.notEqual(a.evidence[0].digest,after[i].evidence[0].digest,a.kind));
});
test('no draft has approvals or a lock (B6)',()=>{
 for(const a of buildDrafts(pack(),opts).artifacts){
  assert.equal(a.lifecycle,'draft');assert.deepEqual(a.approvals,[]);assert.equal('lock' in a,false);
 }
});
test('package source creates no approval or lock and parses no JSON itself',()=>{
 const src=readFileSync('packages/draft-artifacts/index.mjs','utf8');
 assert.doesNotMatch(src,/JSON\.parse|lock\s*:|ApprovalService|decision\s*:/);
});
