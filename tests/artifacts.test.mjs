import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';

function intent(){return {protocol:'mip/0.7',id:'i1',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'draft',dependencies:[],payload:{scene:'scorpio',goal:'cinematic',constraints:[]},evidence:[],approvals:[]};}
function locked(a){const digest=artifactDigest(a);return {...a,lifecycle:'locked',approvals:[{actor:{id:'user',role:'human'},decision:'approved',reviewedDigest:digest,timestamp:'2026-10-13T10:00:00Z'}],lock:{digest,timestamp:'2026-10-13T10:00:00Z',dependencyDigests:(a.dependencies??[]).map(x=>x.digest)}};}
test('create, retrieve, revise, history and immutability',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-'));
 try{
  const store=new ArtifactStore(dir),a=intent();
  await store.create(a);
  assert.deepEqual(await store.read('i1',1),a);
  await assert.rejects(()=>store.create(a),/EEXIST/);
  await store.revise('i1',1,next=>{next.payload.goal='new';});
  assert.equal((await store.read('i1',1)).payload.goal,'cinematic');
  assert.equal((await store.read('i1',2)).payload.goal,'new');
  assert.deepEqual(await store.history('i1'),[1,2]);
  assert.rejects(()=>store.read('../escape',1),/Invalid artifact/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('gate rejects unlocked and accepts valid locked upstream',async()=>{
 const draft=intent(),approved=locked(draft);
 assert.equal((await validateGate('semantic',[draft],async()=>{})).status,'BLOCKED');
 assert.equal((await validateGate('semantic',[approved],async()=>{})).status,'PASS');
 const tampered={...approved,payload:{...approved.payload,goal:'modified'}};
 assert.ok((await validateGate('semantic',[tampered],async()=>{})).violations.some(x=>x.code==='DIGEST_MISMATCH'));
});
test('dependency tampering blocks phase',async()=>{
 const parent=locked(intent()),child=locked({...intent(),id:'s1',kind:'semantic-contract',dependencies:[{id:'i1',revision:1,digest:artifactDigest(parent)}],payload:{concepts:[],blockingAmbiguities:[]}});
 const pass=await validateGate('prototype',[parent,child],async()=>parent);
 assert.equal(pass.status,'PASS');
 const fail=await validateGate('prototype',[parent,child],async()=>({...parent,payload:{scene:'other'}}));
 assert.ok(fail.violations.some(x=>x.code==='STALE_DEPENDENCY'));
});
