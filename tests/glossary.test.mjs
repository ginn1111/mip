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

// AGE-19: unknown classification (docs/specs/AGE-19.md B1-B7)
import {artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';
const lockedArtifact=a=>{const h=artifactDigest(a);return {...a,lifecycle:'locked',approvals:[{actor:{role:'human',id:'reviewer'},decision:'approved',reviewedDigest:h}],lock:{digest:h,dependencyDigests:a.dependencies.map(d=>d.digest)}};};
const artifact=(id,kind,payload,deps=[])=>({protocol:'mip/0.7',id,projectId:'demo',revision:1,kind,lifecycle:'draft',dependencies:deps,payload,evidence:[],approvals:[]});

test('candidate with no entry is classified unknown',()=>{
 const r=resolve('Make it zorbly',{candidates:['zorbly']});
 assert.deepEqual(r,[{term:'zorbly',status:'unknown',interpretations:[],provenance:null,approvalStatus:null}]);
});
test('without candidates results are unchanged',()=>{
 assert.deepEqual(resolve('Make the globe organic and cinematic'),resolve('Make the globe organic and cinematic',{candidates:[]}));
 assert.deepEqual(extractIntent('Make it zorbly and organic').blockingAmbiguities,[]);
});
test('known candidates are not unknown; duplicates, blanks and aliases are handled',()=>{
 const alias=glossary().find(e=>e.term==='organic').aliases[0];
 const r=resolve(`Make it ${alias} and zorbly`,{candidates:['zorbly','zorbly','  ','',alias,'organic']});
 assert.deepEqual(r.filter(m=>m.status==='unknown').map(m=>m.term),['zorbly']);
 assert.equal(r.filter(m=>m.term==='organic').length,1);
});
test('unknown candidate blocks intent and is proposed without interpretation',()=>{
 const i=extractIntent('Make it zorbly',{candidates:['zorbly']});
 assert.deepEqual(i.blockingAmbiguities,['zorbly']);
 const c=proposeSemanticContract(i).concepts[0];
 assert.deepEqual(c,{phrase:'zorbly',interpretation:'',status:'unknown'});
 assert.equal('glossaryId' in c,false);
});
test('an unknown concept keeps the semantic contract blocked at the gate',async()=>{
 const intent=lockedArtifact(artifact('i','intent-profile',{goal:'x',scene:'s',constraints:[]}));
 const contract=proposeSemanticContract(extractIntent('Make it zorbly',{candidates:['zorbly']}));
 const sem=lockedArtifact(artifact('s','semantic-contract',contract,[{id:'i',revision:1,digest:artifactDigest(intent)}]));
 const out=await validateGate('prototype',[intent,sem],async()=>intent);
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='UNRESOLVED_AMBIGUITY'));
});
test('a human decision resolves an unknown phrase and clears the block',()=>{
 const contract=proposeSemanticContract(extractIntent('Make it zorbly',{candidates:['zorbly']}));
 const r=reviewSemanticContract(contract,{actorId:'human-1',reviewedDigest:'sha256:'+'0'.repeat(64),decisions:[{phrase:'zorbly',interpretation:'bouncy overshoot'}]});
 assert.deepEqual(r.contract.blockingAmbiguities,[]);
 assert.equal(r.contract.concepts[0].status,'resolved');
 assert.equal(r.contract.concepts[0].interpretation,'bouncy overshoot');
 assert.throws(()=>reviewSemanticContract(contract,{decisions:[{phrase:'zorbly',interpretation:'x'}]}),/human identity/);
});
test('scene layer wins over core for a candidate and resolves once',()=>{
 const core=glossary().find(e=>e.term==='magnetic');
 const scene={...core,interpretations:[{id:'a',context:['z'],meaning:'focus',motionHints:[]}]};
 const r=resolve('magnetic',{candidates:['magnetic'],scene:[scene]});
 assert.equal(r.length,1);assert.equal(r[0].id,core.id);assert.equal(r[0].status,'resolved');assert.equal(r[0].interpretations[0].meaning,'focus');
});
