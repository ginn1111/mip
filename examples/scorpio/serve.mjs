import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ArtifactStore,artifactDigest} from '../../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../../packages/artifacts/approval.mjs';
import {PrototypeReviewService,ReviewRejected} from '../../packages/prototype/review-evidence.mjs';
import {scorpio} from './review.mjs';
import {HOSTS,sameToken,json,body} from '../host.mjs';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const JS='text/javascript; charset=utf-8',HTML='text/html; charset=utf-8';
// Explicit allowlist: the store directory and every other repo file stay unreachable over HTTP.
const ASSETS={
 '/':['examples/scorpio/index.html',HTML],
 '/examples/scorpio/index.html':['examples/scorpio/index.html',HTML],
 '/examples/scorpio/reviewer.mjs':['examples/scorpio/reviewer.mjs',JS],
 '/examples/scorpio/review.mjs':['examples/scorpio/review.mjs',JS],
 '/packages/prototype/review.mjs':['packages/prototype/review.mjs',JS],
 '/packages/prototype/index.mjs':['packages/prototype/index.mjs',JS],
};
export async function createReviewerServer({directory,approvalSecret,reviewToken,reviewerId}){
 if(!directory||!approvalSecret||!reviewToken||!reviewerId)throw new Error('Reviewer host configuration required');
 const store=new ArtifactStore(directory);
 const bundled={protocol:'mip/0.7',id:'scorpio-prototype',projectId:'scorpio',kind:'prototype-spec',revision:1,lifecycle:'in_review',
  dependencies:[],payload:scorpio,evidence:[],approvals:[]};
 try{await store.create(bundled);}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  // The human reviews the bundled visuals; refuse to bind approval to a different stored revision.
  if(artifactDigest(await store.read(bundled.id,bundled.revision))!==artifactDigest(bundled))
   throw new Error('Stored prototype differs from bundled prototype; bump revision before review');
 }
 const authenticator=createApprovalAuthenticator({issuer:'scorpio-review-host',secret:approvalSecret,authenticate:async principal=>
  typeof principal==='string'&&sameToken(principal,reviewToken)?{id:reviewerId,role:'human'}:null});
 const approval=new ApprovalService(store,{...authenticator,loadDependency:ref=>approval.sealed(ref.id,ref.revision)});
 const reviews=new PrototypeReviewService(store,{approvalService:approval});
 /** Bearer token if it matches the host secret, else null. */
 const principalOf=req=>{const m=/^Bearer (.+)$/.exec(req.headers.authorization??'');return m&&sameToken(m[1],reviewToken)?m[1]:null;};
 return createServer(async(req,res)=>{
  try{
   if(!HOSTS.test(req.headers.host??'')){json(res,403,{error:'Forbidden host'});return;}
   if(!req.url.startsWith('/')||req.url.startsWith('//')){json(res,400,{error:'Bad request'});return;}
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&pathname==='/api/prototype'){
    const current=await store.read(bundled.id,bundled.revision);
    json(res,200,{ref:{id:current.id,revision:current.revision,digest:artifactDigest(current)},reviewSegments:current.payload.reviewSegments,scenarios:current.payload.scenarios.map(x=>x.id)});return;
   }
   if(req.method==='POST'&&pathname==='/api/reviews'){
    const principal=principalOf(req);
    if(principal===null){json(res,401,{error:'Verified human identity required'});return;}
    const request=await body(req);
    // Only the reviewer's saved draft is approvable; any scenarioReviews in the body are ignored.
    const result=await reviews.approveDraft({id:'scorpio-prototype-review',projectId:'scorpio',revision:1,principal,
     prototypeRef:request?.prototypeRef,decision:request?.decision});
    json(res,201,result);return;
   }
   if(pathname==='/api/draft'&&(req.method==='GET'||req.method==='PUT')){
    const principal=principalOf(req);
    if(principal===null){json(res,401,{error:'Verified human identity required'});return;}
    if(req.method==='GET'){
     const q=new URL(req.url,'http://localhost').searchParams;
     const prototypeRef={id:q.get('id'),revision:Number(q.get('revision')),digest:q.get('digest')};
     json(res,200,{draft:await reviews.loadDraft({principal,prototypeRef})});return;
    }
    const request=await body(req);
    json(res,200,{draft:await reviews.saveDraft({principal,prototypeRef:request?.prototypeRef,status:request?.status,scenarioReviews:request?.scenarioReviews,baseSavedAt:request?.baseSavedAt})});return;
   }
   const asset=req.method==='GET'?ASSETS[pathname]:undefined;
   if(req.method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(!asset){json(res,req.method==='GET'?404:405,{error:req.method==='GET'?'Not found':'Method not allowed'});return;}
   res.writeHead(200,{'Content-Type':asset[1],'X-Content-Type-Options':'nosniff'});res.end(await readFile(resolve(root,asset[0])));
  }catch(error){
   if(error instanceof ReviewRejected){json(res,error.status,{error:error.message});return;}
   console.error('reviewer error:',error);json(res,500,{error:'Internal error'});
  }
 });
}

if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??'')){
 const server=await createReviewerServer({directory:resolve(process.env.MIP_REVIEW_DIR||'.mip/reviews'),approvalSecret:process.env.MIP_APPROVAL_SECRET,
  reviewToken:process.env.MIP_REVIEW_TOKEN,reviewerId:process.env.MIP_REVIEWER_ID});
 const port=Number(process.env.PORT||4173);
 server.listen(port,'127.0.0.1',()=>console.log('MIP reviewer http://127.0.0.1:'+server.address().port+'/'));
}
