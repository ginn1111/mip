import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';
import {proto,ref,full,partial,people,draftPath,approveReq,saveReq,setup,lockBase} from './support.mjs';

const status=code=>e=>e.status===code;
const rejects=(fn,pattern,code)=>assert.rejects(fn,e=>pattern.test(e.message)&&(code===undefined||e.status===code),String(pattern));

test('partial draft persists and reloads, separate from the final approval',()=>setup(async({store,approval,reviews})=>{
 const p=proto();await store.create(p);
 assert.equal(await reviews.loadDraft({principal:'human',prototypeRef:ref(p)}),null);
 await reviews.saveDraft(saveReq(p));
 const d=await reviews.loadDraft({principal:'human',prototypeRef:ref(p)});
 assert.equal(d.status,'draft');assert.deepEqual(d.reviewer,{id:'h1',role:'human'});
 assert.deepEqual(d.scenarioReviews,partial());assert.deepEqual(d.prototypeRef,ref(p));
 assert.deepEqual(await store.history('proto'),[1]);
 await assert.rejects(()=>store.read('rev',1),/ENOENT/);
 await assert.rejects(()=>readFile(approval.sidecar('proto',1)),/ENOENT/);
 await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));
 assert.deepEqual((await reviews.loadDraft({principal:'human',prototypeRef:ref(p)})).scenarioReviews,full());
}));

test('draft rejects bad identity, status, shape, ids, comment instants and stale digest',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 const bad=(mutate)=>{const s=partial();mutate(s);return s;};
 await rejects(()=>reviews.saveDraft(saveReq(p,{principal:'agent'})),/Verified human identity/,401);
 await rejects(()=>reviews.saveDraft(saveReq(p,{status:'approved'})),/Invalid draft status/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{prototypeRef:{...ref(p),digest:'sha256:'+'0'.repeat(64)}})),/Stale prototype/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].comments=['legacy string'];})})),/Invalid review shape/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].comments[0].timeMs=-1;})})),/Invalid review shape/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].comments[0].text='';})})),/Invalid review shape/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].comments[0].EVIL=1;})})),/Invalid review shape/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].comments[0].timeMs=5000;})})),/Invalid review draft/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews[0].segmentId='zzz';})})),/Invalid review draft/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].scenarioId='zzz';})})),/Invalid review draft/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s[0].segmentReviews.push({...s[0].segmentReviews[0]});})})),/Invalid review draft/,400);
 await rejects(()=>reviews.saveDraft(saveReq(p,{scenarioReviews:bad(s=>{s.push({...s[0]});})})),/Invalid review draft/,400);
 assert.equal(await reviews.loadDraft({principal:'human',prototypeRef:ref(p)}),null,'no failed save may persist anything');
}));

test('approveDraft needs a complete, current draft from the same reviewer',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 await rejects(()=>reviews.approveDraft(approveReq(p)),/Review draft required/,409);
 await reviews.saveDraft(saveReq(p));
 await rejects(()=>reviews.approveDraft(approveReq(p)),/Incomplete prototype review/,400);
 await reviews.saveDraft(saveReq(p,{status:'changes_requested'}));
 await rejects(()=>reviews.approveDraft(approveReq(p)),/Changes requested/,409);
 await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));
 await rejects(()=>reviews.approveDraft(approveReq(p,{principal:'other'})),/another reviewer/,409);
 await rejects(()=>reviews.approveDraft(approveReq(p,{decision:'changes_requested'})),/Explicit approval/,400);
 await assert.rejects(()=>store.read('rev',1),/ENOENT/,'rejections must not create a review');
 const {prototype,review}=await reviews.approveDraft(approveReq(p));
 assert.deepEqual(review.payload.scenarioReviews,full());
 assert.deepEqual(review.payload.reviewer,{id:'h1',role:'human'});
 assert.equal(prototype.lifecycle,'locked');assert.equal(review.lifecycle,'locked');
}));

test('a locked prototype accepts no further drafts',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));await reviews.approveDraft(approveReq(p));
 await rejects(()=>reviews.saveDraft(saveReq(p)),/already locked/,409);
}));

