import {mkdir,open,readFile,rename,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {artifactDigest} from '../artifacts/index.mjs';
import {parseStrictJson} from '../artifacts/index.mjs';
import {planValid,reviewShapeValid,reviewConsistent,reviewComplete} from './review-rules.mjs';

/** Client-safe rejection: message may be returned to callers; `status` maps to HTTP. */
export class ReviewRejected extends Error{constructor(message,status=400){super(message);this.status=status;}}

const refFor=artifact=>({id:artifact.id,revision:artifact.revision,digest:artifactDigest(artifact)});
const refValid=ref=>ref&&typeof ref.id==='string'&&Number.isSafeInteger(ref.revision)&&ref.revision>0&&typeof ref.digest==='string';
const DRAFT_STATUS=['draft','changes_requested'];
// ponytail: in-process mutex per draft file. Single process / single host only (like the file store);
// a multi-process host needs an OS file lock or a database row lock.
const chains=new Map();
async function withLock(key,fn){
 const prev=chains.get(key)??Promise.resolve();
 let release;const next=new Promise(r=>{release=r;});
 const tail=prev.then(()=>next);chains.set(key,tail);
 await prev;
 try{return await fn();}
 finally{release();if(chains.get(key)===tail)chains.delete(key);}
}
const commentCount=reviews=>reviews.reduce((n,r)=>n+r.segmentReviews.reduce((m,x)=>m+x.comments.length,0),0);
const draftKeys=['prototypeRef','reviewer','status','scenarioReviews','savedAt'];

export class PrototypeReviewService {
 constructor(store,{approvalService}){
  if(!approvalService)throw new Error('Approval service required');
  this.store=store;this.approval=approvalService;
 }
 draftPath(ref){return this.store.path(ref.id,ref.revision).replace(/\.json$/,'.draft.json');}

 async identify(principal){
  try{return await this.approval.authenticate(principal);}
  catch{throw new ReviewRejected('Verified human identity required',401);}
 }
 /** Reads the exact prototype revision and proves the caller reviewed that digest. */
 async currentPrototype(prototypeRef){
  if(!refValid(prototypeRef))throw new ReviewRejected('Invalid review request');
  const prototype=await this.store.read(prototypeRef.id,prototypeRef.revision).catch(()=>{throw new ReviewRejected('Unknown prototype revision');});
  if(prototype.kind!=='prototype-spec'||artifactDigest(prototype)!==prototypeRef.digest)throw new ReviewRejected('Stale prototype revision');
  return prototype;
 }
 /** Only a missing sidecar means unlocked; any other read error fails closed. */
 async isLocked(prototype){
  try{await readFile(this.approval.sidecar(prototype.id,prototype.revision));return true;}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
 }

 /**
  * Persists in-progress review work, separate from any approval. Drafts are not artifacts:
  * they carry no lock, cannot satisfy a gate, and are replaced atomically on each save.
  * `baseSavedAt` is the `savedAt` the caller last saw (null = no draft yet); a mismatch is a lost-update 409.
  */
 async saveDraft({principal,prototypeRef,status,scenarioReviews,baseSavedAt}){
  const identity=await this.identify(principal);
  if(!DRAFT_STATUS.includes(status))throw new ReviewRejected('Invalid draft status');
  if(baseSavedAt!==null&&typeof baseSavedAt!=='string')throw new ReviewRejected('baseSavedAt required');
  const prototype=await this.currentPrototype(prototypeRef);
  if(!planValid(prototype.payload))throw new ReviewRejected('Invalid prototype review plan');
  if(!reviewShapeValid(scenarioReviews))throw new ReviewRejected('Invalid review shape');
  if(!reviewConsistent(prototype.payload,scenarioReviews))throw new ReviewRejected('Invalid review draft');
  if(status==='changes_requested'&&commentCount(scenarioReviews)===0)throw new ReviewRejected('Changes requested needs at least one comment');
  const ref=refFor(prototype),path=this.draftPath(ref);
  return withLock(path,async()=>{
   if(await this.isLocked(prototype))throw new ReviewRejected('Prototype already locked',409);
   const existing=await this.readDraftFile(ref);
   if(existing&&existing.reviewer.id!==identity.id)throw new ReviewRejected('Draft belongs to another reviewer',409);
   if((existing?.savedAt??null)!==baseSavedAt)throw new ReviewRejected('Draft changed since you loaded it: load the saved draft first',409);
   const previous=existing?Date.parse(existing.savedAt):0;
   const draft={prototypeRef:ref,reviewer:{id:identity.id,role:'human'},status,scenarioReviews,savedAt:new Date(Math.max(Date.now(),previous+1)).toISOString()};
   const tmp=path+'.'+randomUUID()+'.tmp';
   await mkdir(dirname(path),{recursive:true});
   const handle=await open(tmp,'wx');
   try{await handle.writeFile(JSON.stringify(draft,null,2)+'\n');await handle.sync();}
   finally{await handle.close();}
   await rename(tmp,path);
   return draft;
  });
 }

 /** Returns null when no draft exists; fails closed on corrupt or stale files. */
 async readDraftFile(prototypeRef){
  let raw;
  try{raw=await readFile(this.draftPath(prototypeRef),'utf8');}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  let draft;
  try{draft=parseStrictJson(raw);}catch{throw new ReviewRejected('Corrupt review draft',409);}
  const shaped=draft&&typeof draft==='object'&&Object.keys(draft).length===draftKeys.length&&draftKeys.every(k=>k in draft)&&
   refValid(draft.prototypeRef)&&DRAFT_STATUS.includes(draft.status)&&draft.reviewer?.role==='human'&&typeof draft.reviewer.id==='string'&&reviewShapeValid(draft.scenarioReviews);
  if(!shaped)throw new ReviewRejected('Corrupt review draft',409);
  if(draft.prototypeRef.id!==prototypeRef.id||draft.prototypeRef.revision!==prototypeRef.revision||draft.prototypeRef.digest!==prototypeRef.digest)
   throw new ReviewRejected('Stale draft: prototype changed since it was saved',409);
  return draft;
 }
 async loadDraft({principal,prototypeRef}){
  const identity=await this.identify(principal);
  const prototype=await this.currentPrototype(prototypeRef);
  const draft=await this.readDraftFile(refFor(prototype));
  if(draft&&draft.reviewer.id!==identity.id)throw new ReviewRejected('Draft belongs to another reviewer',409);
  return draft;
 }

 /**
  * Final approval built from the reviewer's own saved draft. Runs under the same per-draft lock as
  * saveDraft, so the draft cannot change between being read and the locks being written.
  */
 async approveDraft({id,projectId,revision,principal,prototypeRef,decision}){
  if(decision!=='approved')throw new ReviewRejected('Explicit approval required');
  const identity=await this.identify(principal);
  const prototype=await this.currentPrototype(prototypeRef);
  const ref=refFor(prototype);
  return withLock(this.draftPath(ref),async()=>{
   const draft=await this.readDraftFile(ref);
   if(!draft)throw new ReviewRejected('Review draft required',409);
   if(draft.reviewer.id!==identity.id)throw new ReviewRejected('Draft belongs to another reviewer',409);
   if(draft.status==='changes_requested')throw new ReviewRejected('Changes requested: resolve before approval',409);
   return this.finish({id,projectId,revision,identity,prototype,decision,scenarioReviews:draft.scenarioReviews});
  });
 }

 /**
  * Persists review evidence, then locks prototype-spec and prototype-review as one unit.
  * Verifies the human once so every record carries the same identity. On failure only
  * files created by this call are removed; another caller's lock is never touched.
  */
 async approve({id,projectId,revision,principal,prototypeRef,decision,scenarioReviews}){
  if(decision!=='approved')throw new ReviewRejected('Explicit approval required');
  const identity=await this.identify(principal);
  const prototype=await this.currentPrototype(prototypeRef);
  return this.finish({id,projectId,revision,identity,prototype,decision,scenarioReviews});
 }

 async finish({id,projectId,revision,identity,prototype,decision,scenarioReviews}){
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
