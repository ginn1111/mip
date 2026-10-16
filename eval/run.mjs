// AGE-32 eval harness. Machine metrics only; human ratings are exported blank (B3) and never filled (B5).
// Runner module default export: async ({task,arm}) => ({text, glossary:[{phrase,classification}], ambiguities:[phrase], gateViolations:[code], revisions:n, tokens:n, costUsd:n, abandonedAttempts:n}).
// Hidden expectations are read here and never passed to the runner.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseStrictJson} from '../packages/artifacts/index.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const norm=s=>String(s).toLocaleLowerCase('en-US');
const readJson=p=>parseStrictJson(readFileSync(p,'utf8'));
const loadDir=dir=>readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>readJson(join(dir,f)));
export const loadSuite=(root=here)=>({
 tasks:loadDir(join(root,'tasks')),
 expected:Object.fromEntries(loadDir(join(root,'expected')).map(e=>[e.taskId,e]))
});

// Zero denominator means no data, not a perfect score (same rule as AGE-40).
const ratio=(n,d)=>d?n/d:null;
const COUNTERS=['revisions','tokens','costUsd','abandonedAttempts'];
const isStr=v=>typeof v==='string';
/** Invalid runner output throws; runArm records that as a crash. */
function validate(out){
 const bad=m=>{throw new Error('invalid runner output: '+m);};
 if(!out||typeof out!=='object'||Array.isArray(out))bad('not an object');
 if(!isStr(out.text))bad('text must be a string');
 if(out.glossary!==undefined&&!(Array.isArray(out.glossary)&&out.glossary.every(g=>g&&isStr(g.phrase)&&isStr(g.classification))))bad('glossary');
 if(out.ambiguities!==undefined&&!(Array.isArray(out.ambiguities)&&out.ambiguities.every(isStr)))bad('ambiguities');
 if(out.gateViolations!==undefined&&!Array.isArray(out.gateViolations))bad('gateViolations');
 for(const k of COUNTERS)if(out[k]!==undefined&&!(Number.isFinite(out[k])&&out[k]>=0))bad(k);
}
/** Pure and deterministic: same output and expectation give the same metrics. Throws on invalid output. */
export function score(out,exp){
 validate(out);
 const text=norm(out.text);
 const hit=exp.intents.filter(i=>i.keywords.some(k=>text.includes(norm(k))));
 const glossary=out.glossary??[];
 // one classification per phrase: every entry for the phrase must carry the expected one
 const right=exp.glossary.filter(g=>{
  const mine=glossary.filter(o=>norm(o.phrase)===norm(g.phrase));
  return mine.length>0&&mine.every(o=>o.classification===g.classification);
 });
 const raised=(out.ambiguities??[]).map(norm).filter(Boolean);
 // one direction only: a raised phrase must contain the expected ambiguity
 const missed=exp.criticalAmbiguities.filter(a=>!raised.some(r=>r.includes(norm(a))));
 return {intentCoverage:ratio(hit.length,exp.intents.length),
  criticalIntentCoverage:ratio(hit.filter(i=>i.critical).length,exp.intents.filter(i=>i.critical).length),
  glossaryAccuracy:ratio(right.length,exp.glossary.length),
  missedCriticalAmbiguities:missed.length,
  gateViolations:out.gateViolations===undefined?null:out.gateViolations.length,
  revisions:out.revisions??null,tokens:out.tokens??null,costUsd:out.costUsd??null,
  abandonedAttempts:out.abandonedAttempts??null};
}
/** A crashed run is a failure, not dropped: zero coverage, every critical ambiguity missed, counters unknown (null never ranks best). */
const crashed=exp=>({intentCoverage:0,criticalIntentCoverage:0,glossaryAccuracy:0,
 missedCriticalAmbiguities:exp.criticalAmbiguities.length,gateViolations:null,revisions:null,tokens:null,costUsd:null,abandonedAttempts:null});

/** Seeded task order: sort by sha256(seed|id). Same seed, same order. */
export const orderTasks=(tasks,seed)=>tasks.map(t=>[createHash('sha256').update(seed+'|'+t.id).digest('hex'),t]).sort((a,b)=>a[0]<b[0]?-1:1).map(x=>x[1]);

