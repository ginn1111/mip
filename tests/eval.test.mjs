import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {loadSuite,score,runArm,exportSheets} from '../eval/run.mjs';
import runner from './fixtures/eval/runner.mjs';

const schema=n=>JSON.parse(readFileSync(new URL('../eval/schemas/'+n+'.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});
const vTask=ajv.compile(schema('task')),vExp=ajv.compile(schema('expected'));
const {tasks,expected}=loadSuite();
const GROUPS=['explicit-motion','ambiguous-artistic','multistage','interactive','conflicting-intents'];
const clock=()=>{let t=0;return()=>(t+=7);};

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
 const run=()=>runArm({arm:'A',runner,tasks,expected,now:clock()});
 const a=await run(),b=await run();
 assert.deepEqual(a,b);
 assert.deepEqual(a.find(r=>r.taskId==='T01').metrics,
  {intentCoverage:1,criticalIntentCoverage:1,glossaryAccuracy:1,missedCriticalAmbiguities:0,gateViolations:0,revisions:1,elapsedMs:7});
 assert.equal(a.find(r=>r.taskId==='T05').metrics.gateViolations,1);
});
test('B2: crashed run counts as failure and is kept',async()=>{
 const rs=await runArm({arm:'A',runner,tasks,expected,now:clock()});
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
 const rs=[...await runArm({arm:'baseline-arm',runner,tasks,expected,now:clock()}),...await runArm({arm:'mip-arm',runner,tasks,expected,now:clock()})];
 const {sheet,key}=exportSheets(rs);
 assert.doesNotMatch(JSON.stringify(sheet),/baseline-arm|mip-arm/);
 assert.equal(sheet.length,40);
 for(const row of sheet)assert.deepEqual(row.ratings,{visualAgreement:null,timingMatch:null});
 assert.deepEqual(new Set(key.map(k=>k.arm)),new Set(['baseline-arm','mip-arm']));
 assert.deepEqual(exportSheets(rs),exportSheets(rs));
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
