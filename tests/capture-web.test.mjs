// AGE-36: live website motion capture (docs/specs/AGE-36.md B1-B5).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {captureWeb,authorize,loadAllowlist,writeCapture,findChrome,SourceRefused} from '../packages/capture-web/index.mjs';
import {validateEvidencePack} from '../packages/evidence/index.mjs';

const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const validate=ajv.compile(JSON.parse(await readFile('schemas/v0.7/evidence-pack.schema.json','utf8')));
const chrome=findChrome();
const skip=chrome?false:'Chrome not available; skipping real-browser capture tests';

const PAGES={
 '/transition':'<!doctype html><style>#box{width:50px;height:50px;background:red;opacity:1;transition:opacity 300ms cubic-bezier(0.42,0,0.58,1)}#box.off{opacity:0.2}</style><div id="box"></div><button id="go" onclick="box.classList.toggle(\'off\')">go</button>',
 '/canvas':'<!doctype html><canvas id="c" width="100" height="100"></canvas><script>const x=document.getElementById("c").getContext("2d");let n=0;(function f(){x.fillStyle="hsl("+(n++*5)+",80%,50%)";x.fillRect(0,0,100,100);requestAnimationFrame(f);})()</script>',
 '/external':'<!doctype html><img src="http://203.0.113.9/x.png"><p>hi</p>',
};
async function withServer(fn){
 const hits=[];
 const server=http.createServer((req,res)=>{hits.push(req.url);res.setHeader('content-type','text/html');res.end(PAGES[req.url]??'nope');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await fn({base:'http://127.0.0.1:'+server.address().port,hits});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const scenarioFor=(base,path,{steps=[],...rest}={})=>({viewport:{width:320,height:240},...rest,steps:[{type:'navigate',url:base+path},{type:'wait',ms:200},...steps,{type:'wait',ms:400}]});
const ignoreDigests=pack=>pack.observations.map(o=>({...o,evidenceRefs:o.evidenceRefs.map(r=>({uri:r.uri,mediaType:r.mediaType}))}));

test('B1: non-allowlisted URLs are refused by authorize(); localhost and allowlist pass',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-allow-'));
 try{
  assert.throws(()=>authorize('https://example.com/a'),SourceRefused);
  assert.throws(()=>authorize('file:///etc/passwd'),SourceRefused);
  assert.throws(()=>authorize('http://localhost.evil.com/'),SourceRefused);
  assert.throws(()=>authorize('not a url'),SourceRefused);
  assert.match(authorize('http://localhost:3000/'),/localhost/);
  assert.match(authorize('http://127.0.0.1:1/'),/localhost/);
  await writeFile(join(dir,'allow.json'),'["https://example.com/demo/"]');
  const list=await loadAllowlist(join(dir,'allow.json'));
  assert.match(authorize('https://example.com/demo/page',list),/allowlist/);
  assert.throws(()=>authorize('https://example.com/other',list),SourceRefused);
  assert.throws(()=>authorize('http://example.com/demo/',list),SourceRefused);
  await writeFile(join(dir,'bad.json'),'{"a":1,"a":2}');
  await assert.rejects(loadAllowlist(join(dir,'bad.json')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('B1: captureWeb refuses a non-allowlisted URL before launching Chrome or any request',async()=>{
 await withServer(async({base,hits})=>{
  const scenario={viewport:{width:320,height:240},steps:[{type:'navigate',url:base+'/transition'},{type:'navigate',url:'https://example.com/'}]};
  await assert.rejects(captureWeb({scenario,chromeBin:'/nonexistent/chrome'}),e=>e.code==='SOURCE_REFUSED');
  assert.deepEqual(hits,[]);
 });
});

test('B2: scenario validation rejects malformed steps',async()=>{
 const bad=[{},{viewport:{width:1,height:1},steps:[]},{viewport:{width:1,height:1},steps:[{type:'wait',ms:1}]},
  {viewport:{width:1,height:1},steps:[{type:'navigate',url:'http://localhost/'},{type:'drag'}]},{viewport:{width:0,height:1},steps:[{type:'navigate',url:'http://localhost/'}]}];
 for(const scenario of bad)await assert.rejects(captureWeb({scenario,chromeBin:'/nonexistent/chrome'}),/Invalid scenario/);
});

test('B3/B4/B5: CSS transition yields duration and declared timing function; pack is valid website evidence',{skip,timeout:90000},async()=>{
 await withServer(async({base})=>{
  const scenario=scenarioFor(base,'/transition',{steps:[{type:'click',selector:'#go'}],inspect:['#box']});
  const out=await captureWeb({scenario});
  assert.equal(validate(out.pack),true,JSON.stringify(validate.errors));
  assert.deepEqual(validateEvidencePack(out.pack),{ok:true,violations:[]});
  assert.equal(out.pack.sources[0].kind,'website');
  assert.equal(out.pack.protocol,'mip/0.7');
  const t=out.pack.observations.find(o=>o.event==='transition');
  assert.ok(t,JSON.stringify(out.pack.observations.map(o=>o.event)));
  assert.equal(t.property,'opacity');
  assert.equal(t.actorId,'div#box');
  assert.equal(t.measuredValue.durationMs,300);
  assert.equal(t.measuredValue.easing,'cubic-bezier(0.42, 0, 0.58, 1)');
  assert.match(t.measurementMethod,/declared-css-timing-function/);
  const style=out.pack.observations.find(o=>o.event==='computed-style'&&o.property==='transition-timing-function');
  assert.match(style.measuredValue,/cubic-bezier/);
  assert.ok(out.frames.length>=3);
  assert.equal(out.pack.bindings.length+out.pack.hypotheses.length,0,'capture observes only');
 });
});

test('B2: two runs give the same observations',{skip,timeout:120000},async()=>{
 await withServer(async({base})=>{
  const scenario=scenarioFor(base,'/transition',{steps:[{type:'click',selector:'#go'}],inspect:['#box']});
  const a=await captureWeb({scenario}),b=await captureWeb({scenario});
  assert.deepEqual(ignoreDigests(a.pack),ignoreDigests(b.pack));
  assert.deepEqual(a.uncertainty,b.uncertainty);
  assert.equal(a.pack.id,b.pack.id);
 });
});

test('B3: canvas-only page gives screenshot evidence and an uncertainty entry',{skip,timeout:90000},async()=>{
 await withServer(async({base})=>{
  const out=await captureWeb({scenario:scenarioFor(base,'/canvas')});
  const shots=out.pack.observations.filter(o=>o.event==='screenshot');
  assert.ok(shots.length>=2);
  assert.ok(shots.every(o=>o.evidenceRefs.length===1&&/^sha256:[a-f0-9]{64}$/.test(o.evidenceRefs[0].digest)));
  assert.ok(!out.pack.observations.some(o=>o.event==='transition'||o.event==='animation'));
  assert.ok(out.uncertainty.some(u=>u.code==='CANVAS_INTERNALS_INACCESSIBLE'&&u.count===1));
  assert.equal(validate(out.pack),true,JSON.stringify(validate.errors));
 });
});

test('B1: subresource outside localhost is blocked and reported',{skip,timeout:90000},async()=>{
 await withServer(async({base})=>{
  const out=await captureWeb({scenario:scenarioFor(base,'/external')});
  assert.ok(out.uncertainty.some(u=>u.code==='REQUEST_BLOCKED'&&u.url==='http://203.0.113.9/x.png'));
 });
});

test('unreadable selector goes to the uncertainty report; writeCapture lays out files',{skip,timeout:90000},async()=>{
 await withServer(async({base})=>{
  const out=await captureWeb({scenario:scenarioFor(base,'/transition',{inspect:['#missing']})});
  assert.ok(out.uncertainty.some(u=>u.code==='SELECTOR_NOT_FOUND'&&u.selector==='#missing'));
  const dir=await mkdtemp(join(tmpdir(),'mip-out-'));
  try{
   await writeCapture(dir,out);
   assert.deepEqual((await readdir(dir)).sort(),['frames','pack.json','uncertainty.json']);
   assert.equal((await readdir(join(dir,'frames'))).length,out.frames.length);
   assert.deepEqual(JSON.parse(await readFile(join(dir,'pack.json'),'utf8')),out.pack);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});

test('Chrome missing is a clear error',async()=>{
 await assert.rejects(captureWeb({scenario:{viewport:{width:1,height:1},steps:[{type:'navigate',url:'http://127.0.0.1:1/'}]},chromeBin:null}),/No Chrome available/);
});
