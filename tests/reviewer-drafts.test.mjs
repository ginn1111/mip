import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewerServer} from '../examples/scorpio/serve.mjs';

const seg=(ids,accepted=true,comments={})=>[{scenarioId:'select-scorpio',accepted,segmentReviews:ids.map(segmentId=>({segmentId,accepted,comments:comments[segmentId]??[]}))}];
const ALL=['anticipation','rotation','constellation'];
const AUTH={authorization:'Bearer session-token'};

async function withServer(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-srv-drafts-'));
 const server=await createReviewerServer({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const baseOf=async b=>{
  const r=b?.prototypeRef;if(!r)return null;
  const g=await fetch(base+'/api/draft?'+new URLSearchParams({id:String(r.id),revision:String(r.revision),digest:String(r.digest)}),{headers:AUTH});
  return (await g.json().catch(()=>null))?.draft?.savedAt??null;
 };
 const api=async(method,path,{body,headers=AUTH,raw=false}={})=>{
  if(method==='PUT'&&!raw&&body&&typeof body==='object'&&!('baseSavedAt' in body))body={...body,baseSavedAt:await baseOf(body)};
  const res=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  return {status:res.status,json:await res.json().catch(()=>null)};
 };
 try{await fn({api,base,directory,ref:(await api('GET','/api/prototype')).json.ref});}
 finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
}

test('GET /api/draft needs auth and returns null before anything is saved',()=>withServer(async({api,ref})=>{
 const q='?id='+ref.id+'&revision='+ref.revision+'&digest='+encodeURIComponent(ref.digest);
 assert.equal((await api('GET','/api/draft'+q,{headers:{}})).status,401);
 const res=await api('GET','/api/draft'+q);
 assert.equal(res.status,200);assert.deepEqual(res.json,{draft:null});
 assert.equal((await api('GET','/api/draft')).status,400,'missing ref');
}));

test('PUT /api/draft persists partial work and GET returns it exactly',()=>withServer(async({api,ref,directory})=>{
 const scenarioReviews=seg(['anticipation'],false,{anticipation:[{timeMs:300,text:'ease in is abrupt'}]});
 const put=await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'draft',scenarioReviews}});
 assert.equal(put.status,200);assert.equal(put.json.draft.status,'draft');assert.deepEqual(put.json.draft.reviewer,{id:'designer-1',role:'human'});
 const q='?id='+ref.id+'&revision='+ref.revision+'&digest='+encodeURIComponent(ref.digest);
 const got=await api('GET','/api/draft'+q);
 assert.deepEqual(got.json.draft.scenarioReviews,scenarioReviews);
 const onDisk=JSON.parse(await readFile(join(directory,'scorpio-prototype','1.draft.json'),'utf8'));
 assert.deepEqual(onDisk.scenarioReviews,scenarioReviews);
 await assert.rejects(()=>readFile(join(directory,'scorpio-prototype','1.json.lock')),/ENOENT/,'a draft never locks');
}));

test('PUT /api/draft rejects unauth, bad body, stale ref, bad status and out-of-range comments',()=>withServer(async({api,ref})=>{
 const ok={prototypeRef:ref,status:'draft',scenarioReviews:seg(['anticipation'],false)};
 assert.equal((await api('PUT','/api/draft',{body:ok,headers:{}})).status,401);
 assert.equal((await api('PUT','/api/draft',{body:'{nope'})).status,400);
 assert.equal((await api('PUT','/api/draft',{body:{...ok,prototypeRef:{...ref,digest:'sha256:'+'0'.repeat(64)}}})).status,400);
 assert.equal((await api('PUT','/api/draft',{body:{...ok,status:'approved'}})).status,400);
 const late=seg(['anticipation'],false,{anticipation:[{timeMs:4000,text:'wrong segment'}]});
 const res=await api('PUT','/api/draft',{body:{...ok,scenarioReviews:late}});
 assert.equal(res.status,400);assert.match(res.json.error,/Invalid review draft/);
}));

