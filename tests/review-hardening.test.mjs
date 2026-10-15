import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../packages/artifacts/approval.mjs';
import {PrototypeReviewService} from '../packages/prototype/review-evidence.mjs';
import {validateGate} from '../packages/gates/index.mjs';

const proto=(over={},id='proto')=>({protocol:'mip/0.7',id,projectId:'scorpio',kind:'prototype-spec',revision:1,lifecycle:'in_review',dependencies:[],
 payload:{durationMs:1000,fps:30,actors:[],states:[],transitions:[],tracks:[],storyboard:[],scenarios:[{id:'a',initialState:'idle',events:[]}],
  reviewSegments:[{id:'s1',startMs:0,endMs:1000,scenarioIds:['a']}],...over},evidence:[],approvals:[]});
const rv=()=>[{scenarioId:'a',accepted:true,segmentReviews:[{segmentId:'s1',accepted:true,comments:[]}]}];
const ref=a=>({id:a.id,revision:a.revision,digest:artifactDigest(a)});
const req=(p,extra={})=>({id:'rev',projectId:'scorpio',revision:1,principal:'human',prototypeRef:ref(p),decision:'approved',scenarioReviews:rv(),...extra});
const human=async c=>c==='human'?{id:'h1',role:'human'}:null;

async function setup(fn,authenticate=human){
 const dir=await mkdtemp(join(tmpdir(),'mip-harden-'));
 try{
  const store=new ArtifactStore(dir);
  const auth=createApprovalAuthenticator({issuer:'t',secret:'s',authenticate});
  const approval=new ApprovalService(store,{...auth,loadDependency:r=>approval.sealed(r.id,r.revision)});
  const reviews=new PrototypeReviewService(store,{approvalService:approval});
  await fn({store,approval,reviews,auth,dir});
 }finally{await rm(dir,{recursive:true,force:true});}
}
const lockBase=async(store,approval)=>{
 const intent={protocol:'mip/0.7',id:'intent',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'approved',dependencies:[],payload:{},evidence:[],approvals:[]};
 const semantic={...intent,id:'semantic',kind:'semantic-contract',payload:{blockingAmbiguities:[]}};
 await store.create(intent);await store.create(semantic);
 return [await approval.lock('intent',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(intent)}),
  await approval.lock('semantic',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(semantic)})];
};

test('rejects vacuous or duplicate scenario/segment plans and duplicate review entries',()=>setup(async({store,reviews})=>{
 const empty=proto({scenarios:[],reviewSegments:[]});await store.create(empty);
 await assert.rejects(()=>reviews.approve(req(empty,{scenarioReviews:[]})),/Invalid prototype review plan/);
 const dupSpec=proto({scenarios:[{id:'a',initialState:'i',events:[]},{id:'a',initialState:'i',events:[]}]},'dup');await store.create(dupSpec);
 await assert.rejects(()=>reviews.approve(req(dupSpec,{id:'r2'})),/Invalid prototype review plan/);
 const ok=proto({},'ok');await store.create(ok);
 await assert.rejects(()=>reviews.approve(req(ok,{id:'r3',scenarioReviews:[...rv(),...rv()]})),/Incomplete prototype review/);
}));

test('rejects unknown review fields and cross-project evidence',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 const evil=rv();evil[0].segmentReviews[0].EVIL=true;
 await assert.rejects(()=>reviews.approve(req(p,{scenarioReviews:evil})),/shape/);
 await assert.rejects(()=>reviews.approve(req(p,{projectId:'other'})),/project/i);
}));

test('failed approval leaves no partial lock and retry succeeds',()=>setup(async({store,approval,reviews})=>{
 const p=proto();await store.create(p);
 await store.create({protocol:'mip/0.7',id:'rev',projectId:'scorpio',kind:'prototype-review',revision:1,lifecycle:'draft',dependencies:[],payload:{},evidence:[],approvals:[]});
 await assert.rejects(()=>reviews.approve(req(p)),/exists/i);
 await assert.rejects(()=>readFile(approval.sidecar('proto',1)),/ENOENT/);
 const done=await reviews.approve(req(p,{id:'rev2'}));
 assert.equal(done.review.lifecycle,'locked');
}));

test('approve authenticates once so reviewer and both approvals share one identity',async()=>{
 let calls=0;
 await setup(async({store,reviews})=>{
  const p=proto();await store.create(p);
  const {prototype,review}=await reviews.approve(req(p));
  assert.equal(calls,1);
  assert.equal(review.payload.reviewer.id,'h1');
  assert.equal(prototype.approvals[0].actor.id,'h1');
  assert.equal(review.approvals[0].actor.id,'h1');
 },async c=>{calls++;return c==='human'?{id:'h'+calls,role:'human'}:null;});
});

