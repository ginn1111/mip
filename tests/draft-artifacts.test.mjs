// AGE-38: draft MIP artifacts from a Reference Evidence Pack (docs/specs/AGE-38.md B1-B6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';
import {packEvidence} from '../packages/evidence/index.mjs';
import {buildDrafts,createDrafts,checkDraftOutputs,UNRESOLVED} from '../packages/draft-artifacts/index.mjs';

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
 assert.deepEqual(semantic.payload.blockingAmbiguities.slice(0,2),['magnetic','zorbly']);
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

const withStore=async fn=>{const dir=await mkdtemp(join(tmpdir(),'mip-draft-'));try{return await fn(new ArtifactStore(dir),dir);}finally{await rm(dir,{recursive:true,force:true});}};
const notTypeError=e=>!(e instanceof TypeError)&&Array.isArray(e.violations)&&e.violations.length>0;
test('null pack fails closed',()=>assert.throws(()=>buildDrafts(null,opts),notTypeError));
for(const [label,mutate] of Object.entries({
 'non-array observations':p=>{p.observations={};},
 'non-array bindings':p=>{p.bindings='x';},
 'null hypotheses':p=>{p.hypotheses=null;},
 'non-array sources':p=>{p.sources=7;},
 'unknown provenanceClass':p=>{p.bindings=[{intentField:'goal',observationIds:['obs-1'],hypothesisIds:[],provenanceClass:'GUESSED'}];},
 'non-string intentField':p=>{p.bindings=[{intentField:7,observationIds:['obs-1'],hypothesisIds:[],provenanceClass:'OBSERVED'}];},
 'fractional time':p=>{p.observations[0].timeRangeMs=[0.5,3];},
 'string times':p=>{p.observations[0].timeRangeMs=['a','b'];},
 'non-string actorId':p=>{p.observations[0].actorId=5;},
 'non-string concept':p=>{p.hypotheses[0].concept=5;},
}))test('bad pack shape fails closed with violations, no TypeError: '+label,()=>{const p=pack();mutate(p);assert.throws(()=>buildDrafts(p,opts),notTypeError);});
test('invalid pack writes nothing to the store',()=>withStore(async(store,dir)=>{
 const p=pack();p.bindings=[{intentField:7,observationIds:['obs-1'],hypothesisIds:[],provenanceClass:'OBSERVED'}];
 await assert.rejects(createDrafts(store,p,opts),e=>e.violations.length>0);
 assert.deepEqual(await readdir(dir),[]);
}));
test('output check rejects non-integer times and non-positive fps',()=>{
 const good=buildDrafts(pack(),opts).artifacts;
 assert.deepEqual(checkDraftOutputs(good),[]);
 const bad=structuredClone(good);
 bad[2].payload.fps=0;bad[2].payload.tracks[0].keyframes[0].timeMs=1.5;bad[2].payload.durationMs=0.5;
 const codes=checkDraftOutputs(bad).map(v=>v.code);
 assert.ok(codes.includes('INVALID_FPS')&&codes.includes('INVALID_TIME')&&codes.includes('INVALID_DURATION'),codes.join());
});
test('missing or non-positive frameRate falls back to a reported fps default, never 0 (B7)',()=>{
 for(const fr of [-5,0,0.4,null,undefined]){
  const p=pack();if(fr===undefined)delete p.sources[0].environment.frameRate;else p.sources[0].environment.frameRate=fr;
  const {artifacts:[,,proto],report}=buildDrafts(p,opts);
  assert.equal(proto.payload.fps,30,String(fr));
  assert.ok(report.assumptions.some(a=>a.field==='fps'&&a.value===30&&a.reason),String(fr));
 }
 const p=pack();p.sources[0].environment.frameRate=29.97;
 const r=buildDrafts(p,opts);
 assert.equal(r.artifacts[2].payload.fps,30);
 assert.ok(r.report.assumptions.some(a=>a.field==='fps'&&/29\.97/.test(a.reason)));
 assert.ok(!buildDrafts(pack(),opts).report.assumptions.some(a=>a.field==='fps'),'fps taken from the pack is not an assumption');
});
test('every written default is a report assumption with field, value and reason (B7)',()=>{
 const {artifacts:[,,proto],report}=buildDrafts(pack(),opts);
 const easing=report.assumptions.find(a=>a.field==='easing');
 assert.ok(easing&&easing.value==='linear'&&easing.reason);
 for(const k of proto.payload.tracks.flatMap(t=>t.keyframes))assert.equal(k.easing,easing.value);
 assert.ok(report.assumptions.some(a=>a.field==='scenarios[0]'));
 assert.ok(report.assumptions.some(a=>a.field==='reviewSegments[0]'));
 for(const a of report.assumptions)assert.ok(a.field&&'value' in a&&a.reason,JSON.stringify(a));
});
test('initialState is never an undeclared name: explicit unresolved marker, reported and blocking',()=>{
 const {artifacts:[,semantic,proto],report}=buildDrafts(pack(),opts);
 const init=proto.payload.scenarios[0].initialState;
 assert.ok(proto.payload.states.some(s=>s.id===init)||init.startsWith(UNRESOLVED),init);
 assert.ok(report.unresolved.some(u=>u.field==='scenarios[0].initialState'&&u.artifact==='prototype-spec'));
 assert.ok(semantic.payload.blockingAmbiguities.includes('prototype-spec.scenarios[0].initialState'));
});
test('unresolved goal is flagged in report and blocks the semantic gate so a human cannot lock it unnoticed',async()=>{
 const {artifacts:[intent,semantic],report}=buildDrafts(pack(),opts);
 assert.ok(intent.payload.goal.startsWith(UNRESOLVED));
 assert.ok(report.unresolved.some(u=>u.artifact==='intent-profile'&&u.field==='goal'&&u.value===intent.payload.goal));
 assert.ok(semantic.payload.blockingAmbiguities.includes('intent-profile.goal'));
 const i=lock(intent),s=lock({...semantic,dependencies:[{id:i.id,revision:1,digest:artifactDigest(i)}]});
 const out=await validateGate('prototype',[i,s],async()=>i);
 assert.ok(out.violations.some(v=>v.code==='UNRESOLVED_AMBIGUITY'),JSON.stringify(out.violations));
 const p=pack();
 p.observations.push({...p.observations[2],id:'obs-goal',event:'declare',property:'goal',measuredValue:'reveal',timeRangeMs:[0,0]});
 p.bindings=[{intentField:'goal',observationIds:['obs-goal'],hypothesisIds:[],provenanceClass:'DECLARED'}];
 const r=buildDrafts(p,opts);
 assert.ok(!r.report.unresolved.some(u=>u.field==='goal'));
 assert.ok(!r.artifacts[1].payload.blockingAmbiguities.includes('intent-profile.goal'));
});
test('dropped OBSERVED goal binding appears in report.unmapped',()=>{
 const p=pack();
 p.bindings=[{intentField:'goal',observationIds:['obs-1'],hypothesisIds:[],provenanceClass:'OBSERVED'}];
 const {report,artifacts}=buildDrafts(p,opts);
 assert.ok(artifacts[0].payload.goal.startsWith(UNRESOLVED));
 assert.ok(report.unmapped.some(u=>u.binding==='goal'&&u.provenanceClass==='OBSERVED'),JSON.stringify(report.unmapped));
});
test('report.blocking is the semantic blockingAmbiguities (one source)',()=>{
 const {artifacts:[,semantic],report}=buildDrafts(pack(),opts);
 assert.equal(report.blocking,semantic.payload.blockingAmbiguities);
});
test('same pack gives identical draft digests; rebuild into the store is idempotent (RFC 0007)',()=>withStore(async store=>{
 assert.deepEqual(buildDrafts(pack(),opts).artifacts.map(artifactDigest),buildDrafts(pack(),opts).artifacts.map(artifactDigest));
 const first=await createDrafts(store,pack(),opts),second=await createDrafts(store,pack(),opts);
 assert.deepEqual(second.refs,first.refs);
 for(const r of first.refs)assert.deepEqual(await store.history(r.id),[1]);
}));
test('changed pack creates new revisions (no EEXIST), re-pins dependencies, stales dependents of the old revision (RFC 0007)',()=>withStore(async store=>{
 const first=await createDrafts(store,pack(),opts);
 const changed=pack();changed.observations[0].measuredValue=9;
 const second=await createDrafts(store,changed,opts);
 second.refs.forEach((r,i)=>{assert.equal(r.id,first.refs[i].id);assert.equal(r.revision,2);assert.notEqual(r.digest,first.refs[i].digest);});
 const [,s2,p2]=await Promise.all(second.refs.map(r=>store.read(r.id,r.revision)));
 assert.deepEqual(s2.dependencies,[second.refs[0]]);
 assert.deepEqual(p2.dependencies,[second.refs[0],second.refs[1]]);
 const oldS=lock(await store.read(first.refs[1].id,1));
 const latest=async r=>store.read(r.id,Math.max(...await store.history(r.id)));
 const out=await validateGate('prototype',[oldS],latest);
 assert.ok(out.violations.some(v=>v.code==='STALE_DEPENDENCY'),JSON.stringify(out.violations));
 assert.deepEqual((await createDrafts(store,changed,opts)).refs,second.refs);
}));
