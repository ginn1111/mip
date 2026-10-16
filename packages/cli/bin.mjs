#!/usr/bin/env node
// mip CLI (docs/specs/AGE-30.md). Thin wrapper over the core packages: no gate logic and no approval of its own.
// Exit codes: 0 ok, 1 usage or I/O, 2 gate BLOCKED, 3 approval refused.
import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir,readdir,access,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {ArtifactStore,parseStrictJson} from '../artifacts/index.mjs';
import {validateGate} from '../gates/index.mjs';
import {extractIntent,proposeSemanticContract,resolve as resolveTerms} from '../glossary/index.mjs';

const PHASES=['semantic','prototype','implementation','verification','complete'];
const COMMANDS={
 init:'mip init [dir]                                        create mip.config.json and the artifact store',
 intent:'mip intent create --scene <id> --text <text> [--candidate <phrase>...]   write a draft intent-profile and semantic-contract',
 glossary:'mip glossary resolve --scene <id> --text <text>          show how each term resolves',
 validate:'mip validate --phase <phase> [--json]                  run the phase gate (exit 2 when BLOCKED); gates the latest revision of each kind, across all scenes',
 preview:'mip preview --scene scorpio [--port <n>]                serve the human reviewer; approves nothing',
 lock:'mip lock --phase <phase>                                refuses: every approval happens in the web reviewer',
 status:'mip status [--json]                                     list artifacts, lifecycle and lock state',
 verify:'mip verify                                             run the verification gate'};
class UsageError extends Error{}
class Refused extends Error{}
const fail=message=>{throw new UsageError(message);};
const ID=/^[a-zA-Z0-9._-]+$/;
const help=name=>name?COMMANDS[name]+'\n':'mip <command> [options]\n\n'+Object.values(COMMANDS).map(c=>'  '+c).join('\n')+'\n\nExit codes: 0 ok, 1 usage or I/O, 2 gate BLOCKED, 3 approval refused.\n';
const parse=(args,options)=>{try{return parseArgs({args,options:{help:{type:'boolean'},...options},allowPositionals:true,strict:true});}catch(e){fail(e.message.split('\n')[0]);}};