test('gate blocks when reviewer differs from attested approvers',async()=>{
 const people={alice:{id:'alice',role:'human'},bob:{id:'bob',role:'human'}};
 await setup(async({store,approval,auth})=>{
  const base=[];
  for(const [id,kind,payload] of [['intent','intent-profile',{}],['semantic','semantic-contract',{blockingAmbiguities:[]}]]){
   const a={protocol:'mip/0.7',id,projectId:'scorpio',kind,revision:1,lifecycle:'approved',dependencies:[],payload,evidence:[],approvals:[]};
   await store.create(a);base.push(await approval.lock(id,1,{principal:'alice',decision:'approved',reviewedDigest:artifactDigest(a)}));
  }
  const p=proto();await store.create(p);
  const lockedP=await approval.lock('proto',1,{principal:'alice',decision:'approved',reviewedDigest:artifactDigest(p)});
  const r={protocol:'mip/0.7',id:'rev',projectId:'scorpio',kind:'prototype-review',revision:1,lifecycle:'approved',dependencies:[ref(lockedP)],
   payload:{prototypeRef:ref(lockedP),reviewer:{id:'alice',role:'human'},scenarioReviews:rv(),decision:'approved'},evidence:[],approvals:[]};
  await store.create(r);
  const lockedR=await approval.lock('rev',1,{principal:'bob',decision:'approved',reviewedDigest:artifactDigest(r)});
  const out=await validateGate('implementation',[...base,lockedP,lockedR],x=>approval.sealed(x.id,x.revision),{verifyApproval:auth.verifyApproval});
  assert.ok(out.violations.some(v=>v.code==='REVIEWER_MISMATCH'));
 },async c=>people[c]??null);
});

test('tampered sidecars fail closed without throwing type errors',()=>setup(async({store,approval,reviews,auth})=>{
 const p=proto();await store.create(p);await reviews.approve(req(p));
 const path=approval.sidecar('proto',1),original=await readFile(path,'utf8');
 const time=JSON.parse(original);time.lock.timestamp='2000-01-01T00:00:00.000Z';await writeFile(path,JSON.stringify(time));
 await assert.rejects(()=>approval.sealed('proto',1),/Invalid lock record/);
 const sig=JSON.parse(original);sig.approval.attestation.signature=5;await writeFile(path,JSON.stringify(sig));
 await assert.rejects(()=>approval.sealed('proto',1),/Invalid approval attestation/);
 assert.equal(await auth.verifyApproval({attestation:{issuer:'t',algorithm:'hmac-sha256',signature:5}}),false);
}));

test('gate requires a matching review for every locked prototype',()=>setup(async({store,approval,reviews,auth})=>{
 const base=await lockBase(store,approval);
 const a=proto();await store.create(a);const {prototype,review}=await reviews.approve(req(a));
 const b=proto({},'protoB');await store.create(b);
 const lockedB=await approval.lock('protoB',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(b)});
 const out=await validateGate('implementation',[...base,prototype,lockedB,review],r=>approval.sealed(r.id,r.revision),{verifyApproval:auth.verifyApproval});
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='MISSING_PROTOTYPE_REVIEW'&&v.artifact==='protoB@1'));
}));

test('gate blocks vacuous reviews and generic lock refuses non-approved reviews',()=>setup(async({store,approval,auth})=>{
 const base=await lockBase(store,approval);
 const p=proto({scenarios:[],reviewSegments:[]});await store.create(p);
 const lockedP=await approval.lock('proto',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(p)});
 const review=(id,decision)=>({protocol:'mip/0.7',id,projectId:'scorpio',kind:'prototype-review',revision:1,lifecycle:'approved',dependencies:[ref(lockedP)],
  payload:{prototypeRef:ref(lockedP),reviewer:{id:'h1',role:'human'},scenarioReviews:[],decision},evidence:[],approvals:[]});
 const r0=review('r0','approved');await store.create(r0);
 const lockedR=await approval.lock('r0',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(r0)});
 const out=await validateGate('implementation',[...base,lockedP,lockedR],r=>approval.sealed(r.id,r.revision),{verifyApproval:auth.verifyApproval});
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='INCOMPLETE_PROTOTYPE_REVIEW'));
 const r1=review('r1','changes_requested');await store.create(r1);
 await assert.rejects(()=>approval.lock('r1',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(r1)}),/decision/i);
}));