/** config {model,environment} must be identical for every arm (RFC 0006); recorded on each result with seed and run order. */
export async function runArm({arm,runner,tasks,expected,seed,config=null,now=()=>performance.now()}){
 if(!isStr(seed)||!seed)throw new Error('seed required');
 const results=[];
 for(const [order,task] of orderTasks(tasks,seed).entries()){
  const t0=now(),exp=expected[task.id];let metrics,output,error=null;
  try{output=await runner({task:structuredClone(task),arm});metrics=score(output,exp);}
  catch(e){error=String(e?.message??e);metrics=crashed(exp);}
  const elapsedMs=Math.round(now()-t0);
  results.push({arm,taskId:task.id,group:task.group,prompt:task.prompt,order,seed,config,status:error?'crashed':'ok',
   ...(error?{error}:{output}),metrics:{...metrics,elapsedMs}});
 }
 return results;
}

/** RFC 0006: every arm uses the same model and environment. Fail closed on missing or differing config. */
export function assertSameConfig(results){
 const first=results[0]?.config;
 const ok=c=>c&&isStr(c.model)&&c.model&&isStr(c.environment)&&c.environment;
 if(!ok(first)||!results.every(r=>ok(r.config)&&isDeepStrictEqual(r.config,first)))
  throw new Error('arms must use the same model and environment (RFC 0006)');
}

/** Blinded sheet over any mix of arms: blind id = HMAC(random secret, arm|task); order follows blind id, so arms interleave. The secret lives only in the key file. */
export function exportSheets(results,{secret=randomBytes(32).toString('hex')}={}){
 assertSameConfig(results);
 const keyed=results.map(r=>({r,blindId:createHmac('sha256',secret).update(r.arm+'|'+r.taskId).digest('hex').slice(0,16)}));
 keyed.sort((a,b)=>a.blindId<b.blindId?-1:1);
 return {
  sheet:keyed.map(({r,blindId})=>({blindId,taskId:r.taskId,prompt:r.prompt,output:r.status==='ok'?r.output.text:null,
   ratings:{visualAgreement:null,timingMatch:null}})),
  key:{secret,entries:keyed.map(({r,blindId})=>({blindId,arm:r.arm}))}
 };
}

const arg=(a,k)=>{const i=a.indexOf(k);return i<0?undefined:a[i+1];};
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const a=process.argv.slice(2);
 if(a[0]==='merge'){ // node eval/run.mjs merge <metrics.json>... --sheet <sheet.json> --key <key.json>
  const files=a.slice(1).filter((x,i,l)=>!x.startsWith('--')&&!(i>0&&l[i-1].startsWith('--')));
  if(!files.length||!arg(a,'--sheet')||!arg(a,'--key')){console.error('usage: node eval/run.mjs merge <metrics.json>... --sheet <sheet.json> --key <key.json>');process.exit(2);}
  const {sheet,key}=exportSheets(files.flatMap(readJson));
  write(arg(a,'--sheet'),sheet);write(arg(a,'--key'),key);
  console.log(`merged ${files.length} arm files into ${sheet.length} blinded rows`);
 }else{
  const arm=arg(a,'--arm'),runnerPath=arg(a,'--runner'),out=arg(a,'--out'),model=arg(a,'--model'),environment=arg(a,'--environment');
  if(!arm||!runnerPath||!out||!model||!environment){console.error('usage: node eval/run.mjs --arm <label> --runner <module> --model <id> --environment <id> --out <metrics.json> [--seed <s>]');process.exit(2);}
  const seed=arg(a,'--seed')??randomBytes(8).toString('hex');
  const {tasks,expected}=loadSuite();
  const runner=(await import(pathToFileURL(resolve(runnerPath)).href)).default;
  const results=await runArm({arm,runner,tasks,expected,seed,config:{model,environment}});
  write(out,results);
  console.log(`${arm}: ${results.length} tasks, ${results.filter(r=>r.status==='crashed').length} crashed, seed ${seed}`);
 }
}
