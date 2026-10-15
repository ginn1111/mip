// AGE-39: reference-vs-prototype alignment reviewer (docs/specs/AGE-39.md B1-B5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../packages/artifacts/approval.mjs';
import {validateGate} from '../packages/gates/index.mjs';
import {createDrafts} from '../packages/draft-artifacts/index.mjs';
import {createAlignmentServer} from '../examples/alignment/serve.mjs';
import {nearestFrame,framesOf} from '../examples/alignment/align.mjs';
import {findChrome,launch} from './browser-harness.mjs';

const chrome=findChrome();
const AUTH={authorization:'Bearer session-token'};
// Resolved pack: no INFERRED hypothesis, so the semantic draft has no blocking ambiguity and a human may lock it (AGE-38 open decision: otherwise it can never lock).
const pack=()=>{const p=JSON.parse(readFileSync('tests/fixtures/evidence-pack/valid-scorpio.json','utf8'));p.hypotheses=[];p.bindings=p.bindings.filter(b=>!b.hypothesisIds.length);return p;};
const REVIEW=[{scenarioId:'reference',accepted:true,segmentReviews:[{segmentId:'full',accepted:true,comments:[]}]}];

async function withAlignment(fn,{serve=createAlignmentServer}={}){
 const directory=await mkdtemp(join(tmpdir(),'mip-align-'));
 try{
  const store=new ArtifactStore(directory),{refs}=await createDrafts(store,pack(),{projectId:'scorpio'});
  // Host-side setup of the unrelated intent/semantic locks, like tests/support.mjs lockBase. The creative artifacts are never locked here.
  const auth=createApprovalAuthenticator({issuer:'t',secret:'s',authenticate:async()=>({id:'h0',role:'human'})});
  const base=new ApprovalService(store,{...auth,loadDependency:r=>base.sealed(r.id,r.revision)});
  for(const r of refs.slice(0,2))await base.lock(r.id,r.revision,{principal:'x',decision:'approved',reviewedDigest:r.digest});
  const server=await serve({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1',prototypeId:refs[2].id,pack:pack()});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  const api=async(method,path,body,headers=AUTH)=>{
   const res=await fetch(url+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body&&JSON.stringify(body)});
   return {status:res.status,json:await res.json().catch(()=>null)};
  };
  try{await fn({api,url,directory,store,refs,protoId:refs[2].id});}
  finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
 }finally{await rm(directory,{recursive:true,force:true});}
}
const view=api=>api('GET','/api/alignment').then(r=>r.json);
const decideAll=async(api,v,decision='accepted')=>{for(const k of v.keyframes)assert.equal((await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:k.observationId,decision})).status,200);};
const approveFlow=async(api,v)=>{
 const q=new URLSearchParams({id:v.ref.id,revision:String(v.ref.revision),digest:v.ref.digest});
 const base=(await api('GET','/api/draft?'+q)).json.draft?.savedAt??null;
 const put=await api('PUT','/api/draft',{prototypeRef:v.ref,status:'draft',scenarioReviews:REVIEW,baseSavedAt:base});
 assert.equal(put.status,200,JSON.stringify(put.json));
 return api('POST','/api/reviews',{prototypeRef:v.ref,decision:'approved'});
};

test('nearestFrame picks the closest frame and reports the signed offset (edge case)',()=>{
 const f=framesOf(pack());
 assert.deepEqual(f.map(x=>x.timeMs),[0,800]);
 assert.deepEqual([nearestFrame(f,0).offsetMs,nearestFrame(f,0).frame.timeMs],[0,0]);
 assert.deepEqual([nearestFrame(f,300).frame.timeMs,nearestFrame(f,300).offsetMs],[0,-300]);
 assert.deepEqual([nearestFrame(f,3000).frame.timeMs,nearestFrame(f,3000).offsetMs],[800,-2200]);
 assert.equal(nearestFrame(f,400).frame.timeMs,0,'tie goes to the earlier frame');
 assert.equal(nearestFrame([],5),null);
});

test('B3: an edit creates revision 2 and leaves revision 1 byte-identical',()=>withAlignment(async({api,directory,protoId,store})=>{
 const v1=await view(api),before=await readFile(join(directory,protoId,'1.json'),'utf8');
 const obs='obs-2',key=v1.keyframes.find(k=>k.observationId===obs);
 const res=await api('POST','/api/edit',{prototypeRef:v1.ref,observationId:obs,value:0.9,timeMs:key.timeMs});
 assert.equal(res.status,201,JSON.stringify(res.json));assert.equal(res.json.ref.revision,2);
 assert.equal(await readFile(join(directory,protoId,'1.json'),'utf8'),before,'revision 1 unchanged');
 assert.deepEqual(await store.history(protoId),[1,2]);
 const v2=await view(api);
 assert.equal(v2.ref.revision,2);assert.equal(v2.keyframes.find(k=>k.observationId===obs).value,0.9);
 assert.notEqual(v2.ref.digest,v1.ref.digest);
 assert.equal((await store.read(protoId,2)).lifecycle,'draft');
 assert.equal((await api('POST','/api/edit',{prototypeRef:v1.ref,observationId:obs,value:0.5})).status,409,'revision 1 is stale now');
 assert.equal((await api('POST','/api/edit',{prototypeRef:v2.ref,observationId:obs,value:'fast'})).status,400,'non numeric');
 assert.equal((await api('POST','/api/edit',{prototypeRef:v2.ref,observationId:'nope',value:1})).status,400);
}));

