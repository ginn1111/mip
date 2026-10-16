import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../packages/artifacts/approval.mjs';
import {PrototypeReviewService} from '../packages/prototype/review-evidence.mjs';
import {validateGate} from '../packages/gates/index.mjs';

const spec=()=>({protocol:'mip/0.7',id:'scorpio-prototype',projectId:'scorpio',kind:'prototype-spec',revision:1,
 lifecycle:'in_review',dependencies:[],payload:{durationMs:4500,fps:30,actors:[],states:[],transitions:[],tracks:[],storyboard:[],
  scenarios:[{id:'select-scorpio',initialState:'idle',events:[]}],reviewSegments:[
   {id:'anticipation',startMs:0,endMs:800,scenarioIds:['select-scorpio']},
   {id:'reveal',startMs:800,endMs:4500,scenarioIds:['select-scorpio']}],
 },evidence:[],approvals:[]});
const completeReviews=()=>[{scenarioId:'select-scorpio',accepted:true,segmentReviews:[
 {segmentId:'anticipation',accepted:true,comments:[]},{segmentId:'reveal',accepted:true,comments:[{timeMs:2000,text:'Timing approved'}]}]}];

async function setup(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-review-'));
 try{
  const store=new ArtifactStore(directory),prototype=spec();
  await store.create(prototype);
  const authenticator=createApprovalAuthenticator({issuer:'test-host',secret:'test-secret',authenticate:async credential=>
   credential==='human-session'?{id:'designer-1',role:'human'}:null});
  const approval=new ApprovalService(store,{...authenticator,loadDependency:ref=>approval.sealed(ref.id,ref.revision)});
  const reviews=new PrototypeReviewService(store,{approvalService:approval});
  await fn({store,prototype,approval,reviews,authenticator,directory});
 }finally{await rm(directory,{recursive:true,force:true});}
}

test('persists complete scenario and segment evidence against exact prototype revision',()=>setup(async({store,prototype,reviews,approval,authenticator})=>{
 const prototypeRef={id:prototype.id,revision:prototype.revision,digest:artifactDigest(prototype)};
 const result=await reviews.approve({id:'scorpio-review',projectId:'scorpio',revision:1,principal:'human-session',prototypeRef,
  decision:'approved',scenarioReviews:completeReviews()});
 assert.equal(result.prototype.lifecycle,'locked');
 assert.equal(result.review.lifecycle,'locked');
 assert.deepEqual(result.review.payload.prototypeRef,prototypeRef);
 assert.deepEqual(result.review.dependencies,[prototypeRef]);
 assert.deepEqual(result.review.payload.reviewer,{id:'designer-1',role:'human'});
 assert.equal(result.review.payload.scenarioReviews[0].segmentReviews.length,2);
 assert.deepEqual(await approval.sealed('scorpio-review',1),result.review);
 const intent={protocol:'mip/0.7',id:'intent',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'approved',dependencies:[],payload:{},evidence:[],approvals:[]};
 const semantic={...intent,id:'semantic',kind:'semantic-contract',payload:{blockingAmbiguities:[]}};
 await store.create(intent);await store.create(semantic);
 const lockedIntent=await approval.lock('intent',1,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(intent)});
 const lockedSemantic=await approval.lock('semantic',1,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(semantic)});
 const gate=await validateGate('implementation',[lockedIntent,lockedSemantic,result.prototype,result.review],ref=>approval.sealed(ref.id,ref.revision),
  {verifyApproval:authenticator.verifyApproval});
 assert.equal(gate.status,'PASS');
}));

test('rejects forged identity, stale prototype digest, incomplete segments and rejected scenarios',()=>setup(async({prototype,reviews})=>{
 const prototypeRef={id:prototype.id,revision:1,digest:artifactDigest(prototype)};
 const request={id:'review',projectId:'scorpio',revision:1,principal:'agent-token',prototypeRef,decision:'approved',scenarioReviews:completeReviews()};
 await assert.rejects(()=>reviews.approve(request),/Verified human identity/);
 await assert.rejects(()=>reviews.approve({...request,id:'stale',principal:'human-session',prototypeRef:{...prototypeRef,digest:'sha256:'+'0'.repeat(64)}}),/Stale prototype/);
 await assert.rejects(()=>reviews.approve({...request,id:'missing',principal:'human-session',scenarioReviews:[{scenarioId:'select-scorpio',accepted:true,segmentReviews:[completeReviews()[0].segmentReviews[0]]}]}),/Incomplete prototype review/);
 await assert.rejects(()=>reviews.approve({...request,id:'rejected',principal:'human-session',scenarioReviews:[{...completeReviews()[0],accepted:false}]}),/Incomplete prototype review/);
}));

test('rejects forged persistent approval attestations',()=>setup(async({prototype,reviews,approval,directory})=>{
 const prototypeRef={id:prototype.id,revision:1,digest:artifactDigest(prototype)};
 await reviews.approve({id:'review',projectId:'scorpio',revision:1,principal:'human-session',prototypeRef,decision:'approved',scenarioReviews:completeReviews()});
 const path=join(directory,'review','1.json.lock'),record=JSON.parse(await readFile(path,'utf8'));
 record.approval.actor.id='attacker';
 await writeFile(path,JSON.stringify(record));
 await assert.rejects(()=>approval.sealed('review',1),/Invalid approval attestation/);
}));

