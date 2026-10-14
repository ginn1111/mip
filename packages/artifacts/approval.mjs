import {mkdir,open,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {artifactDigest} from './index.mjs';

const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
/**
 * The caller MUST inject a trusted verifier backed by a host authentication
 * mechanism. Caller-supplied role strings are not authorization.
 * This file-backed implementation is single-host only, not distributed locking.
 */
export class ApprovalService {
 constructor(store,{verifyPrincipal,loadDependency}={}){
  if(typeof verifyPrincipal!=='function')throw new Error('Host identity verifier is required');
  this.store=store;this.verifyPrincipal=verifyPrincipal;this.loadDependency=loadDependency;
 }
 sidecar(id,revision){return this.store.path(id,revision)+'.lock';}
 async sealed(id,revision){
  const artifact=await this.store.read(id,revision);
  const record=JSON.parse(await readFile(this.sidecar(id,revision),'utf8'));
  const contentDigest=artifactDigest(artifact);
  if(record.lock.digest!==contentDigest||record.approval.reviewedDigest!==contentDigest||
     record.approval.decision!=='approved'||record.approval.actor?.role!=='human')
    throw new Error('Invalid lock record');
  if(!equal(record.lock.dependencyDigests,artifact.dependencies.map(ref=>ref.digest)))
    throw new Error('Lock dependency digest mismatch');
  return {...artifact,lifecycle:'locked',approvals:[record.approval],lock:record.lock};
 }
 async lock(id,revision,{principal,reviewedDigest,decision}={}){
  if(decision!=='approved')throw new Error('Explicit approval required');
  const identity=await this.verifyPrincipal(principal);
  if(!identity || identity.role!=='human' || !identity.id)throw new Error('Verified human identity required');
  const artifact=await this.store.read(id,revision),actual=artifactDigest(artifact);
  if(reviewedDigest!==actual)throw new Error('Stale review digest');
  if(!['draft','in_review','approved'].includes(artifact.lifecycle))
    throw new Error('Invalid lifecycle for lock');
  if(artifact.kind==='semantic-contract'&&artifact.payload.blockingAmbiguities?.length)
    throw new Error('Blocking ambiguity');
  const dependencyDigests=[];
  for(const ref of artifact.dependencies){
   if(!this.loadDependency)throw new Error('Dependency resolver required');
   const dep=await this.loadDependency(ref);
   if(dep.lifecycle!=='locked'||artifactDigest(dep)!==ref.digest||
      dep.id!==ref.id||dep.revision!==ref.revision)
     throw new Error('Unlocked or stale dependency');
   dependencyDigests.push(ref.digest);
  }
  const timestamp=new Date().toISOString();
  const record={approval:{actor:{id:identity.id,role:'human'},decision,reviewedDigest:actual,timestamp},
    lock:{digest:actual,timestamp,dependencyDigests}};
  const path=this.sidecar(id,revision);
  await mkdir(join(this.store.directory,id),{recursive:true});
  const handle=await open(path,'wx');
  try{await handle.writeFile(JSON.stringify(record,null,2)+'\n');await handle.sync();}
  catch(error){await handle.close();await rm(path,{force:true});throw error;}
  await handle.close();
  return this.sealed(id,revision);
 }
}
