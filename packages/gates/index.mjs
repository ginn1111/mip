import {artifactDigest} from '../artifacts/index.mjs';

const REQUIREMENTS={
 semantic:['intent-profile'],
 prototype:['intent-profile','semantic-contract'],
 implementation:['intent-profile','semantic-contract','prototype-spec','prototype-review'],
 verification:['intent-profile','semantic-contract','prototype-spec','prototype-review','implementation-contract'],
 complete:['verification-record']
};

export async function validateGate(phase,inputs,loadRef){
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
  if(!a.approvals?.some(x=>x.decision==='approved'&&x.actor?.role==='human'&&x.reviewedDigest===hash))
   violations.push({code:'MISSING_HUMAN_APPROVAL',artifact:key});
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
 return {status:violations.length?'BLOCKED':'PASS',phase,violations};
}
