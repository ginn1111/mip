import {artifactDigest,digest} from '../artifacts/index.mjs';
import {reviewComplete} from '../prototype/review-rules.mjs';
import {expectedEvidence} from '../prototype/review-manifest.mjs';

const REQUIREMENTS={
 semantic:['intent-profile'],
 prototype:['intent-profile','semantic-contract'],
 implementation:['intent-profile','semantic-contract','prototype-spec','prototype-review'],
 verification:['intent-profile','semantic-contract','prototype-spec','prototype-review','implementation-contract'],
 complete:['verification-record']
};
const CREATIVE=['prototype-spec','prototype-review'];
const humanApproval=a=>a.approvals?.find(x=>x.decision==='approved'&&x.actor?.role==='human');

export async function validateGate(phase,inputs,loadRef,{verifyApproval}={}){
 const violations=[],required=REQUIREMENTS[phase];
 if(!required)throw new Error('Unknown phase');
 for(const kind of required)if(!inputs.some(a=>a.kind===kind))violations.push({code:'MISSING_REQUIRED',kind});
 const finished=new Set(),active=new Set();
 async function check(a){
  const key=a.id+'@'+a.revision;
  if(active.has(key)){violations.push({code:'DEPENDENCY_CYCLE',artifact:key});return;}
  if(finished.has(key))return;
  active.add(key);
  if(a.lifecycle==='superseded')violations.push({code:'SUPERSEDED',artifact:key});
  else if(a.lifecycle!=='locked')violations.push({code:'NOT_LOCKED',artifact:key});
  const hash=artifactDigest(a);
  if(a.lock?.digest!==hash)violations.push({code:'DIGEST_MISMATCH',artifact:key});
  if(a.lock && JSON.stringify(a.lock.dependencyDigests)!==JSON.stringify((a.dependencies??[]).map(x=>x.digest)))
   violations.push({code:'LOCK_DEPENDENCY_MISMATCH',artifact:key});
  const approval=a.approvals?.find(x=>x.decision==='approved'&&x.actor?.role==='human'&&x.reviewedDigest===hash);
  if(!approval)violations.push({code:'MISSING_HUMAN_APPROVAL',artifact:key});
  else if(CREATIVE.includes(a.kind)&&(!verifyApproval||!await verifyApproval(approval)))
   violations.push({code:'UNVERIFIED_HUMAN_APPROVAL',artifact:key});
  if(a.kind==='semantic-contract'&&a.payload.blockingAmbiguities?.length)violations.push({code:'UNRESOLVED_AMBIGUITY',artifact:key});
  for(const ref of a.dependencies??[]){
   let dep;
   try{dep=await loadRef(ref);}catch{violations.push({code:'MISSING_DEPENDENCY',artifact:key});continue;}
   if(dep.id!==ref.id||dep.revision!==ref.revision||artifactDigest(dep)!==ref.digest)
     violations.push({code:'STALE_DEPENDENCY',artifact:key});
   await check(dep);
  }
  active.delete(key);
  finished.add(key);
 }
 for(const a of inputs)await check(a);
 if(['implementation','verification'].includes(phase))checkPrototypeEvidence(inputs,violations);
 return {status:violations.length?'BLOCKED':'PASS',phase,violations};
}

const key=a=>a.id+'@'+a.revision;
/** Every prototype-spec needs exactly one matching, complete, same-reviewer prototype-review. */
function checkPrototypeEvidence(inputs,violations){
 const prototypes=inputs.filter(a=>a.kind==='prototype-spec'),reviews=inputs.filter(a=>a.kind==='prototype-review');
 const refOf=r=>r.payload?.prototypeRef;
 for(const prototype of prototypes){
  const matches=reviews.filter(r=>refOf(r)?.id===prototype.id&&refOf(r)?.revision===prototype.revision);
  if(matches.length===0){violations.push({code:'MISSING_PROTOTYPE_REVIEW',artifact:key(prototype)});continue;}
  if(matches.length>1)violations.push({code:'DUPLICATE_PROTOTYPE_REVIEW',artifact:key(prototype)});
  for(const review of matches){
   const at=key(review);
   if(refOf(review).digest!==artifactDigest(prototype))violations.push({code:'PROTOTYPE_REVIEW_MISMATCH',artifact:at});
   if(review.projectId!==prototype.projectId)violations.push({code:'PROJECT_MISMATCH',artifact:at});
   if(review.payload?.decision!=='approved'||!reviewComplete(prototype.payload,review.payload?.scenarioReviews))
    violations.push({code:'INCOMPLETE_PROTOTYPE_REVIEW',artifact:at});
   const reviewer=review.payload?.reviewer?.id;
   if(!reviewer||humanApproval(review)?.actor.id!==reviewer||humanApproval(prototype)?.actor.id!==reviewer)
    violations.push({code:'REVIEWER_MISMATCH',artifact:at});
   checkReviewEvidence(prototype,review,violations);
  }
 }
 for(const review of reviews)
  if(!prototypes.some(p=>p.id===refOf(review)?.id&&p.revision===refOf(review)?.revision))
   violations.push({code:'PROTOTYPE_REVIEW_MISMATCH',artifact:key(review)});
}

/** Review evidence must equal the frame manifests recomputed from the prototype and the review's comments (AGE-27 B6). */
function checkReviewEvidence(prototype,review,violations){
 const artifact=key(review),actual=review.evidence;
 let expected;
 try{expected=expectedEvidence(prototype,review.payload.scenarioReviews);}
 catch{violations.push({code:'REVIEW_EVIDENCE_MISMATCH',artifact});return;}
 if(!Array.isArray(actual)||!expected.every(e=>actual.some(a=>a?.uri===e.uri)))violations.push({code:'MISSING_REVIEW_EVIDENCE',artifact});
 else if(digest(actual)!==digest(expected))violations.push({code:'REVIEW_EVIDENCE_MISMATCH',artifact});
}