test('B3: accept/reject records per observation; an edit resets only its own decision',()=>withAlignment(async({api})=>{
 const v=await view(api);
 await decideAll(api,v);
 assert.equal((await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-1',decision:'rejected'})).json.decisions['obs-1'],'rejected');
 assert.equal((await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-1',decision:'maybe'})).status,400);
 assert.equal((await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'zzz',decision:'accepted'})).status,400);
 await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-1',decision:'accepted'});
 await api('POST','/api/edit',{prototypeRef:v.ref,observationId:'obs-2',value:0.9});
 const v2=await view(api);
 assert.deepEqual(v2.decisions,{'obs-1':'accepted','obs-3':'accepted'});
}));

test('B4: mode is recorded on the review state; only replicate/adapt',()=>withAlignment(async({api})=>{
 const v=await view(api);
 assert.equal(v.mode,null);
 assert.equal((await api('PUT','/api/mode',{prototypeRef:v.ref,mode:'copy'})).status,400);
 assert.equal((await api('PUT','/api/mode',{prototypeRef:v.ref,mode:'adapt'})).status,200);
 assert.equal((await view(api)).mode,'adapt');
}));

test('B1: no approval, decision, edit, mode or draft without the host token',()=>withAlignment(async({api,directory,protoId})=>{
 const v=await view(api);
 for(const headers of [{},{authorization:'Bearer nope'}]){
  const bodies=[['PUT','/api/mode',{prototypeRef:v.ref,mode:'adapt'}],['PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-1',decision:'accepted'}],
   ['POST','/api/edit',{prototypeRef:v.ref,observationId:'obs-1',value:1}],['PUT','/api/draft',{prototypeRef:v.ref,status:'draft',scenarioReviews:REVIEW,baseSavedAt:null}],
   ['POST','/api/reviews',{prototypeRef:v.ref,decision:'approved'}]];
  for(const [m,p,b] of bodies)assert.equal((await api(m,p,b,headers)).status,401,m+' '+p);
 }
 await assert.rejects(()=>readFile(join(directory,protoId,'1.json.lock')),/ENOENT/,'nothing locked');
 await assert.rejects(()=>readFile(join(directory,protoId+'-review','1.json')),/ENOENT/);
}));

test('B5/B1: approval needs mode and every transition accepted; then gate implementation passes only after the human approval',()=>withAlignment(async({api,store,refs,protoId,directory})=>{
 const gate=async()=>{
  const auth=createApprovalAuthenticator({issuer:'alignment-review-host',secret:'secret',authenticate:async()=>null});
  const svc=new ApprovalService(store,{...auth,loadDependency:r=>svc.sealed(r.id,r.revision)});
  const inputs=[];
  for(const [id,rev] of [[refs[0].id,1],[refs[1].id,1],[protoId,1],[protoId+'-review',1]])inputs.push(await svc.sealed(id,rev).catch(()=>store.read(id,rev).catch(()=>null)));
  return validateGate('implementation',inputs.filter(Boolean),r=>svc.sealed(r.id,r.revision),{verifyApproval:svc.verifyApproval});
 };
 let v=await view(api);
 assert.equal((await gate()).status,'BLOCKED','before any approval');
 assert.equal((await approveFlow(api,v)).status,409,'no mode');
 await api('PUT','/api/mode',{prototypeRef:v.ref,mode:'replicate'});
 assert.equal((await api('POST','/api/reviews',{prototypeRef:v.ref,decision:'approved'})).status,409,'no accepts');
 await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-1',decision:'accepted'});
 await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-2',decision:'rejected'});
 await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-3',decision:'accepted'});
 assert.equal((await approveFlow(api,v)).status,409,'a rejected transition blocks approval');
 await api('PUT','/api/decision',{prototypeRef:v.ref,observationId:'obs-2',decision:'accepted'});
 assert.equal((await gate()).status,'BLOCKED','accepted decisions alone are not an approval');
 const done=await api('POST','/api/reviews',{prototypeRef:v.ref,decision:'approved'});
 assert.equal(done.status,201,JSON.stringify(done.json));
 assert.equal(done.json.prototype.lifecycle,'locked');
 assert.deepEqual(done.json.review.payload.reviewer,{id:'designer-1',role:'human'});
 assert.ok(done.json.review.evidence.some(e=>/^mip:frame-manifest\//.test(e.uri)),'frame manifest evidence');
 assert.ok(done.json.prototype.evidence.some(e=>/^mip:evidence-pack\//.test(e.uri)),'pack evidence');
 const out=await gate();
 assert.equal(out.status,'PASS',JSON.stringify(out.violations));
 assert.equal((await api('PUT','/api/mode',{prototypeRef:v.ref,mode:'adapt'})).status,409,'locked revision takes no changes');
 v=await view(api);assert.equal(v.locked,true);
}));

test('server never serves the store and rejects foreign hosts',()=>withAlignment(async({url,protoId})=>{
 for(const p of ['/package.json','/'+protoId+'/1.json','/packages/artifacts/approval.mjs'])assert.equal((await fetch(url+p)).status,404,p);
 assert.equal((await fetch(url+'/')).status,200);
}));

test('code adds no approval, lock or duplicate-key-tolerant parsing',()=>{
 for(const f of ['serve.mjs','align.mjs','reviewer.mjs']){
  const src=readFileSync('examples/alignment/'+f,'utf8');
  assert.doesNotMatch(src.replace(/^\/\/.*$/gm,''),/JSON\.parse|\.lockAs?\(|\.lock\(|attestApproval|approvals\s*:\s*\[\s*\{/,f);
 }
});

const bt={skip:!chrome&&'no Chrome installed',timeout:90000};
async function withBrowser(fn){
 await withAlignment(async ctx=>{
  const b=await launch();
  try{await fn({...ctx,b});}finally{await b.close();}
 });
}

test('B2 browser: one slider drives the nearest reference frame and the preview time together',bt,()=>withBrowser(async({b,url})=>{
 await b.goto(url);
 await b.waitFor('document.getElementById("prototype-ref").textContent.startsWith("scorpio-reference-pack-prototype@1")','loaded');
 const read=()=>b.evaluate('({frame:document.getElementById("frame-time").textContent,offset:document.getElementById("offset").textContent,preview:document.getElementById("preview-time").textContent,uri:document.getElementById("frame").textContent,out:document.getElementById("preview").textContent})');
 await b.scrub(800);
 let r=await read();
 assert.deepEqual([r.frame,r.offset,r.preview],['800','0','800']);assert.match(r.uri,/frame-1500\.png/);assert.match(r.out,/globe\.rotation = 0(?!\.)/);
 await b.scrub(300);
 r=await read();
 assert.deepEqual([r.frame,r.offset,r.preview],['0','-300','300'],'nearest frame with offset');assert.match(r.uri,/frame-0000\.png/);assert.match(r.uri,/300 ms from this instant/);
 await b.scrub(3000);
 r=await read();
 assert.deepEqual([r.frame,r.offset,r.preview],['800','-2200','3000'],'no frame near: nearest shown with its offset');
 assert.match(r.out,/globe\.rotation = 0\.9428/,'preview follows the same instant');
 assert.deepEqual([b.problems,b.failedAssets],[[],[]]);
}));

test('B3/B5 browser: edit makes revision 2, human accepts, mode set, approval locks',bt,()=>withBrowser(async({b,url,directory,protoId})=>{
 await b.goto(url);
 await b.waitFor('document.querySelectorAll("#items li").length===3','items');
 assert.equal(await b.evaluate('document.getElementById("approve").disabled'),true);
 await b.type('#token','session-token');
 await b.evaluate('(()=>{const s=document.getElementById("mode");s.value="adapt";s.dispatchEvent(new Event("change"));})()');
 await b.waitFor('/Mode adapt recorded/.test(document.getElementById("status").textContent)','mode');
 await b.type('#items li[data-observation="obs-2"] input[aria-label="Value of obs-2"]','0.9');
 await b.click('#items li[data-observation="obs-2"] button.edit');
 await b.waitFor('/revision 2/.test(document.getElementById("status").textContent)','edit saved');
 await b.waitFor('document.getElementById("prototype-ref").textContent.includes("@2")','revision 2 shown');
 assert.equal(JSON.parse(await readFile(join(directory,protoId,'2.json'),'utf8')).revision,2);
 for(const o of ['obs-1','obs-2','obs-3']){
  await b.click(`#items li[data-observation="${o}"] button.accept`);
  await b.waitFor(`document.querySelector('#items li[data-observation="${o}"]').dataset.decision==="accepted"`,'accepted '+o);
 }
 await b.waitFor('!document.getElementById("approve").disabled','approve enabled');
 await b.click('#approve');
 await b.waitFor('/Locked /.test(document.getElementById("status").textContent)','locked');
 assert.equal(await b.evaluate('document.getElementById("status").className'),'status success');
 assert.equal(JSON.parse(await readFile(join(directory,protoId+'-review','2.json'),'utf8')).payload.reviewer.id,'designer-1');
 assert.deepEqual([b.problems,b.failedAssets.filter(f=>!/\/api\//.test(f))],[[],[]]);
}));