test('stale or corrupt draft files fail closed',()=>setup(async({store,reviews,dir})=>{
 const p=proto();await store.create(p);
 await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));
 const path=draftPath(store,'proto',1),good=await readFile(path,'utf8'),tampered=JSON.parse(good);
 tampered.prototypeRef.digest='sha256:'+'1'.repeat(64);await writeFile(path,JSON.stringify(tampered));
 await rejects(()=>reviews.loadDraft({principal:'human',prototypeRef:ref(p)}),/Stale draft/,409);
 await rejects(()=>reviews.approveDraft(approveReq(p)),/Stale draft/,409);
 await writeFile(path,'{not json');
 await rejects(()=>reviews.loadDraft({principal:'human',prototypeRef:ref(p)}),/Corrupt review draft/,409);
 await rejects(()=>reviews.approveDraft(approveReq(p)),/Corrupt review draft/,409);
 await assert.rejects(()=>store.read('rev',1),/ENOENT/);
}));

test('review digest is deterministic and sensitive to comment instant',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 const a=await reviews.approve(approveReq(p,{scenarioReviews:full()}));
 const reordered=JSON.parse(JSON.stringify(a.review));
 reordered.payload.scenarioReviews=[{segmentReviews:[{comments:[{text:'ok',timeMs:500}],accepted:true,segmentId:'s1'}],accepted:true,scenarioId:'a'}];
 assert.equal(artifactDigest(reordered),artifactDigest(a.review));
 const moved=structuredClone(a.review);moved.payload.scenarioReviews[0].segmentReviews[0].comments[0].timeMs=501;
 assert.notEqual(artifactDigest(moved),artifactDigest(a.review));
 const retimed=structuredClone(a.review);retimed.payload.scenarioReviews[0].segmentReviews[0].comments[0].text='changed';
 assert.notEqual(artifactDigest(retimed),artifactDigest(a.review));
}));

test('concurrent approvals yield exactly one winner and a consistent final state',()=>setup(async({store,approval,reviews})=>{
 const p=proto();await store.create(p);
 const same=await Promise.allSettled([1,2,3].map(()=>reviews.approve(approveReq(p,{scenarioReviews:full()}))));
 assert.equal(same.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(same.filter(r=>r.status==='rejected').every(r=>r.reason.status===409),'losers get a clean 409');
 assert.equal((await approval.sealed('proto',1)).lifecycle,'locked');assert.equal((await approval.sealed('rev',1)).lifecycle,'locked');
 const q=proto({},'protoB');await store.create(q);
 const diff=await Promise.allSettled(['revA','revB'].map(id=>reviews.approve(approveReq(q,{id,scenarioReviews:full()}))));
 assert.equal(diff.filter(r=>r.status==='fulfilled').length,1);
 const exists=await Promise.all(['revA','revB'].map(id=>store.read(id,1).then(()=>true,()=>false)));
 assert.equal(exists.filter(Boolean).length,1,'the loser leaves no review behind');
 assert.equal((await approval.sealed('protoB',1)).lifecycle,'locked');
}));

test('a new prototype revision makes the old review stale at the gate',()=>setup(async({store,approval,reviews,auth})=>{
 const base=await lockBase(store,approval);
 const p=proto();await store.create(p);
 const {prototype,review}=await reviews.approve(approveReq(p,{scenarioReviews:full()}));
 await store.revise('proto',1,n=>{n.payload.durationMs=2000;});
 const rev2=await approval.lock('proto',2,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(await store.read('proto',2))});
 const load=r=>approval.sealed(r.id,r.revision),opts={verifyApproval:auth.verifyApproval};
 const out=await validateGate('implementation',[...base,rev2,review],load,opts);
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='MISSING_PROTOTYPE_REVIEW'&&v.artifact==='proto@2'));
 assert.ok(out.violations.some(v=>v.code==='PROTOTYPE_REVIEW_MISMATCH'&&v.artifact==='rev@1'));
 assert.equal((await validateGate('implementation',[...base,prototype,review],load,opts)).status,'PASS','rev 1 pair stays valid on its own');
}));

test('gate blocks a locked review whose comment lies outside its segment',()=>setup(async({store,approval,auth})=>{
 const base=await lockBase(store,approval);
 const p=proto();await store.create(p);
 const lockedP=await approval.lock('proto',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(p)});
 const sr=full();sr[0].segmentReviews[0].comments[0].timeMs=5000;
 const r={protocol:'mip/0.7',id:'rev',projectId:'scorpio',kind:'prototype-review',revision:1,lifecycle:'approved',dependencies:[ref(lockedP)],
  payload:{prototypeRef:ref(lockedP),reviewer:{id:'h1',role:'human'},scenarioReviews:sr,decision:'approved'},evidence:[],approvals:[]};
 await store.create(r);
 const lockedR=await approval.lock('rev',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(r)});
 const out=await validateGate('implementation',[...base,lockedP,lockedR],x=>approval.sealed(x.id,x.revision),{verifyApproval:auth.verifyApproval});
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='INCOMPLETE_PROTOTYPE_REVIEW'));
}));

