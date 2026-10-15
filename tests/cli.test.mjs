// AGE-30: mip CLI (docs/specs/AGE-30.md B1-B9). Spawns the real binary in throwaway project directories.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateGate} from '../packages/gates/index.mjs';

const BIN=new URL('../packages/cli/bin.mjs',import.meta.url).pathname;
const mip=(args,{cwd,env}={})=>spawnSync(process.execPath,[BIN,...args],{cwd,encoding:'utf8',env:{...process.env,...env},timeout:30000});
async function project(fn){
 const cwd=await mkdtemp(join(tmpdir(),'mip-cli-'));
 try{assert.equal(mip(['init'],{cwd}).status,0);await fn(cwd);}finally{await rm(cwd,{recursive:true,force:true});}
}
const oneLine=r=>r.stderr.trim().split('\n').length===1&&r.stderr.startsWith('mip: ');
async function walk(dir,out=[]){
 for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);e.isDirectory()?await walk(p,out):out.push(p);}
 return out;
}
/** B7: no command may leave an approval or a lock behind. */
async function assertNoApprovalOrLock(cwd){
 for(const file of await walk(join(cwd,'.mip'))){
  assert.ok(!file.endsWith('.lock'),'lock file written: '+file);
  if(!file.endsWith('.json'))continue;
  const a=JSON.parse(await readFile(file,'utf8'));
  if('approvals' in a)assert.deepEqual(a.approvals,[],'approval written: '+file);
  assert.equal('lock' in a,false,'lock written: '+file);
 }
}

test('init creates config and store, and refuses to overwrite',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'mip-cli-'));
 try{
  const first=mip(['init'],{cwd});assert.equal(first.status,0,first.stderr);
  const config=JSON.parse(await readFile(join(cwd,'mip.config.json'),'utf8'));
  assert.equal(config.protocol,'mip/0.7');assert.equal(config.store,'.mip/artifacts');
  assert.deepEqual(await readdir(join(cwd,'.mip/artifacts')),[]);
  const again=mip(['init'],{cwd});assert.equal(again.status,1);assert.ok(oneLine(again),again.stderr);assert.match(again.stderr,/already exists/);
  assert.equal(JSON.parse(await readFile(join(cwd,'mip.config.json'),'utf8')).projectId,config.projectId,'config untouched');
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('help for the tool and every command; unknown command and bad flags exit 1 with one line',()=>{
 const top=mip(['--help']);assert.equal(top.status,0);
 const commands=['init','intent','glossary','validate','preview','lock','status','verify'];
 for(const c of commands){assert.match(top.stdout,new RegExp('mip '+c),'top help lists '+c);const h=mip([c,'--help']);assert.equal(h.status,0,c);assert.match(h.stdout,new RegExp('mip '+c));}
 const unknown=mip(['frobnicate']);assert.equal(unknown.status,1);assert.ok(oneLine(unknown),unknown.stderr);
 const flag=mip(['status','--nope']);assert.equal(flag.status,1);assert.ok(oneLine(flag),flag.stderr);
 assert.equal(mip([]).status,1,'no command is a usage error');
});

test('commands outside a project fail with one line',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'mip-cli-'));
 try{for(const args of [['status'],['validate','--phase','semantic'],['intent','create','--scene','s','--text','x']]){
  const r=mip(args,{cwd});assert.equal(r.status,1,args.join(' '));assert.ok(oneLine(r),r.stderr);assert.match(r.stderr,/mip init/);
 }}finally{await rm(cwd,{recursive:true,force:true});}
});

