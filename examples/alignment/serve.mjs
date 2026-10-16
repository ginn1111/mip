// Reference-vs-prototype alignment reviewer (docs/specs/AGE-39.md). Extends the Scorpio reviewer:
// same host token, draft and approval flow (PrototypeReviewService), same gates. Code never approves: only POST /api/reviews with the host token locks.
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ArtifactStore,artifactDigest,parseStrictJson} from '../../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../../packages/artifacts/approval.mjs';
import {PrototypeReviewService,ReviewRejected} from '../../packages/prototype/review-evidence.mjs';
import {validatePrototype} from '../../packages/prototype/index.mjs';
import {packEvidence} from '../../packages/evidence/index.mjs';
import {framesOf,keyframesOf} from './align.mjs';
import {HOSTS,sameToken,json,body,originOk} from '../host.mjs';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const JS='text/javascript; charset=utf-8',HTML='text/html; charset=utf-8';
const ASSETS={
 '/':['examples/alignment/index.html',HTML],
 '/examples/alignment/index.html':['examples/alignment/index.html',HTML],
 '/examples/alignment/reviewer.mjs':['examples/alignment/reviewer.mjs',JS],
 '/examples/alignment/align.mjs':['examples/alignment/align.mjs',JS],
 '/packages/prototype/index.mjs':['packages/prototype/index.mjs',JS],
};
const MODES=['replicate','adapt'];
const numeric=v=>Number.isFinite(v)||(Array.isArray(v)&&v.length>0&&v.every(Number.isFinite));

