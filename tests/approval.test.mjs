import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService} from '../packages/artifacts/approval.mjs';
import {validateGate} from '../packages/gates/index.mjs';
const draft=()=>({protocol:'mip/0.7',id:'intent',projectId:'demo',kind:'intent-profile',revision:1,
 lifecycle:'draft',dependencies:[],payload:{scene:'scorpio',goal:'reveal',constraints:[]},evidence:[],approvals:[]});
async function setup(fn){
 const dir=await mkdtemp(join(tmpdir(),'mip-approval-'));
 try{
  const store=new ArtifactStore(dir),a=draft();await store.create(a);
  const service=new ApprovalService(store,{verifyPrincipal:async token=>token==='verified-session'?{id:'human-1',role:'human'}:null});
  await fn({store,service,a});
 }finally{await rm(dir,{force:true,recursive:true});}
}
test('rejects agent approval, stale digest and missing identity',()=>setup(async({service,a})=>{
 await assert.rejects(()=>service.lock(a.id,1,{principal:'agent',reviewedDigest:artifactDigest(a)}),/human identity/);
 await assert.rejects(()=>service.lock(a.id,1,{principal:'verified-session',decision:'approved',reviewedDigest:'sha256:'+'0'.repeat(64)}),/Stale review/);
}));
test('seals once with verified human, preserves original and passes gate',()=>setup(async({store,service,a})=>{
 const sealed=await service.lock(a.id,1,{principal:'verified-session',decision:'approved',reviewedDigest:artifactDigest(a)});
 assert.equal(sealed.lifecycle,'locked');
 assert.equal((await store.read('intent',1)).lifecycle,'draft');
 assert.equal((await validateGate('semantic',[sealed],async()=>{})).status,'PASS');
 await assert.rejects(()=>service.lock(a.id,1,{principal:'verified-session',decision:'approved',reviewedDigest:artifactDigest(a)}),/EEXIST/);
}));
test('concurrent seal attempts yield exactly one winner',()=>setup(async({service,a})=>{
 const attempts=await Promise.allSettled([1,2].map(()=>service.lock(a.id,1,{principal:'verified-session',decision:'approved',reviewedDigest:artifactDigest(a)})));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
}));

test('requires explicit approval even from verified human',()=>setup(async({service,a})=>{
 await assert.rejects(()=>service.lock(a.id,1,{principal:'verified-session',reviewedDigest:artifactDigest(a)}),/Explicit approval/);
}));
