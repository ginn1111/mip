// AGE-40: metrics deterministic on fixture outputs; report has no unmeasured number; failed stage = failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDrafts} from '../packages/draft-artifacts/index.mjs';
import {stage,evaluate,timingFidelity} from '../eval/import/metrics.mjs';
import {renderReport} from '../eval/import/report.mjs';
import {loadConfig,extractReference,runAll} from '../eval/import/pipeline.mjs';
import http from 'node:http';
import {findChrome} from '../packages/capture-web/index.mjs';

const pack=()=>JSON.parse(readFileSync('tests/fixtures/evidence-pack/valid-scorpio.json','utf8'));
const run=async(extra={})=>{
 const p=pack(),d=buildDrafts(p,{projectId:'scorpio'});
 const o=p.observations[0],[,end]=o.timeRangeMs;
 const truth={concepts:[p.hypotheses[0]?.concept??o.actorId,'no-such-concept'],instants:[{actorId:o.actorId,property:o.property,timeMs:end+10},{actorId:'ghost',property:'x',timeMs:0}],transitions:[{timeMs:o.timeRangeMs[0]},{timeMs:9e6}]};
 return evaluate({arm:'import',reference:{id:'scorpio',kind:'video'},stages:{extract:await stage(()=>({pack:p})),draft:await stage(()=>d)},truth,...extra});
};

test('metrics are deterministic and computed from fixture outputs',async()=>{
 const a=await run(),b=await run();
 assert.deepEqual(a,b);
 assert.equal(a.failed,false);
 assert.equal(a.concepts.total,2);assert.equal(a.concepts.found,1);
 assert.equal(a.timing.total,2);assert.equal(a.timing.withinTolerance,1);assert.equal(a.timing.errorsMs[1],null);
 assert.deepEqual(a.transitions,{missed:1,total:2,times:[9e6]});
 assert.equal(a.ambiguities,buildDrafts(pack(),{projectId:'scorpio'}).report.blocking.length);
});

test('timing: no keyframe counts as miss; tolerance is inclusive',()=>{
 const proto={payload:{tracks:[{actorId:'a',property:'p',keyframes:[{timeMs:100}]}]}};
 const t=timingFidelity([{actorId:'a',property:'p',timeMs:150},{actorId:'a',property:'q',timeMs:0}],proto,50);
 assert.deepEqual([t.withinTolerance,t.total],[1,2]);
});

test('failed pipeline stage is a failure with no downstream metric',async()=>{
 const r=evaluate({arm:'import',reference:{id:'x',kind:'site'},stages:{extract:await stage(()=>{throw new Error('boom');}),draft:{ok:false,error:'skipped'}},truth:{concepts:['a'],instants:[],transitions:[]}});
 assert.equal(r.failed,true);assert.equal(r.failedStage,'extract');assert.equal(r.error,'boom');
 assert.equal(r.concepts,null);assert.equal(r.timing,null);
 assert.match(renderReport([r]),/FAILED at extract: boom/);
});

test('report: missing sessions/truth reported as missing, no unmeasured number',async()=>{
 const p=pack(),d=buildDrafts(p,{projectId:'scorpio'});
 const r=evaluate({arm:'import',reference:{id:'scorpio',kind:'video'},stages:{extract:{ok:true,value:{pack:p}},draft:{ok:true,value:d}}});
 const md=renderReport([r]);
 assert.match(md,/MISSING/);assert.match(md,/human session not provided/);assert.match(md,/ground truth not provided/);
 const row=md.split('\n').find(l=>l.startsWith('| scorpio'));
 assert.deepEqual([...row.matchAll(/\d+/g)].map(m=>m[0]),[String(d.report.blocking.length)]);
});

