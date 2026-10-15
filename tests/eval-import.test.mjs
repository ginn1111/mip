// AGE-40: metrics deterministic on fixture outputs; report has no unmeasured number; failed stage = failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDrafts} from '../packages/draft-artifacts/index.mjs';
import {stage,evaluate,timingFidelity} from '../eval/import/metrics.mjs';
import {renderReport} from '../eval/import/report.mjs';

const pack=()=>JSON.parse(readFileSync('tests/fixtures/evidence-pack/valid-scorpio.json','utf8'));
const run=async(extra={})=>{
 const p=pack(),d=buildDrafts(p,{projectId:'scorpio'});
 const o=p.observations[0],[,end]=o.timeRangeMs;
 const truth={concepts:[p.hypotheses[0]?.concept??o.actorId,'no-such-concept'],instants:[{actorId:o.actorId,property:o.property,timeMs:end+10},{actorId:'ghost',property:'x',timeMs:0}],transitions:[{timeMs:o.timeRangeMs[0]},{timeMs:9e6}]};
 return evaluate({reference:{id:'scorpio',kind:'video'},stages:{extract:await stage(()=>({pack:p})),draft:await stage(()=>d)},truth,...extra});
};

test('metrics are deterministic and computed from fixture outputs',async()=>{
 const a=await run(),b=await run();
 assert.deepEqual(a,b);
 assert.equal(a.failed,false);
 assert.equal(a.concepts.total,2);assert.equal(a.concepts.found,1);
 assert.equal(a.timing.total,2);assert.equal(a.timing.withinTolerance,1);assert.equal(a.timing.errorsMs[1],null);
 assert.deepEqual(a.transitions,{missed:1,total:2,ids:[9e6]});
 assert.equal(a.ambiguities,buildDrafts(pack(),{projectId:'scorpio'}).report.blocking.length);
});

test('timing: no keyframe counts as miss; tolerance is inclusive',()=>{
 const proto={payload:{tracks:[{actorId:'a',property:'p',keyframes:[{timeMs:100}]}]}};
 const t=timingFidelity([{actorId:'a',property:'p',timeMs:150},{actorId:'a',property:'q',timeMs:0}],proto,50);
 assert.deepEqual([t.withinTolerance,t.total],[1,2]);
});

test('failed pipeline stage is a failure with no downstream metric',async()=>{
 const r=evaluate({reference:{id:'x',kind:'site'},stages:{extract:await stage(()=>{throw new Error('boom');}),draft:{ok:false,error:'skipped'}},truth:{concepts:['a'],instants:[],transitions:[]}});
 assert.equal(r.failed,true);assert.equal(r.failedStage,'extract');assert.equal(r.error,'boom');
 assert.equal(r.concepts,null);assert.equal(r.timing,null);
 assert.match(renderReport([r]),/FAILED at extract: boom/);
});

test('report: missing sessions/truth reported as missing, no unmeasured number',async()=>{
 const p=pack(),d=buildDrafts(p,{projectId:'scorpio'});
 const r=evaluate({reference:{id:'scorpio',kind:'video'},stages:{extract:{ok:true,value:{pack:p}},draft:{ok:true,value:d}}});
 const md=renderReport([r]);
 assert.match(md,/MISSING/);assert.match(md,/human session not provided/);assert.match(md,/ground truth not provided/);
 const row=md.split('\n').find(l=>l.startsWith('| scorpio'));
 assert.deepEqual([...row.matchAll(/\d+/g)].map(m=>m[0]),[String(d.report.blocking.length)]);
});

test('eval code creates no approval or lock and adds no raw JSON.parse',()=>{
 for(const f of ['metrics','report','run']){
  const s=readFileSync(`eval/import/${f}.mjs`,'utf8');
  assert.doesNotMatch(s,/approvals\s*:|lifecycle\s*:\s*['"]locked|JSON\.parse/);
 }
});