const requirePhase=phase=>{
 if(!phase)fail('--phase is required; one of '+PHASES.join(', '));
 if(!PHASES.includes(phase))fail('unknown phase "'+phase+'"; one of '+PHASES.join(', '));
};
const inside=(base,path)=>{const rel=relative(base,path);return !!rel&&!rel.startsWith('..')&&!isAbsolute(rel);};
async function loadProject(){
 const cwd=process.cwd();let config;
 try{config=parseStrictJson(await readFile(join(cwd,'mip.config.json'),'utf8'));}
 catch(e){if(e.code==='ENOENT')fail('no mip.config.json here: run `mip init`');fail('unreadable mip.config.json: '+e.message);}
 if(!config||typeof config!=='object'||Array.isArray(config))fail('mip.config.json must be a JSON object');
 if(config.protocol!=='mip/0.7')fail('unsupported protocol '+JSON.stringify(config.protocol));
 if(typeof config.projectId!=='string'||!config.projectId)fail('mip.config.json needs a projectId string');
 if(typeof config.store!=='string'||!config.store)fail('mip.config.json needs a store path string');
 const dir=resolve(cwd,config.store);
 if(!inside(cwd,dir))fail('store must be inside the project directory');
 // Symlinks: compare real paths so a linked .mip or .mip/artifacts cannot point the store outside.
 let real;try{real=await realpath(dir);}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')fail('store '+config.store+' does not exist: run `mip init`');throw e;}
 if(!inside(await realpath(cwd),real))fail('store must be inside the project directory');
 return {cwd,config,store:new ArtifactStore(real),dir:real};
}
// A stray file where an artifact directory should be is one clear error, not a raw scandir message.
const history=async(store,id)=>{try{return await store.history(id);}catch(e){if(e.code==='ENOTDIR')fail('unexpected file in store: '+id);throw e;}};
async function allArtifacts(store,dir){
 let ids;try{ids=await readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const out=[];
 for(const id of ids.sort())for(const revision of await history(store,id)){
  const artifact=await store.read(id,revision);
  let lock='none';try{await access(store.path(id,revision)+'.lock');lock='present';}catch{}
  out.push({artifact,lock});
 }
 return out;
}
const latestOf=(entries,kind)=>entries.map(e=>e.artifact).filter(a=>a.kind===kind).sort((a,b)=>a.revision-b.revision).at(-1);

const commands={
 async init(args){
  const {positionals}=parse(args,{});const root=resolve(positionals[0]??'.');
  const target=join(root,'mip.config.json');
  try{await access(target);fail('mip.config.json already exists; refusing to overwrite');}catch(e){if(e instanceof UsageError)throw e;}
  await mkdir(join(root,'.mip/artifacts'),{recursive:true});
  await writeFile(target,JSON.stringify({protocol:'mip/0.7',projectId:basename(root).replace(/[^a-zA-Z0-9._-]/g,'-')||'project',store:'.mip/artifacts'},null,2)+'\n',{flag:'wx'});
  console.log('initialized '+root);
 },
 async intent(args){
  const {values,positionals}=parse(args,{scene:{type:'string'},text:{type:'string'},candidate:{type:'string',multiple:true}});
  if(positionals[0]!=='create')fail('usage: mip intent create --scene <id> --text <text>');
  if(!values.scene||!ID.test(values.scene))fail('--scene is required and may use letters, digits, dot, dash and underscore');
  if(!values.text?.trim())fail('--text is required');
  const {config,store,dir}=await loadProject();
  const intentId=values.scene+'-intent',semanticId=values.scene+'-semantic';
  const next=async id=>{try{return (await history(store,id)).at(-1)+1;}catch(e){if(e.code==='ENOENT')return 1;throw e;}};
  const intentRev=await next(intentId),semanticRev=await next(semanticId);
  const intent=extractIntent(values.text,{sceneId:values.scene,candidates:values.candidate??[]});
  const base={protocol:'mip/0.7',projectId:config.projectId,lifecycle:'draft',evidence:[],approvals:[]};
  const intentArtifact={...base,id:intentId,kind:'intent-profile',revision:intentRev,dependencies:[],
   payload:{scene:values.scene,goal:values.text,constraints:[]}};
  const intentRef=await store.create(intentArtifact);
  const contract=proposeSemanticContract(intent);
  await store.create({...base,id:semanticId,kind:'semantic-contract',revision:semanticRev,dependencies:[intentRef],
   payload:{concepts:contract.concepts,blockingAmbiguities:contract.blockingAmbiguities}});
  console.log(`created ${intentId}@${intentRev} and ${semanticId}@${semanticRev}`);
  console.log(contract.blockingAmbiguities.length?'blocking ambiguities: '+contract.blockingAmbiguities.join(', '):'no blocking ambiguities');
 },
 async glossary(args){
  const {values,positionals}=parse(args,{scene:{type:'string'},text:{type:'string'}});
  if(positionals[0]!=='resolve')fail('usage: mip glossary resolve --scene <id> --text <text>');
  if(!values.scene)fail('--scene is required');if(!values.text?.trim())fail('--text is required');
  const matches=resolveTerms(values.text);
  if(!matches.length)console.log('no glossary terms found');
  for(const m of matches)console.log(m.term.padEnd(18)+m.status.padEnd(10)+m.interpretations.map(i=>i.meaning).join(' | '));
 },
 async status(args){
  const {values}=parse(args,{json:{type:'boolean'}});
  const {store,dir}=await loadProject();const entries=await allArtifacts(store,dir);
  const rows=entries.map(({artifact:a,lock})=>({id:a.id,revision:a.revision,kind:a.kind,lifecycle:a.lifecycle,lock}));
  if(values.json){console.log(JSON.stringify(rows));return;}
  if(!rows.length){console.log('no artifacts');return;}
  for(const r of rows)console.log((r.id+'@'+r.revision).padEnd(28)+r.kind.padEnd(26)+r.lifecycle.padEnd(10)+'lock='+r.lock);
 },
 async validate(args){
  const {values}=parse(args,{phase:{type:'string'},json:{type:'boolean'}});
  return runGate(values.phase,values.json);
 },
 async verify(args){parse(args,{});return runGate('verification',false);},
 async lock(args){
  const {values}=parse(args,{phase:{type:'string'}});
  requirePhase(values.phase);
  // Project owner decision 2026-10-15: every approval, creative or not, happens in the web reviewer.
  throw new Refused('approval is a human act in the web reviewer: run `mip preview`');
 },
 async preview(args){
  const {values}=parse(args,{scene:{type:'string'},port:{type:'string'}});
  if(values.scene!=='scorpio')fail('only the bundled scene "scorpio" can be previewed today');
  const port=values.port??process.env.PORT??'4173';
  if(!/^\d+$/.test(port)||Number(port)>65535)fail('--port must be an integer from 0 to 65535');
  const {cwd}=await loadProject();
  for(const name of ['MIP_REVIEW_TOKEN','MIP_APPROVAL_SECRET','MIP_REVIEWER_ID'])if(!process.env[name])fail(name+' must be set; the host verifies the human, not this CLI');
  const serve=fileURLToPath(new URL('../../examples/scorpio/serve.mjs',import.meta.url));
  const child=spawn(process.execPath,[serve],{cwd,stdio:['ignore','inherit','inherit'],env:{...process.env,PORT:port,MIP_REVIEW_DIR:process.env.MIP_REVIEW_DIR||join(cwd,'.mip/reviews')}});
  let stopped=false;const stop=()=>{stopped=true;child.kill('SIGTERM');};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  const [code]=await new Promise(r=>child.on('exit',(c,sig)=>r([c??(stopped?0:1),sig])));
  if(code)console.error('mip: reviewer exited with code '+code);
  return code;
 }};

async function runGate(phase,json){
 requirePhase(phase);
 const {store,dir}=await loadProject();const entries=await allArtifacts(store,dir);
 const inputs=[];
 for(const kind of ['intent-profile','semantic-contract','prototype-spec','prototype-review','implementation-contract','verification-record']){
  const latest=latestOf(entries,kind);if(latest)inputs.push(latest);
 }
 const out=await validateGate(phase,inputs,ref=>store.read(ref.id,ref.revision));
 if(json)console.log(JSON.stringify(out));
 else{console.log(out.status+' '+phase);for(const v of out.violations)console.log('  '+v.code+' '+(v.artifact??v.kind??''));}
 return out.status==='PASS'?0:2;
}

export async function main(argv){
 try{
  const [name,...rest]=argv;
  if(!name)fail('missing command; run `mip --help`');
  if(name==='--help'||name==='-h'){process.stdout.write(help());return 0;}
  if(!COMMANDS[name])fail('unknown command "'+name+'"; run `mip --help`');
  if(rest.includes('--help')||rest.includes('-h')){process.stdout.write(help(name));return 0;}
  return (await commands[name](rest))??0;
 }catch(e){
  if(e instanceof UsageError){console.error('mip: '+e.message);return 1;}
  if(e instanceof Refused){console.error('mip: '+e.message);return 3;}
  console.error('mip: '+String(e.message??e).split('\n')[0]);return 1;
 }
}
if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??''))process.exitCode=await main(process.argv.slice(2));