test('eval code creates no approval or lock and adds no raw JSON.parse',()=>{
 for(const f of ['metrics','report','run','pipeline']){
  const s=readFileSync(`eval/import/${f}.mjs`,'utf8');
  assert.doesNotMatch(s,/approvals\s*:|lifecycle\s*:\s*['"]locked|JSON\.parse/);
 }
});

const goodStages=async()=>{const p=pack();return {extract:{ok:true,value:{pack:p}},draft:{ok:true,value:buildDrafts(p,{projectId:'scorpio'})}};};
const ev=async(arm,session,extra={})=>evaluate({arm,reference:{id:'r1',kind:'video'},stages:await goodStages(),session,...extra});

test('rows carry an arm; report is per arm with a comparison',async()=>{
 const i=await ev('import',{arm:'import',humanMs:1000}),m=await ev('manual',{arm:'manual',humanMs:3000});
 assert.equal(i.arm,'import');assert.equal(m.arm,'manual');
 assert.equal(m.concepts,null);
 const md=renderReport([m,i]);
 assert.match(md,/## Arm: manual/);assert.match(md,/## Arm: import/);
 assert.match(md,/r1: manual 3000 ms, import 1000 ms/);
});
test('arm validation: bad arm and arm/session mismatch throw',async()=>{
 await assert.rejects(ev('other',null),/arm/);
 await assert.rejects(ev('import',{arm:'manual',humanMs:1}),/arm/);
 await assert.rejects(ev('import',{humanMs:1}),/arm/);
});
test('report claims no comparison when an arm is missing',async()=>{
 const only=renderReport([await ev('import',{arm:'import',humanMs:1000})]);
 assert.match(only,/No comparison: manual arm missing/);
 assert.doesNotMatch(only,/manual \d+ ms/);
 assert.match(renderReport([await ev('import',null),await ev('manual',null)]),/No comparison: no reference has human time/);
});
test('humanMs must be finite and non-negative',async()=>{
 await assert.rejects(ev('import',{arm:'import',humanMs:-1}),/humanMs/);
 await assert.rejects(ev('import',{arm:'import',humanMs:'5'}),/humanMs/);
});
test('empty-string concept is rejected',async()=>{
 await assert.rejects(ev('import',null,{truth:{concepts:[''],instants:[],transitions:[]}}),/concept/);
});
test('report has RFC 0006 caveats section',()=>{
 assert.match(renderReport([]),/## RFC 0006 caveats/);
});
test('config without references gives a clear error',()=>{
 assert.throws(()=>loadConfig('{}'),/references/);
 assert.throws(()=>loadConfig('{"references":[]}'),/references/);
 assert.throws(()=>loadConfig('{"references":[{"id":"a","kind":"site"}]}'),/input/);
 assert.throws(()=>loadConfig('{"references":[{"id":"a","kind":"x","input":"i"}]}'),/kind/);
 assert.throws(()=>loadConfig('{"references":[],"references":[]}'));
});
test('runAll: import row and manual row per reference with arm-matched sessions',async()=>{
 const scenario={viewport:{width:320,height:240},steps:[{type:'navigate',url:'http://127.0.0.1:1/'}]};
 const rs=await runAll({references:[{id:'s',kind:'site',input:scenario,sessions:[{arm:'manual',humanMs:5},{arm:'import',humanMs:2}]}]},{captureOpts:{chromeBin:'/nonexistent/chrome'}});
 assert.deepEqual(rs.map(r=>[r.arm,r.humanMs]),[['manual',5],['import',2]]);
});

const skipChrome=findChrome()?false:'Chrome not available';
test('site reference reaches capture-web (local page)',{skip:skipChrome,timeout:90000},async()=>{
 const server=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<!doctype html><style>#b{opacity:1;transition:opacity 300ms}#b.o{opacity:.2}</style><div id=b></div><button id=g onclick="b.classList.toggle(\'o\')">g</button>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const scenario={viewport:{width:320,height:240},steps:[{type:'navigate',url:base+'/'},{type:'wait',ms:200},{type:'click',selector:'#g'},{type:'wait',ms:400}],inspect:['#b']};
  const out=await extractReference({id:'s',kind:'site',input:scenario});
  assert.equal(out.pack.sources[0].kind,'website');
  assert.ok(out.pack.observations.length>0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('site failure is a recorded stage failure, not ENOENT on the URL',async()=>{
 const scenario={viewport:{width:320,height:240},steps:[{type:'navigate',url:'http://127.0.0.1:1/'}]};
 const r=(await runAll({references:[{id:'s',kind:'site',input:scenario,sessions:[]}]},{captureOpts:{chromeBin:'/nonexistent/chrome'}}))[0];
 assert.equal(r.failed,true);assert.doesNotMatch(r.error,/ENOENT http:/);
});
