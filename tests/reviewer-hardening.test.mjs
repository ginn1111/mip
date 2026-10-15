import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore} from '../packages/artifacts/index.mjs';
import {createReviewerServer} from '../examples/scorpio/serve.mjs';

const reviews=[{scenarioId:'select-scorpio',accepted:true,segmentReviews:[
 {segmentId:'anticipation',accepted:true,comments:[]},{segmentId:'rotation',accepted:true,comments:[]},{segmentId:'constellation',accepted:true,comments:[]}]}];
const cfg=directory=>({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1'});
async function withServer(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-rh-'));
 const server=await createReviewerServer(cfg(directory));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await fn({base:'http://127.0.0.1:'+server.address().port,port:server.address().port,directory});}
 finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
}
const post=(base,body,auth='Bearer session-token')=>fetch(base+'/api/reviews',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})},body:typeof body==='string'?body:JSON.stringify(body)});
const protoRef=async base=>(await (await fetch(base+'/api/prototype')).json()).ref;

test('every script the page references resolves to a served asset',()=>withServer(async({base})=>{
 const html=await (await fetch(base+'/')).text();
 const srcs=[...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(srcs.length>0);
 for(const src of srcs){
  const res=await fetch(new URL(src,base+'/'));
  assert.equal(res.status,200,src);
 }
}));

test('static handler serves only reviewer UI assets',()=>withServer(async({base})=>{
 for(const p of ['/','/examples/scorpio/reviewer.mjs','/examples/scorpio/review.mjs','/packages/prototype/review.mjs','/packages/prototype/index.mjs'])
  assert.equal((await fetch(base+p)).status,200,p);
 for(const p of ['/.mip/reviews/scorpio-prototype/1.json','/package.json','/schemas/v0.7/artifact.schema.json','/packages/artifacts/approval.mjs','/%2e%2e/etc/passwd'])
  assert.equal((await fetch(base+p)).status,404,p);
}));

test('rejects foreign Host header (DNS rebinding)',()=>withServer(async({port})=>{
 const status=await new Promise((resolve,reject)=>{
  const r=request({host:'127.0.0.1',port,path:'/',headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});
  r.on('error',reject);r.end();
 });
 assert.equal(status,403);
}));

test('requires Bearer scheme',()=>withServer(async({base})=>{
 assert.equal((await post(base,{prototypeRef:await protoRef(base),decision:'approved',scenarioReviews:reviews},'session-token')).status,401);
}));

test('malformed or unvalidated bodies return 400 without leaking details',()=>withServer(async({base})=>{
 const ref=await protoRef(base);
 assert.equal((await post(base,'{not json')).status,400);
 assert.equal((await post(base,{decision:'approved',scenarioReviews:reviews})).status,400);
 const evil=structuredClone(reviews);evil[0].EVIL=1;
 const res=await post(base,{prototypeRef:ref,decision:'approved',scenarioReviews:evil});
 assert.equal(res.status,400);
}));

test('second approval returns clean 409 and leaves lock intact',()=>withServer(async({base})=>{
 const ref=await protoRef(base),body={prototypeRef:ref,decision:'approved',scenarioReviews:reviews};
 assert.equal((await post(base,body)).status,201);
 const again=await post(base,body);
 assert.equal(again.status,409);
 assert.deepEqual(await again.json(),{error:'Review already exists'});
}));

test('startup refuses stored prototype that differs from bundled one',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mip-drift-'));
 try{
  await new ArtifactStore(directory).create({protocol:'mip/0.7',id:'scorpio-prototype',projectId:'scorpio',kind:'prototype-spec',revision:1,lifecycle:'in_review',dependencies:[],payload:{durationMs:1},evidence:[],approvals:[]});
  await assert.rejects(()=>createReviewerServer(cfg(directory)),/differs/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