test('intent create writes draft intent and semantic contract; validate reports the blocking ambiguity',()=>project(async cwd=>{
 const made=mip(['intent','create','--scene','zodiac','--text','Make the globe magnetic and organic'],{cwd});
 assert.equal(made.status,0,made.stderr);assert.match(made.stdout,/zodiac-intent@1/);assert.match(made.stdout,/zodiac-semantic@1/);assert.match(made.stdout,/magnetic/);
 const intent=JSON.parse(await readFile(join(cwd,'.mip/artifacts/zodiac-intent/1.json'),'utf8'));
 assert.equal(intent.kind,'intent-profile');assert.equal(intent.lifecycle,'draft');assert.equal(intent.payload.scene,'zodiac');
 const semantic=JSON.parse(await readFile(join(cwd,'.mip/artifacts/zodiac-semantic/1.json'),'utf8'));
 assert.equal(semantic.kind,'semantic-contract');assert.deepEqual(semantic.payload.blockingAmbiguities,['magnetic']);
 assert.equal(semantic.dependencies[0].id,'zodiac-intent');
 const v=mip(['validate','--phase','prototype','--json'],{cwd});
 assert.equal(v.status,2,v.stderr);const gate=JSON.parse(v.stdout);
 assert.equal(gate.status,'BLOCKED');assert.ok(gate.violations.some(x=>x.code==='UNRESOLVED_AMBIGUITY'),v.stdout);
 const text=mip(['validate','--phase','prototype'],{cwd});assert.equal(text.status,2);assert.match(text.stdout,/BLOCKED/);assert.match(text.stdout,/UNRESOLVED_AMBIGUITY/);
 await assertNoApprovalOrLock(cwd);
}));

test('re-running intent create adds a new revision and never edits the old one',()=>project(async cwd=>{
 const args=['intent','create','--scene','zodiac','--text','Make it organic'];
 assert.equal(mip(args,{cwd}).status,0);
 const before=await readFile(join(cwd,'.mip/artifacts/zodiac-intent/1.json'),'utf8');
 const second=mip(args,{cwd});assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/zodiac-intent@2/);
 assert.equal(await readFile(join(cwd,'.mip/artifacts/zodiac-intent/1.json'),'utf8'),before);
 assert.equal(JSON.parse(await readFile(join(cwd,'.mip/artifacts/zodiac-intent/2.json'),'utf8')).revision,2);
}));

test('intent create validates its input',()=>project(async cwd=>{
 for(const args of [['intent','create','--text','x'],['intent','create','--scene','s'],['intent','create','--scene','bad/scene','--text','x'],['intent','explode','--scene','s','--text','x']]){
  const r=mip(args,{cwd});assert.equal(r.status,1,args.join(' '));assert.ok(oneLine(r),r.stderr);
 }
}));

test('glossary resolve prints each term with its status',()=>project(async cwd=>{
 const r=mip(['glossary','resolve','--scene','zodiac','--text','organic and magnetic'],{cwd});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/organic\s+resolved/);assert.match(r.stdout,/magnetic\s+ambiguous/);
 assert.equal(mip(['glossary','resolve','--scene','zodiac'],{cwd}).status,1);
}));

test('status lists artifacts with lifecycle and lock state; --json parses',()=>project(async cwd=>{
 assert.match(mip(['status'],{cwd}).stdout,/no artifacts/);
 mip(['intent','create','--scene','zodiac','--text','Make it organic'],{cwd});
 const text=mip(['status'],{cwd});assert.equal(text.status,0);assert.match(text.stdout,/zodiac-intent@1\s+intent-profile\s+draft\s+lock=none/);
 const json=JSON.parse(mip(['status','--json'],{cwd}).stdout);
 assert.deepEqual(json.map(x=>[x.id,x.revision,x.kind,x.lifecycle,x.lock]),[['zodiac-intent',1,'intent-profile','draft','none'],['zodiac-semantic',1,'semantic-contract','draft','none']]);
}));

test('validate: unknown or missing phase exits 1 listing valid phases; every listed phase is a real gate phase',()=>project(async cwd=>{
 const bad=mip(['validate','--phase','nope'],{cwd});assert.equal(bad.status,1);assert.ok(oneLine(bad),bad.stderr);assert.match(bad.stderr,/semantic.*prototype.*implementation.*verification.*complete/);
 assert.equal(mip(['validate'],{cwd}).status,1);
 const phases=bad.stderr.match(/semantic.*complete/)[0].split(/[ ,]+/);
 for(const phase of phases)await assert.doesNotReject(()=>validateGate(phase,[],async()=>{}),'gate must know '+phase);
}));

test('an empty store is BLOCKED for every phase with MISSING_REQUIRED',()=>project(async cwd=>{
 for(const phase of ['semantic','prototype','implementation','verification','complete']){
  const r=mip(['validate','--phase',phase,'--json'],{cwd});assert.equal(r.status,2,phase);
  assert.ok(JSON.parse(r.stdout).violations.some(v=>v.code==='MISSING_REQUIRED'),phase);
 }
}));