test('concurrent saves from two reviewers: exactly one owns the draft, the other is refused',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 for(let i=0;i<10;i++){
  const q=proto({},'race'+i);await store.create(q);
  const out=await Promise.allSettled([saveReq(q,{principal:'human'}),saveReq(q,{principal:'other',scenarioReviews:full()})].map(r=>reviews.saveDraft(r)));
  assert.equal(out.filter(r=>r.status==='fulfilled').length,1,'one winner');
  assert.ok(out.filter(r=>r.status==='rejected').every(r=>r.reason.status===409),'loser gets 409');
  const owner=out.find(r=>r.status==='fulfilled').value.reviewer.id;
  const disk=JSON.parse(await readFile(draftPath(store,'race'+i,1),'utf8'));
  assert.equal(disk.reviewer.id,owner,'file belongs to the winner');
 }
}));

test('a corrupt draft is never overwritten by another reviewer or silently replaced',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 await reviews.saveDraft(saveReq(p));
 const path=draftPath(store,'proto',1);await writeFile(path,'{trunc');
 await rejects(()=>reviews.saveDraft(saveReq(p,{principal:'other'})),/Corrupt review draft/,409);
 await rejects(()=>reviews.saveDraft(saveReq(p)),/Corrupt review draft/,409);
 assert.equal(await readFile(path,'utf8'),'{trunc','fail closed: bytes untouched');
}));

test('approval and retraction race: never a locked review whose draft says changes requested',()=>setup(async({store,reviews})=>{
 for(let i=0;i<15;i++){
  const id='r'+i,p=proto({},id);await store.create(p);
  await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));
  const out=await Promise.allSettled([reviews.approveDraft(approveReq(p,{id:'rev'+i})),reviews.saveDraft(saveReq(p,{status:'changes_requested'}))]);
  const approved=out[0].status==='fulfilled';
  const draft=await reviews.loadDraft({principal:'human',prototypeRef:ref(p)});
  if(approved){
   assert.equal(out[1].status,'rejected','a save after the lock must fail');assert.equal(out[1].reason.status,409);
   assert.equal(draft.status,'draft','draft still matches the locked review');
  }else{
   assert.equal(out[0].reason.status,409);assert.equal(draft.status,'changes_requested');
   await assert.rejects(()=>store.read('rev'+i,1),/ENOENT/,'no review was created');
  }
 }
}));

test('lock detection fails closed: unreadable sidecar is not treated as unlocked',()=>setup(async({store,approval,reviews})=>{
 const p=proto();await store.create(p);
 await reviews.saveDraft(saveReq(p,{scenarioReviews:full()}));await reviews.approveDraft(approveReq(p));
 const {chmod}=await import('node:fs/promises');
 await chmod(approval.sidecar('proto',1),0o000);
 try{await assert.rejects(()=>reviews.saveDraft(saveReq(p)),e=>e.code==='EACCES'||e.status===409);}
 finally{await chmod(approval.sidecar('proto',1),0o600);}
}));

test('optimistic concurrency: a stale or missing baseSavedAt cannot overwrite a newer draft',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 const first=await reviews.saveDraft(saveReq(p,{scenarioReviews:full(),baseSavedAt:null}));
 await rejects(()=>reviews.saveDraft(saveReq(p,{baseSavedAt:null})),/Draft changed/,409);
 await rejects(()=>reviews.saveDraft(saveReq(p,{baseSavedAt:'2000-01-01T00:00:00.000Z'})),/Draft changed/,409);
 assert.deepEqual((await reviews.loadDraft({principal:'human',prototypeRef:ref(p)})).scenarioReviews,full(),'newer draft intact');
 const second=await reviews.saveDraft(saveReq(p,{baseSavedAt:first.savedAt}));
 assert.notEqual(second.savedAt,first.savedAt,'savedAt advances on every save');
}));

test('changes_requested needs at least one comment, enforced by the service',()=>setup(async({store,reviews})=>{
 const p=proto();await store.create(p);
 const bare=partial();bare[0].segmentReviews[0].comments=[];
 await rejects(()=>reviews.saveDraft(saveReq(p,{status:'changes_requested',scenarioReviews:bare})),/comment/i,400);
 await reviews.saveDraft(saveReq(p,{status:'changes_requested'}));
}));