test('approve uses the saved draft: no draft 409, partial 400, changes_requested 409, complete 201, replay 409',()=>withServer(async({api,ref})=>{
 const approve=()=>api('POST','/api/reviews',{body:{prototypeRef:ref,decision:'approved'}});
 assert.equal((await approve()).status,409,'no draft');
 await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'draft',scenarioReviews:seg(['anticipation'],true)}});
 const partial=await approve();assert.equal(partial.status,400);assert.match(partial.json.error,/Incomplete prototype review/);
 await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'changes_requested',scenarioReviews:seg(ALL,true,{rotation:[{timeMs:900,text:'revisit'}]})}});
 assert.equal((await approve()).status,409,'changes requested');
 const comments={rotation:[{timeMs:1500,text:'good'}]};
 await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'draft',scenarioReviews:seg(ALL,true,comments)}});
 const done=await approve();
 assert.equal(done.status,201);assert.equal(done.json.review.lifecycle,'locked');assert.equal(done.json.prototype.lifecycle,'locked');
 assert.deepEqual(done.json.review.payload.scenarioReviews[0].segmentReviews[1].comments,comments.rotation);
 assert.equal((await approve()).status,409,'replay');
 assert.equal((await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'draft',scenarioReviews:seg(['anticipation'],false)}})).status,409,'locked prototype takes no more drafts');
}));

test('POST /api/reviews ignores any scenarioReviews in the body: only the saved draft counts',()=>withServer(async({api,ref})=>{
 await api('PUT','/api/draft',{body:{prototypeRef:ref,status:'draft',scenarioReviews:seg(['anticipation'],true)}});
 const res=await api('POST','/api/reviews',{body:{prototypeRef:ref,decision:'approved',scenarioReviews:seg(ALL,true)}});
 assert.equal(res.status,400,'a complete review smuggled in the body must not bypass the draft');
}));

test('errors for drafts stay sanitised',()=>withServer(async({api,ref})=>{
 const res=await api('PUT','/api/draft',{body:{prototypeRef:{id:'../etc',revision:1,digest:ref.digest},status:'draft',scenarioReviews:[]}});
 assert.ok([400].includes(res.status));assert.doesNotMatch(JSON.stringify(res.json),/\/home|node_modules|ENOENT|at /);
}));

test('PUT /api/draft requires baseSavedAt and refuses a save over a newer draft',()=>withServer(async({api,ref})=>{
 const body={prototypeRef:ref,status:'draft',scenarioReviews:seg(ALL,true)};
 assert.equal((await api('PUT','/api/draft',{body,raw:true})).status,400,'baseSavedAt is mandatory');
 const first=await api('PUT','/api/draft',{body:{...body,baseSavedAt:null},raw:true});
 assert.equal(first.status,200);
 const stale=await api('PUT','/api/draft',{body:{...body,scenarioReviews:seg(['anticipation'],false),baseSavedAt:null},raw:true});
 assert.equal(stale.status,409);assert.match(stale.json.error,/Draft changed/);
 const q='?id='+ref.id+'&revision='+ref.revision+'&digest='+encodeURIComponent(ref.digest);
 assert.deepEqual((await api('GET','/api/draft'+q)).json.draft.scenarioReviews,seg(ALL,true),'newer draft intact');
 assert.equal((await api('PUT','/api/draft',{body:{...body,baseSavedAt:first.json.draft.savedAt},raw:true})).status,200);
}));

test('a protocol-relative path returns 400 instead of a 500 with a logged stack',()=>withServer(async({base})=>{
 const status=await new Promise((resolve,reject)=>{
  import('node:http').then(({request})=>{const u=new URL(base);const r=request({host:u.hostname,port:u.port,path:'//',headers:{Host:u.host}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});
 });
 assert.equal(status,400);
}));
