// Shared fixtures for draft/regression tests. Not a *.test.mjs file, so the runner does not execute it.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../packages/artifacts/approval.mjs';
import {PrototypeReviewService} from '../packages/prototype/review-evidence.mjs';

export const proto=(over={},id='proto')=>({protocol:'mip/0.7',id,projectId:'scorpio',kind:'prototype-spec',revision:1,lifecycle:'in_review',dependencies:[],
 payload:{durationMs:1000,fps:30,actors:[],states:[],transitions:[],tracks:[],storyboard:[],scenarios:[{id:'a',initialState:'idle',events:[]}],
  reviewSegments:[{id:'s1',startMs:0,endMs:1000,scenarioIds:['a']}],...over},evidence:[],approvals:[]});
export const ref=a=>({id:a.id,revision:a.revision,digest:artifactDigest(a)});
export const full=()=>[{scenarioId:'a',accepted:true,segmentReviews:[{segmentId:'s1',accepted:true,comments:[{timeMs:500,text:'ok'}]}]}];
export const partial=()=>[{scenarioId:'a',accepted:false,segmentReviews:[{segmentId:'s1',accepted:false,comments:[{timeMs:100,text:'too slow'}]}]}];
export const people=async c=>c==='human'?{id:'h1',role:'human'}:c==='other'?{id:'h2',role:'human'}:null;
export const draftPath=(store,id,revision)=>store.path(id,revision).replace(/\.json$/,'.draft.json');
export const approveReq=(p,over={})=>({id:'rev',projectId:'scorpio',revision:1,principal:'human',prototypeRef:ref(p),decision:'approved',...over});
export const saveReq=(p,over={})=>({principal:'human',prototypeRef:ref(p),status:'draft',scenarioReviews:partial(),...over});

export async function setup(fn,authenticate=people){
 const dir=await mkdtemp(join(tmpdir(),'mip-drafts-'));
 try{
  const store=new ArtifactStore(dir);
  const auth=createApprovalAuthenticator({issuer:'t',secret:'s',authenticate});
  const approval=new ApprovalService(store,{...auth,loadDependency:r=>approval.sealed(r.id,r.revision)});
  const reviews=new PrototypeReviewService(store,{approvalService:approval});
  // Most tests do not exercise the concurrency token: supply the freshly loaded one unless given explicitly.
  const rawSave=reviews.saveDraft.bind(reviews);
  reviews.saveDraft=async req=>{
   if(!('baseSavedAt' in req)){
    let base=null;try{base=(await reviews.loadDraft({principal:req.principal,prototypeRef:req.prototypeRef}))?.savedAt??null;}catch{}
    req={...req,baseSavedAt:base};
   }
   return rawSave(req);
  };
  await fn({store,approval,reviews,auth,dir});
 }finally{await rm(dir,{recursive:true,force:true});}
}

export async function lockBase(store,approval){
 const intent={protocol:'mip/0.7',id:'intent',projectId:'scorpio',kind:'intent-profile',revision:1,lifecycle:'approved',dependencies:[],payload:{},evidence:[],approvals:[]};
 const semantic={...intent,id:'semantic',kind:'semantic-contract',payload:{blockingAmbiguities:[]}};
 await store.create(intent);await store.create(semantic);
 return [await approval.lock('intent',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(intent)}),
  await approval.lock('semantic',1,{principal:'human',decision:'approved',reviewedDigest:artifactDigest(semantic)})];
}