test('implementation gate rejects changed prototype and missing review evidence',()=>setup(async({prototype,reviews,approval,authenticator})=>{
 const prototypeRef={id:prototype.id,revision:1,digest:artifactDigest(prototype)};
 const {prototype:locked,review}=await reviews.approve({id:'review',projectId:'scorpio',revision:1,principal:'human-session',prototypeRef,
  decision:'approved',scenarioReviews:completeReviews()});
 const missing=await validateGate('implementation',[locked],ref=>approval.sealed(ref.id,ref.revision),{verifyApproval:authenticator.verifyApproval});
 assert.ok(missing.violations.some(x=>x.code==='MISSING_REQUIRED'&&x.kind==='prototype-review'));
 const changed={...locked,payload:{...locked.payload,durationMs:4600}};
 const stale=await validateGate('implementation',[changed,review],ref=>approval.sealed(ref.id,ref.revision),{verifyApproval:authenticator.verifyApproval});
 assert.ok(stale.violations.some(x=>x.code==='DIGEST_MISMATCH'));
 assert.ok(stale.violations.some(x=>x.code==='PROTOTYPE_REVIEW_MISMATCH'));
}));

test('approval stores frame-manifest evidence; gate recomputes it and blocks empty, altered, extra and duplicate entries',()=>setup(async({store,prototype,reviews,approval,authenticator})=>{
 const prototypeRef={id:prototype.id,revision:1,digest:artifactDigest(prototype)};
 const {prototype:locked,review}=await reviews.approve({id:'review',projectId:'scorpio',revision:1,principal:'human-session',prototypeRef,
  decision:'approved',scenarioReviews:completeReviews()});
 assert.deepEqual(review.evidence.map(e=>[e.uri,e.mediaType]),[['mip:frame-manifest/scorpio-prototype@1/select-scorpio','application/vnd.mip.frame-manifest+json']]);
 const intent={protocol:'mip/0.7',id:'intent',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'approved',dependencies:[],payload:{},evidence:[],approvals:[]};
 const semantic={...intent,id:'semantic',kind:'semantic-contract',payload:{blockingAmbiguities:[]}};
 await store.create(intent);await store.create(semantic);
 const base=[await approval.lock('intent',1,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(intent)}),
  await approval.lock('semantic',1,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(semantic)})];
 const gate=evidence=>validateGate('implementation',[...base,locked,{...review,evidence}],ref=>approval.sealed(ref.id,ref.revision),{verifyApproval:authenticator.verifyApproval});
 assert.equal((await gate(review.evidence)).status,'PASS');
 const [entry]=review.evidence,codes=async e=>(await gate(e)).violations.map(v=>v.code);
 assert.ok((await codes([])).includes('MISSING_REVIEW_EVIDENCE'));
 assert.ok((await codes([{...entry,digest:'sha256:'+'0'.repeat(64)}])).includes('REVIEW_EVIDENCE_MISMATCH'));
 assert.ok((await codes([{...entry,mediaType:'image/png'}])).includes('REVIEW_EVIDENCE_MISMATCH'));
 assert.ok((await codes([entry,{...entry,uri:'mip:frame-manifest/x@1/y'}])).includes('REVIEW_EVIDENCE_MISMATCH'));
 assert.ok((await codes([entry,entry])).includes('REVIEW_EVIDENCE_MISMATCH'));
}));

test('sealed review with MISSING_REVIEW_EVIDENCE as the only violation',()=>setup(async({store,prototype,approval,authenticator})=>{
 const lock=async a=>{await store.create(a);return approval.lock(a.id,a.revision,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(a)});};
 const base=[];
 for(const [id,kind,payload] of [['intent','intent-profile',{}],['semantic','semantic-contract',{blockingAmbiguities:[]}]])
  base.push(await lock({protocol:'mip/0.7',id,projectId:'scorpio',kind,revision:1,lifecycle:'approved',dependencies:[],payload,evidence:[],approvals:[]}));
 const lockedP=await approval.lock('scorpio-prototype',1,{principal:'human-session',decision:'approved',reviewedDigest:artifactDigest(prototype)});
 const pref={id:prototype.id,revision:1,digest:artifactDigest(prototype)};
 const lockedR=await lock({protocol:'mip/0.7',id:'review',projectId:'scorpio',kind:'prototype-review',revision:1,lifecycle:'approved',
  dependencies:[pref],payload:{prototypeRef:pref,reviewer:{id:'designer-1',role:'human'},scenarioReviews:completeReviews(),decision:'approved'},evidence:[],approvals:[]});
 const out=await validateGate('implementation',[...base,lockedP,lockedR],ref=>approval.sealed(ref.id,ref.revision),{verifyApproval:authenticator.verifyApproval});
 assert.deepEqual(out.violations.map(v=>v.code),['MISSING_REVIEW_EVIDENCE']);
}));
