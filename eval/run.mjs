// AGE-32 eval harness. Machine metrics only; human ratings are exported blank (B3) and never filled (B5).
// Runner module default export: async ({task,arm}) => ({text, glossary:[{phrase,classification}], ambiguities:[phrase], gateViolations:[code], revisions:n}).
// Hidden expectations are read here and never passed to the runner.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseStrictJson} from '../packages/artifacts/index.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const norm=s=>String(s).toLocaleLowerCase('en-US');
const readJson=p=>parseStrictJson(readFileSync(p,'utf8'));
const loadDir=dir=>readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>readJson(join(dir,f)));
export const loadSuite=(root=here)=>({
 tasks:loadDir(join(root,'tasks')),
 expected:Object.fromEntries(loadDir(join(root,'expected')).map(e=>[e.taskId,e]))
});

const ratio=(n,d)=>d?n/d:1;
/** Pure and deterministic: same output and expectation give the same metrics. */
export function score(out,exp){
 const text=norm(out.text??'');
 const hit=exp.intents.filter(i=>i.keywords.some(k=>text.includes(norm(k))));
 const glossary=out.glossary??[];
 const right=exp.glossary.filter(g=>glossary.some(o=>norm(o.phrase)===norm(g.phrase)&&o.classification===g.classification));
 const raised=(out.ambiguities??[]).map(norm).filter(Boolean);
 const missed=exp.criticalAmbiguities.filter(a=>!raised.some(r=>r.includes(norm(a))||norm(a).includes(r)));
 return {intentCoverage:ratio(hit.length,exp.intents.length),
  criticalIntentCoverage:ratio(hit.filter(i=>i.critical).length,exp.intents.filter(i=>i.critical).length),
  glossaryAccuracy:ratio(right.length,exp.glossary.length),
  missedCriticalAmbiguities:missed.length,
  gateViolations:(out.gateViolations??[]).length,
  revisions:out.revisions??0};
}
/** A crashed run is a failure, not dropped: zero coverage, every critical ambiguity missed. */
const crashed=exp=>({intentCoverage:0,criticalIntentCoverage:0,glossaryAccuracy:0,
 missedCriticalAmbiguities:exp.criticalAmbiguities.length,gateViolations:0,revisions:0});

export async function runArm({arm,runner,tasks,expected,now=()=>performance.now()}){
 const results=[];
 for(const task of tasks){
  const t0=now();let output,error=null;
  try{output=await runner({task:structuredClone(task),arm});}catch(e){error=String(e?.message??e);}
  const elapsedMs=Math.round(now()-t0),exp=expected[task.id];
  results.push({arm,taskId:task.id,group:task.group,prompt:task.prompt,status:error?'crashed':'ok',
   ...(error?{error}:{output}),metrics:{...(error?crashed(exp):score(output,exp)),elapsedMs}});
 }
 return results;
}

/** Blinded sheet: blind id, prompt and output only, no arm label; scores null for the human. `key` maps blind id to arm and stays with the owner. */
export function exportSheets(results,{seed='age-32'}={}){
 const keyed=results.map(r=>({r,blindId:createHash('sha256').update(seed+'|'+r.arm+'|'+r.taskId).digest('hex').slice(0,12)}));
 keyed.sort((a,b)=>a.blindId<b.blindId?-1:1);
 return {
  sheet:keyed.map(({r,blindId})=>({blindId,taskId:r.taskId,prompt:r.prompt,output:r.status==='ok'?r.output.text:null,
   ratings:{visualAgreement:null,timingMatch:null}})),
  key:keyed.map(({r,blindId})=>({blindId,arm:r.arm}))
 };
}

const arg=(a,k)=>{const i=a.indexOf(k);return i<0?undefined:a[i+1];};
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const a=process.argv.slice(2),arm=arg(a,'--arm'),runnerPath=arg(a,'--runner'),out=arg(a,'--out');
 if(!arm||!runnerPath||!out){console.error('usage: node eval/run.mjs --arm <label> --runner <module> --out <metrics.json> [--sheet <sheet.json> --key <key.json>]');process.exit(2);}
 const {tasks,expected}=loadSuite();
 const runner=(await import(pathToFileURL(resolve(runnerPath)).href)).default;
 const results=await runArm({arm,runner,tasks,expected});
 writeFileSync(out,JSON.stringify(results,null,2)+'\n');
 if(arg(a,'--sheet')){
  const {sheet,key}=exportSheets(results);
  writeFileSync(arg(a,'--sheet'),JSON.stringify(sheet,null,2)+'\n');
  if(arg(a,'--key'))writeFileSync(arg(a,'--key'),JSON.stringify(key,null,2)+'\n');
 }
 console.log(`${arm}: ${results.length} tasks, ${results.filter(r=>r.status==='crashed').length} crashed`);
}
