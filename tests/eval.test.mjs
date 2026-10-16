import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {parseStrictJson} from '../packages/artifacts/index.mjs';
import {loadSuite,score,runArm,exportSheets,assertSameConfig} from '../eval/run.mjs';
import runner from './fixtures/eval/runner.mjs';

const schema=n=>parseStrictJson(readFileSync(new URL('../eval/schemas/'+n+'.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});
const vTask=ajv.compile(schema('task')),vExp=ajv.compile(schema('expected'));
const {tasks,expected}=loadSuite();
const GROUPS=['explicit-motion','ambiguous-artistic','multistage','interactive','conflicting-intents'];
const clock=()=>{let t=0;return()=>(t+=7);};
const CFG={model:'m1',environment:'e1'};
const arm=(a,r=runner,extra={})=>runArm({arm:a,runner:r,tasks,expected,now:clock(),seed:'s1',config:CFG,...extra});
const SECRET='k'.repeat(32);

test('B1: 20 tasks and 20 expected files validate; four per group; one expectation per task',()=>{
 assert.equal(tasks.length,20);
 for(const t of tasks)assert.equal(vTask(t),true,t.id+JSON.stringify(vTask.errors));
 for(const g of GROUPS)assert.equal(tasks.filter(t=>t.group===g).length,4,g);
 assert.equal(Object.keys(expected).length,20);
 for(const t of tasks){assert.ok(expected[t.id],t.id);assert.equal(vExp(expected[t.id]),true,t.id+JSON.stringify(vExp.errors));}
});
test('B1: task files shown to the agent carry no expectations',()=>{
 for(const t of tasks)assert.deepEqual(Object.keys(t).sort(),['group','id','prompt','protocol','scene']);
});
test('B2: metrics on a fixture run are deterministic',async()=>{
 const a=await arm('A'),b=await arm('A');
 assert.deepEqual(a,b);
 assert.deepEqual(a.find(r=>r.taskId==='T01').metrics,
  {intentCoverage:1,criticalIntentCoverage:1,glossaryAccuracy:1,missedCriticalAmbiguities:0,gateViolations:0,revisions:1,
   tokens:100,costUsd:0.01,abandonedAttempts:0,elapsedMs:7});
 assert.equal(a.find(r=>r.taskId==='T05').metrics.gateViolations,1);
});
test('B2: crashed run counts as failure and is kept',async()=>{
 const rs=await arm('A');
 assert.equal(rs.length,20);
 const r=rs.find(x=>x.taskId==='T03');
 assert.equal(r.status,'crashed');assert.match(r.error,/fixture crash/);
 assert.equal(r.metrics.intentCoverage,0);assert.equal(r.metrics.glossaryAccuracy,0);
});
test('B2: missed critical ambiguity is counted',()=>{
 assert.equal(score({text:'x'},expected.T05).missedCriticalAmbiguities,1);
 assert.equal(score({text:'x',ambiguities:['magnetic']},expected.T05).missedCriticalAmbiguities,0);
});
test('B3: rating sheets contain no arm labels; scores left empty',async()=>{
 const rs=[...await arm('baseline-arm'),...await arm('mip-arm')];
 const {sheet,key}=exportSheets(rs,{secret:SECRET});
 assert.doesNotMatch(JSON.stringify(sheet),/baseline-arm|mip-arm/);
 assert.equal(sheet.length,40);
 for(const row of sheet)assert.deepEqual(row.ratings,{visualAgreement:null,timingMatch:null});
 assert.deepEqual(new Set(key.entries.map(k=>k.arm)),new Set(['baseline-arm','mip-arm']));
 assert.deepEqual(exportSheets(rs,{secret:SECRET}),exportSheets(rs,{secret:SECRET}));
});
test('B4/B5: report marks every target a hypothesis and human ratings missing',()=>{
 const md=readFileSync(new URL('../docs/reports/AGE-32.md',import.meta.url),'utf8');
 const rows=md.split('## Targets')[1].split('\n## ')[0].split('\n').filter(l=>/^\|/.test(l)&&!/^\|[-| ]+\|$/.test(l)).slice(1);
 assert.ok(rows.length>=5);
 for(const r of rows)assert.match(r,/hypothesis/i,r);
 assert.match(md,/ratings[\s\S]*missing/i);
});
test('constraints: eval code uses strict JSON, creates no approvals or locks',()=>{
 const src=readFileSync(new URL('../eval/run.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/JSON\.parse\(|ApprovalService|approvals/);
 assert.match(src,/parseStrictJson/);
});

test('blocker: reverse-direction ambiguity match removed',()=>{
 assert.equal(score({text:'x',ambiguities:['s']},expected.T17).missedCriticalAmbiguities,1);
 assert.equal(score({text:'x',ambiguities:['the instant vs slow conflict']},expected.T17).missedCriticalAmbiguities,0);
});
test('blocker: one classification per phrase; all three scores wrong',()=>{
 const g=['resolved','ambiguous','unknown'].map(classification=>({phrase:'magnetic',classification}));
 assert.equal(score({text:'x',glossary:g},expected.T05).glossaryAccuracy,0);
 assert.equal(score({text:'x',glossary:[g[1]]},expected.T05).glossaryAccuracy,1/3);
});
test('nit: ratio over zero is null, not a free 1',()=>{
 const m=score({text:'x'},{intents:[],glossary:[],criticalAmbiguities:[]});
 assert.equal(m.intentCoverage,null);assert.equal(m.criticalIntentCoverage,null);assert.equal(m.glossaryAccuracy,null);
});
test('blocker: invalid runner output is a crash, arm continues, crash never scores best',async()=>{
 const ok={text:'x',gateViolations:[],revisions:0,tokens:1,costUsd:0,abandonedAttempts:0};
 const bad=async({task})=>task.id==='T01'?{text:5}:task.id==='T02'?{text:'x',glossary:'no'}:task.id==='T04'?null:ok;
 const rs=await arm('A',bad);
 assert.equal(rs.length,20);
 for(const id of ['T01','T02','T04']){
  const r=rs.find(x=>x.taskId===id);
  assert.equal(r.status,'crashed',id);assert.ok(r.error,id);
  for(const k of ['gateViolations','revisions','tokens','costUsd','abandonedAttempts'])assert.equal(r.metrics[k],null,id+k);
 }
});
test('missing counters are null, not best',async()=>{
 const rs=await arm('A',async()=>({text:'x'}));
 assert.equal(rs[0].status,'ok');
 for(const k of ['gateViolations','revisions','tokens','costUsd','abandonedAttempts'])assert.equal(rs[0].metrics[k],null,k);
});
test('blocker: blind ids not derivable without the key; merged shuffled sheet',async()=>{
 const rs=[...await arm('A'),...await arm('B')];
 const {sheet,key}=exportSheets(rs);
 const old=r=>createHash('sha256').update('age-32|'+r.arm+'|'+r.taskId).digest('hex').slice(0,12);
 const ids=new Set(sheet.map(r=>r.blindId));
 assert.equal(ids.size,40);
 for(const r of rs)assert.ok(!ids.has(old(r)));
 assert.ok(key.secret.length>=32);
 const again=exportSheets(rs);
 assert.notEqual(again.key.secret,key.secret);
 assert.notDeepEqual(again.sheet.map(r=>r.blindId),sheet.map(r=>r.blindId));
 const first=sheet.slice(0,10).map(r=>key.entries.find(k=>k.blindId===r.blindId).arm);
 assert.equal(new Set(first).size,2,'arms interleaved');
 assert.ok(!JSON.stringify(sheet).includes(key.secret));
});
test('RFC 0006: task order seeded, recorded, differs by seed; config recorded',async()=>{
 const a=await arm('A'),a2=await arm('A'),c=await arm('A',runner,{seed:'s2'});
 const order=rs=>rs.map(r=>r.taskId).join();
 assert.equal(order(a),order(a2));
 assert.notEqual(order(a),order(c));
 assert.notEqual(order(a),tasks.map(t=>t.id).join());
 assert.deepEqual(a.map(r=>r.order),[...a.keys()]);
 assert.equal(a[0].seed,'s1');assert.deepEqual(a[0].config,CFG);
});
test('RFC 0006: all arms must share model and environment',async()=>{
 const a=await arm('A'),b=await arm('B',runner,{config:{model:'m2',environment:'e1'}});
 assert.throws(()=>assertSameConfig([...a,...b]),/same model/);
 assert.throws(()=>exportSheets([...a,...b]),/same model/);
 const n=await arm('C',runner,{config:null});
 assert.throws(()=>assertSameConfig([...a,...n]),/same model/);
 assertSameConfig([...a,...await arm('B')]);
});
test('report and spec: owner gintary, same model wording',()=>{
 const md=readFileSync(new URL('../docs/reports/AGE-32.md',import.meta.url),'utf8');
 assert.match(md,/^---\n[\s\S]*?owner: gintary\n/);
 assert.match(md,/same model and environment/i);
 const sp=readFileSync(new URL('../docs/specs/AGE-32.md',import.meta.url),'utf8');
 assert.doesNotMatch(sp+md,/Agent and model per arm|model used for each arm/i);
});
