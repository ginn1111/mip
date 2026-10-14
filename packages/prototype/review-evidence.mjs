import {rm} from 'node:fs/promises';
import {artifactDigest} from '../artifacts/index.mjs';
import {planValid,reviewShapeValid,reviewComplete} from './review-rules.mjs';

/** Client-safe rejection: message may be returned to callers; `status` maps to HTTP. */
export class ReviewRejected extends Error{constructor(message,status=400){super(message);this.status=status;}}

const refFor=artifact=>({id:artifact.id,revision:artifact.revision,digest:artifactDigest(artifact)});
const refValid=ref=>ref&&typeof ref.id==='string'&&Number.isSafeInteger(ref.revision)&&ref.revision>0&&typeof ref.digest==='string';

export class PrototypeReviewService {
 constructor(store,{approvalService}){
  if(!approvalService)throw new Error('Approval service required');
  this.store=store;this.approval=approvalService;
 }
 /**
  * Persists review evidence, then locks prototype-spec and prototype-review as one unit.
  * Verifies the human once so every record carries the same identity. On failure only
  * files created by this call are removed; another caller's lock is never touched.
  */
 async approve({id,projectId,revision,principal,prototypeRef,decision,scenarioReviews}){
  if(decision!=='approved')throw new ReviewRejected('Explicit approval required');
  let identity;
  try{identity=await this.approval.authenticate(principal);}
  catch{throw new ReviewRejected('Verified human identity required',401);}
  if(!refValid(prototypeRef))throw new ReviewRejected('Invalid review request');
  const prototype=await this.store.read(prototypeRef.id,prototypeRef.revision).catch(()=>{throw new ReviewRejected('Unknown prototype revision');});
  if(prototype.kind!=='prototype-spec'||artifactDigest(prototype)!==prototypeRef.digest)throw new ReviewRejected('Stale prototype revision');
  if(projectId!==prototype.projectId)throw new ReviewRejected('Prototype project mismatch');
  if(!planValid(prototype.payload))throw new ReviewRejected('Invalid prototype review plan');
  if(!reviewShapeValid(scenarioReviews))throw new ReviewRejected('Invalid review shape');
  if(!reviewComplete(prototype.payload,scenarioReviews))throw new ReviewRejected('Incomplete prototype review');
  const ref=refFor(prototype);
  const review={protocol:'mip/0.7',id,projectId,kind:'prototype-review',revision,lifecycle:'approved',dependencies:[ref],
   payload:{prototypeRef:ref,reviewer:{id:identity.id,role:'human'},scenarioReviews,decision},evidence:[],approvals:[]};
  const created=[];
  try{
   try{await this.store.create(review);}catch(error){if(error.code==='EEXIST')throw new ReviewRejected('Review already exists',409);throw error;}
   created.push(this.store.path(id,revision));
   const lockedPrototype=await this.approval.lockAs(prototype.id,prototype.revision,identity,{decision,reviewedDigest:ref.digest})
    .catch(error=>{if(error.code==='EEXIST')throw new ReviewRejected('Prototype already locked',409);throw error;});
   created.push(this.approval.sidecar(prototype.id,prototype.revision));
   const lockedReview=await this.approval.lockAs(id,revision,identity,{decision,reviewedDigest:artifactDigest(review)});
   return {prototype:lockedPrototype,review:lockedReview};
  }catch(error){
   for(const path of created.reverse())await rm(path,{force:true});
   throw error;
  }
 }
}