test('verify runs the verification gate and is BLOCKED without an implementation contract',()=>project(async cwd=>{
 mip(['intent','create','--scene','zodiac','--text','Make it organic'],{cwd});
 const r=mip(['verify'],{cwd});assert.equal(r.status,2);assert.match(r.stdout,/BLOCKED/);assert.match(r.stdout,/MISSING_REQUIRED/);assert.match(r.stdout,/implementation-contract/);
}));

test('lock never approves: every phase points to the web reviewer, exit 3',()=>project(async cwd=>{
 mip(['intent','create','--scene','zodiac','--text','Make it organic'],{cwd});
 const creative=mip(['lock','--phase','prototype'],{cwd});assert.equal(creative.status,3);assert.match(creative.stderr,/mip preview/);assert.ok(oneLine(creative),creative.stderr);
 for(const phase of ['semantic','implementation','verification','complete']){const r=mip(['lock','--phase',phase],{cwd});assert.equal(r.status,3,phase);assert.match(r.stderr,/mip preview/,phase);}
 assert.equal(mip(['lock','--phase','nope'],{cwd}).status,1);assert.equal(mip(['lock'],{cwd}).status,1);
 await assertNoApprovalOrLock(cwd);
}));

test('a store path that escapes the project is rejected',()=>project(async cwd=>{
 const path=join(cwd,'mip.config.json'),config=JSON.parse(await readFile(path,'utf8'));
 for(const store of ['../outside','/tmp/outside','.']){
  await writeFile(path,JSON.stringify({...config,store}));
  const r=mip(['status'],{cwd});assert.equal(r.status,1,store);assert.ok(oneLine(r),r.stderr);assert.match(r.stderr,/inside the project/);
 }
}));

test('preview refuses without host configuration or for another scene',()=>project(async cwd=>{
 const env={MIP_REVIEW_TOKEN:'',MIP_APPROVAL_SECRET:'',MIP_REVIEWER_ID:''};
 const noEnv=mip(['preview','--scene','scorpio','--port','0'],{cwd,env});assert.equal(noEnv.status,1);assert.match(noEnv.stderr,/MIP_REVIEW_TOKEN/);assert.ok(oneLine(noEnv),noEnv.stderr);
 const other=mip(['preview','--scene','zodiac','--port','0'],{cwd,env:{MIP_REVIEW_TOKEN:'t',MIP_APPROVAL_SECRET:'s',MIP_REVIEWER_ID:'r'}});assert.equal(other.status,1);assert.match(other.stderr,/scorpio/);
}));

test('preview serves the reviewer and approves nothing',()=>project(async cwd=>{
 const child=spawn(process.execPath,[BIN,'preview','--scene','scorpio','--port','0'],{cwd,env:{...process.env,MIP_REVIEW_TOKEN:'t',MIP_APPROVAL_SECRET:'s',MIP_REVIEWER_ID:'r'}});
 try{
  const url=await new Promise((resolve,reject)=>{
   let text='';const timer=setTimeout(()=>reject(new Error('no URL printed: '+text)),15000);
   child.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/127\.0\.0\.1:\d+\//);if(m){clearTimeout(timer);resolve(m[0]);}});
   child.on('exit',code=>reject(new Error('preview exited '+code)));
  });
  const res=await fetch(url+'api/prototype');assert.equal(res.status,200);
  const proto=await res.json();assert.equal(proto.ref.id,'scorpio-prototype');
  assert.equal((await fetch(url+'package.json')).status,404);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 const files=(await walk(join(cwd,'.mip/reviews'))).map(f=>f.replace(cwd,''));
 assert.ok(files.every(f=>!f.endsWith('.lock')),files.join(','));
 await assertNoApprovalOrLock(cwd);
}));

test('a mip.config.json with a duplicate key is rejected (duplicate keys never allowed)',()=>project(async cwd=>{
 await writeFile(join(cwd,'mip.config.json'),'{"protocol":"mip/0.7","projectId":"p","store":".mip/artifacts","store":"../outside"}');
 const r=mip(['status'],{cwd});assert.equal(r.status,1);assert.ok(oneLine(r),r.stderr);assert.match(r.stderr,/Duplicate JSON key/);
}));
