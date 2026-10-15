// Smoke test: boots the real server process exactly as documented, drives it over HTTP, then runs the gate on persisted files.
import {spawn} from 'node:child_process';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {ArtifactStore,artifactDigest} from '../packages/artifacts/index.mjs';
import {ApprovalService,createApprovalAuthenticator} from '../packages/artifacts/approval.mjs';
import {validateGate} from '../packages/gates/index.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(join(process.env.TMPDIR||tmpdir(),'mip-smoke-'));
const env={...process.env,MIP_REVIEW_DIR:join(dir,'store'),MIP_APPROVAL_SECRET:'smoke-secret',MIP_REVIEW_TOKEN:'smoke-token',MIP_REVIEWER_ID:'designer-1',PORT:'4391'};
const child=spawn('node',['examples/scorpio/serve.mjs'],{cwd:root,env,stdio:['ignore','pipe','inherit']});
const B='http://127.0.0.1:4391',log=(k,v)=>console.log(k.padEnd(34),v);
try{
 await new Promise((res,rej)=>{child.stdout.on('data',d=>/reviewer http/.test(String(d))&&res());child.on('exit',c=>rej(new Error('server exited '+c)));setTimeout(()=>rej(new Error('server timeout')),8000);});
 log('UI /',(await fetch(B+'/')).status);
 for(const p of ['/package.json','/packages/artifacts/approval.mjs','/.mip/reviews/x.json'])log('leak probe '+p,(await fetch(B+p)).status);
 log('bad Host',await new Promise(r=>import('node:http').then(h=>h.request({host:'127.0.0.1',port:4391,headers:{Host:'evil.example'}},x=>{x.resume();r(x.statusCode);}).end())));
 const proto=await (await fetch(B+'/api/prototype')).json();log('prototype ref',proto.ref.id+'@'+proto.ref.revision+' '+proto.ref.digest.slice(0,19)+'…');
 const seg=ids=>[{scenarioId:'select-scorpio',accepted:true,segmentReviews:ids.map(segmentId=>({segmentId,accepted:true,comments:segmentId==='rotation'?[{timeMs:1500,text:'smoke comment'}]:[]}))}];
 const H=auth=>({'content-type':'application/json',...(auth?{authorization:auth}:{})});
 let lastSaved=null;
 const put=async(scenarioReviews,auth,ref=proto.ref,status='draft',baseSavedAt=lastSaved)=>{
  const res=await fetch(B+'/api/draft',{method:'PUT',headers:H(auth),body:JSON.stringify({prototypeRef:ref,status,scenarioReviews,baseSavedAt})});
  if(res.status===200){const j=await res.clone().json();lastSaved=j.draft.savedAt;}
  return res;
 };
 const post=(auth,ref=proto.ref)=>fetch(B+'/api/reviews',{method:'POST',headers:H(auth),body:JSON.stringify({prototypeRef:ref,decision:'approved'})});
 const all=['anticipation','rotation','constellation'];
 log('draft no auth',(await put(seg(all),null)).status);
 log('draft raw token (no Bearer)',(await put(seg(all),'smoke-token')).status);
 log('draft stale digest',(await put(seg(all),'Bearer smoke-token',{...proto.ref,digest:'sha256:'+'0'.repeat(64)})).status);
 log('approve with no draft',(await post('Bearer smoke-token')).status);
 log('save partial draft',(await put(seg(['anticipation']),'Bearer smoke-token')).status);
 log('approve partial draft',(await post('Bearer smoke-token')).status);
 log('stale baseSavedAt (lost update)',(await put(seg(all),'Bearer smoke-token',proto.ref,'draft',null)).status);
 log('save changes_requested',(await put(seg(all),'Bearer smoke-token',proto.ref,'changes_requested')).status);
 log('approve while changes requested',(await post('Bearer smoke-token')).status);
 log('save complete draft',(await put(seg(all),'Bearer smoke-token')).status);
 log('approve no auth',(await post(null)).status);
 const ok=await post('Bearer smoke-token');const out=await ok.json();log('full approval',ok.status);
 assert.equal(ok.status,201);assert.equal(out.prototype.lifecycle,'locked');assert.equal(out.review.lifecycle,'locked');
 assert.deepEqual(out.review.payload.scenarioReviews[0].segmentReviews[1].comments,[{timeMs:1500,text:'smoke comment'}]);
 log('review.prototypeRef == prototype lock',out.review.payload.prototypeRef.digest===out.prototype.lock.digest);
 log('reviewer / approvers',[out.review.payload.reviewer.id,out.prototype.approvals[0].actor.id,out.review.approvals[0].actor.id].join(' / '));
 log('draft after lock',(await put(seg(all),'Bearer smoke-token')).status);
 log('replay',(await post('Bearer smoke-token')).status);
 log('persisted files',(await readdir(join(dir,'store','scorpio-prototype'))).concat(await readdir(join(dir,'store','scorpio-prototype-review'))).sort().join(', '));
 // Gate against what is on disk, with an independent verifier instance sharing only the host secret.
 const store=new ArtifactStore(join(dir,'store'));
 const auth=createApprovalAuthenticator({issuer:'scorpio-review-host',secret:'smoke-secret',authenticate:async()=>null});
 const approval=new ApprovalService(store,{...auth});
 const sealedProto=await approval.sealed('scorpio-prototype',1),sealedReview=await approval.sealed('scorpio-prototype-review',1);
 const base=[];for(const [id,kind,payload] of [['intent','intent-profile',{scene:'scorpio',goal:'reveal',constraints:[]}],['semantic','semantic-contract',{concepts:[],blockingAmbiguities:[]}]]){
  const a={protocol:'mip/0.7',id,projectId:'scorpio',kind,revision:1,lifecycle:'locked',dependencies:[],payload,evidence:[],approvals:[]};
  const reviewer=createApprovalAuthenticator({issuer:'scorpio-review-host',secret:'smoke-secret',authenticate:async()=>({id:'designer-1',role:'human'})});
  const ap=reviewer.attestApproval({actor:{id:'designer-1',role:'human'},decision:'approved',reviewedDigest:artifactDigest(a),timestamp:'2026-10-14T00:00:00.000Z'});
  base.push({...a,approvals:[ap],lock:{digest:artifactDigest(a),timestamp:ap.timestamp,dependencyDigests:[]}});
 }
 const load=r=>approval.sealed(r.id,r.revision);
 const pass=await validateGate('implementation',[...base,sealedProto,sealedReview],load,{verifyApproval:auth.verifyApproval});
 log('implementation gate',pass.status+' '+JSON.stringify(pass.violations));assert.equal(pass.status,'PASS');
 const tampered={...sealedProto,payload:{...sealedProto.payload,durationMs:sealedProto.payload.durationMs+1}};
 const bad=await validateGate('implementation',[...base,tampered,sealedReview],load,{verifyApproval:auth.verifyApproval});
 log('gate with changed prototype',bad.status+' '+[...new Set(bad.violations.map(v=>v.code))].join(','));assert.equal(bad.status,'BLOCKED');
 const missing=await validateGate('implementation',[...base,sealedProto],load,{verifyApproval:auth.verifyApproval});
 log('gate with missing review',missing.status+' '+[...new Set(missing.violations.map(v=>v.code))].join(','));assert.equal(missing.status,'BLOCKED');
 log('review evidence',sealedReview.evidence.map(e=>e.uri+' '+e.digest.slice(0,19)+'…').join(', '));
 assert.equal(sealedReview.evidence.length,1);assert.equal(sealedReview.evidence[0].mediaType,'application/vnd.mip.frame-manifest+json');
 const forged={...sealedReview,evidence:[{...sealedReview.evidence[0],digest:'sha256:'+'0'.repeat(64)}]};
 const ev=await validateGate('implementation',[...base,sealedProto,forged],load,{verifyApproval:auth.verifyApproval});
 log('gate with altered evidence',ev.status+' '+[...new Set(ev.violations.map(v=>v.code))].join(','));assert.ok(ev.violations.some(v=>v.code==='REVIEW_EVIDENCE_MISMATCH'));
 console.log('\nSMOKE OK');
}finally{child.kill();}