/** `pack` is the Reference Evidence Pack the drafts cite; `prototypeId` names the AGE-38 prototype-spec draft in `directory`. */
export async function createAlignmentServer({directory,approvalSecret,reviewToken,reviewerId,prototypeId,pack}){
 if(!directory||!approvalSecret||!reviewToken||!reviewerId||!prototypeId||!pack)throw new Error('Alignment host configuration required');
 const store=new ArtifactStore(directory),frames=framesOf(pack);
 const authenticator=createApprovalAuthenticator({issuer:'alignment-review-host',secret:approvalSecret,authenticate:async principal=>
  typeof principal==='string'&&sameToken(principal,reviewToken)?{id:reviewerId,role:'human'}:null});
 const approval=new ApprovalService(store,{...authenticator,loadDependency:ref=>approval.sealed(ref.id,ref.revision)});
 const reviews=new PrototypeReviewService(store,{approvalService:approval});
 const latest=async()=>{const rev=(await store.history(prototypeId)).at(-1);return store.read(prototypeId,rev);};
 const first=await latest();
 if(first.kind!=='prototype-spec')throw new Error('Not a prototype-spec');
 // The frames shown must be the evidence the draft cites.
 if(!first.evidence.some(e=>e.digest===packEvidence(pack,e.uri).digest))throw new Error('Evidence pack does not match the prototype draft');
 const principalOf=req=>{const m=/^Bearer (.+)$/.exec(req.headers.authorization??'');return m&&sameToken(m[1],reviewToken)?m[1]:null;};
 const sidecar=a=>store.path(a.id,a.revision).replace(/\.json$/,'.alignment.json');
 const readState=async a=>{try{return parseStrictJson(await readFile(sidecar(a),'utf8'));}catch(e){if(e.code==='ENOENT')return {mode:null,decisions:{}};throw e;}};
 const writeState=async(a,state)=>{const tmp=sidecar(a)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(state,null,2)+'\n');await rename(tmp,sidecar(a));};
 // ponytail: single-process mutex like the file store; multi-process hosts need a file/DB lock.
 let queue=Promise.resolve();
 const serial=fn=>{const r=queue.then(fn);queue=r.catch(()=>{});return r;};
 /** Only the prototype under review, at its latest revision; stale refs, foreign ids and locked revisions (unless open:false) are refused. */
 const own=ref=>{if(ref?.id!==prototypeId)throw new ReviewRejected('Unknown prototype',404);};
 async function current(ref,{open=true}={}){
  own(ref);
  const a=await reviews.currentPrototype(ref);
  if(a.revision!==(await store.history(prototypeId)).at(-1))throw new ReviewRejected('Stale prototype revision',409);
  if(open&&await reviews.isLocked(a))throw new ReviewRejected('Prototype already locked',409);
  return a;
 }
 const refOf=a=>({id:a.id,revision:a.revision,digest:artifactDigest(a)});
 const needHuman=req=>{if(principalOf(req)===null)throw new ReviewRejected('Verified human identity required',401);};
 async function view(){
  const a=await latest();
  return {ref:refOf(a),spec:a.payload,frames,keyframes:keyframesOf(a.payload),...await readState(a),locked:await reviews.isLocked(a),revisions:await store.history(prototypeId)};
 }
 return createServer(async(req,res)=>{
  try{
   if(!HOSTS.test(req.headers.host??'')||!originOk(req)){json(res,403,{error:'Forbidden host'});return;}
   if(!req.url.startsWith('/')||req.url.startsWith('//')){json(res,400,{error:'Bad request'});return;}
   const pathname=new URL(req.url,'http://localhost').pathname,method=req.method;
   if(method==='GET'&&pathname==='/api/alignment'){json(res,200,await view());return;}
   if(method==='PUT'&&pathname==='/api/mode'){
    needHuman(req);const r=await body(req);
    json(res,200,await serial(async()=>{
     if(!MODES.includes(r?.mode))throw new ReviewRejected('Mode must be replicate or adapt');
     const a=await current(r.prototypeRef);
     return writeState(a,{...await readState(a),mode:r.mode}).then(()=>({mode:r.mode}));
    }));return;
   }
   if(method==='PUT'&&pathname==='/api/decision'){
    needHuman(req);const r=await body(req);
    json(res,200,await serial(async()=>{
     if(!['accepted','rejected'].includes(r?.decision))throw new ReviewRejected('Decision must be accepted or rejected');
     const a=await current(r.prototypeRef);
     if(!keyframesOf(a.payload).some(k=>k.observationId===r.observationId))throw new ReviewRejected('Unknown observation');
     const s=await readState(a);s.decisions={...s.decisions,[r.observationId]:r.decision};
     await writeState(a,s);return {decisions:s.decisions};
    }));return;
   }
   if(method==='POST'&&pathname==='/api/edit'){
    needHuman(req);const r=await body(req);
    json(res,201,await serial(async()=>{
     const a=await current(r.prototypeRef);
     const key=keyframesOf(a.payload).find(k=>k.observationId===r.observationId);
     if(!key)throw new ReviewRejected('Unknown observation');
     const value=r.value??key.value,timeMs=r.timeMs??key.timeMs;
     if(!numeric(value)||typeof value!==typeof key.value||!Number.isInteger(timeMs))throw new ReviewRejected('Invalid edit');
     const ref=await store.revise(a.id,a.revision,n=>{
      const track=n.payload.tracks.find(t=>t.keyframes.some(k=>k.observationId===r.observationId));
      const k=track.keyframes.find(x=>x.observationId===r.observationId);
      k.value=value;k.timeMs=timeMs;track.keyframes.sort((x,y)=>x.timeMs-y.timeMs);
      try{validatePrototype(n.payload);}catch{throw new ReviewRejected('Invalid edit');}
     }).catch(e=>{if(e.code==='EEXIST')throw new ReviewRejected('Revision already exists',409);throw e;});
     const next=await store.read(ref.id,ref.revision),old=await readState(a);
     // Decisions on untouched keyframes carry over; the edited one needs a fresh human decision.
     const {[r.observationId]:_,...kept}=old.decisions;
     await writeState(next,{mode:old.mode,decisions:kept,editedFrom:{revision:a.revision,observationId:r.observationId}});
     return {ref};
    }));return;
   }
   if(method==='GET'&&pathname==='/api/draft'){
    needHuman(req);const q=new URL(req.url,'http://localhost').searchParams;own({id:q.get('id')});
    json(res,200,{draft:await reviews.loadDraft({principal:principalOf(req),prototypeRef:{id:q.get('id'),revision:Number(q.get('revision')),digest:q.get('digest')}})});return;
   }
   if(method==='PUT'&&pathname==='/api/draft'){
    needHuman(req);const r=await body(req);own(r?.prototypeRef);
    json(res,200,{draft:await reviews.saveDraft({principal:principalOf(req),prototypeRef:r?.prototypeRef,status:r?.status,scenarioReviews:r?.scenarioReviews,baseSavedAt:r?.baseSavedAt})});return;
   }
   if(method==='POST'&&pathname==='/api/reviews'){
    needHuman(req);const r=await body(req);
    const a=await current(r?.prototypeRef,{open:false}),s=await readState(a);
    // B4 + B3: the lock needs a recorded mode and a human accept on every inferred transition.
    if(!MODES.includes(s.mode))throw new ReviewRejected('Mode required before approval',409);
    if(!keyframesOf(a.payload).every(k=>s.decisions[k.observationId]==='accepted'))throw new ReviewRejected('Every inferred transition must be accepted',409);
    json(res,201,await reviews.approveDraft({id:prototypeId+'-review',projectId:a.projectId,revision:a.revision,principal:principalOf(req),prototypeRef:r.prototypeRef,decision:r.decision}));return;
   }
   const asset=method==='GET'?ASSETS[pathname]:undefined;
   if(method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(!asset){json(res,method==='GET'?404:405,{error:method==='GET'?'Not found':'Method not allowed'});return;}
   res.writeHead(200,{'Content-Type':asset[1],'X-Content-Type-Options':'nosniff'});res.end(await readFile(resolve(root,asset[0])));
  }catch(error){
   if(error instanceof ReviewRejected){json(res,error.status,{error:error.message});return;}
   console.error('reviewer error:',error);json(res,500,{error:'Internal error'});
  }
 });
}

if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??'')){
 const server=await createAlignmentServer({directory:resolve(process.env.MIP_REVIEW_DIR||'.mip/reviews'),approvalSecret:process.env.MIP_APPROVAL_SECRET,
  reviewToken:process.env.MIP_REVIEW_TOKEN,reviewerId:process.env.MIP_REVIEWER_ID,prototypeId:process.env.MIP_PROTOTYPE_ID,
  pack:parseStrictJson(await readFile(resolve(process.env.MIP_REFERENCE_PACK||''),'utf8'))});
 server.listen(Number(process.env.PORT||4174),'127.0.0.1',()=>console.log('MIP alignment reviewer http://127.0.0.1:'+server.address().port+'/'));
}
