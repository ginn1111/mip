import {mkdir,open,readFile,rm} from 'node:fs/promises';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';
import {canonicalize} from 'json-canonicalize';
import {artifactDigest} from './index.mjs';

const equal=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const creative=artifact=>['prototype-spec','prototype-review'].includes(artifact.kind);
const approvalMaterial=({actor,decision,reviewedDigest,timestamp})=>({actor,decision,reviewedDigest,timestamp});

/** HMAC attestation keeps host-verified identity bound to persisted approval fields. */
export function createApprovalAuthenticator({issuer,secret,authenticate}){
 if(!issuer||!secret||typeof authenticate!=='function')throw new Error('Approval authenticator configuration required');
 const signature=approval=>'sha256:'+createHmac('sha256',secret).update(canonicalize(approvalMaterial(approval)),'utf8').digest('hex');
 return {
  verifyPrincipal:authenticate,
  attestApproval:approval=>({...approval,attestation:{issuer,algorithm:'hmac-sha256',signature:signature(approval)}}),
  verifyApproval:async approval=>{
   try{
    const a=approval?.attestation;
    if(a?.issuer!==issuer||a.algorithm!=='hmac-sha256'||typeof a.signature!=='string')return false;
    const expected=Buffer.from(signature(approval)),actual=Buffer.from(a.signature);
    return expected.length===actual.length&&timingSafeEqual(expected,actual);
   }catch{return false;}
  }
 };
}
/**
 * The caller MUST inject a trusted verifier backed by a host authentication
 * mechanism. Caller-supplied role strings are not authorization.
 * This file-backed implementation is single-host only, not distributed locking.
 */
export class ApprovalService {
 constructor(store,{verifyPrincipal,attestApproval,verifyApproval,loadDependency}={}){
  if(typeof verifyPrincipal!=='function')throw new Error('Host identity verifier is required');
  this.store=store;this.verifyPrincipal=verifyPrincipal;this.attestApproval=attestApproval;this.verifyApproval=verifyApproval;this.loadDependency=loadDependency;
 }
 sidecar(id,revision){return this.store.path(id,revision)+'.lock';}
 /** Resolves a credential to a verified human identity or throws. */
 async authenticate(principal){
  const identity=await this.verifyPrincipal(principal);
  if(!identity || identity.role!=='human' || !identity.id)throw new Error('Verified human identity required');
  return identity;
 }
 async sealed(id,revision){
  const artifact=await this.store.read(id,revision);
  const record=JSON.parse(await readFile(this.sidecar(id,revision),'utf8'));
  const contentDigest=artifactDigest(artifact);
  if(!record?.lock||!record.approval||record.lock.digest!==contentDigest||record.approval.reviewedDigest!==contentDigest||
     record.lock.timestamp!==record.approval.timestamp||
     record.approval.decision!=='approved'||record.approval.actor?.role!=='human')
    throw new Error('Invalid lock record');
  if(creative(artifact)&&(!this.verifyApproval||!await this.verifyApproval(record.approval)))
    throw new Error('Invalid approval attestation');
  if(!equal(record.lock.dependencyDigests,artifact.dependencies.map(ref=>ref.digest)))
    throw new Error('Lock dependency digest mismatch');
  return {...artifact,lifecycle:'locked',approvals:[record.approval],lock:record.lock};
 }
 async lock(id,revision,{principal,reviewedDigest,decision}={}){
  if(decision!=='approved')throw new Error('Explicit approval required');
  return this.lockAs(id,revision,await this.authenticate(principal),{reviewedDigest,decision});
 }
 /** Locks with an identity the caller already verified via `authenticate`. */
 async lockAs(id,revision,identity,{reviewedDigest,decision}={}){
  if(decision!=='approved')throw new Error('Explicit approval required');
  if(!identity || identity.role!=='human' || !identity.id)throw new Error('Verified human identity required');
  const artifact=await this.store.read(id,revision),actual=artifactDigest(artifact);
  if(reviewedDigest!==actual)throw new Error('Stale review digest');
  if(!['draft','in_review','approved'].includes(artifact.lifecycle))
    throw new Error('Invalid lifecycle for lock');
  if(artifact.kind==='semantic-contract'&&artifact.payload.blockingAmbiguities?.length)
    throw new Error('Blocking ambiguity');
  if(artifact.kind==='prototype-review'&&artifact.payload?.decision!=='approved')
    throw new Error('Review decision must be approved');
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
  let approval={actor:{id:identity.id,role:'human'},decision,reviewedDigest:actual,timestamp};
  if(creative(artifact)){
   if(typeof this.attestApproval!=='function'||typeof this.verifyApproval!=='function')throw new Error('Approval attestation required');
   approval=await this.attestApproval(approval);
   if(!await this.verifyApproval(approval))throw new Error('Invalid approval attestation');
  }
  const record={approval,lock:{digest:actual,timestamp,dependencyDigests}};
  const path=this.sidecar(id,revision);
  await mkdir(join(this.store.directory,id),{recursive:true});
  const handle=await open(path,'wx');
  try{await handle.writeFile(JSON.stringify(record,null,2)+'\n');await handle.sync();}
  catch(error){await handle.close();await rm(path,{force:true});throw error;}
  await handle.close();
  return this.sealed(id,revision);
 }
}
