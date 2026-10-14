import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewerServer} from '../examples/scorpio/serve.mjs';

const reviews=[{scenarioId:'select-scorpio',accepted:true,segmentReviews:[
 {segmentId:'anticipation',accepted:true,comments:[]},
 {segmentId:'rotation',accepted:true,comments:['Motion approved']},
 {segmentId:'constellation',accepted:true,comments:[]},
]}];

async function withServer(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-reviewer-'));
 const server=await createReviewerServer({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await fn({base:'http://127.0.0.1:'+server.address().port,directory});}
 finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
}

test('Scorpio reviewer serves UI and exact prototype reference',()=>withServer(async({base})=>{
 const page=await fetch(base+'/');
 assert.equal(page.status,200);
 assert.match(await page.text(),/Scorpio Motion Review/);
 const prototype=await (await fetch(base+'/api/prototype')).json();
 assert.equal(prototype.ref.id,'scorpio-prototype');
 assert.match(prototype.ref.digest,/^sha256:[a-f0-9]{64}$/);
 assert.deepEqual(prototype.reviewSegments.map(x=>x.id),['anticipation','rotation','constellation']);
}));

test('review API rejects unauthorized, stale and incomplete approval',()=>withServer(async({base})=>{
 const prototype=await (await fetch(base+'/api/prototype')).json();
 const unauthorized=await fetch(base+'/api/reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prototypeRef:prototype.ref,decision:'approved',scenarioReviews:reviews})});
 assert.equal(unauthorized.status,401);
 const stale=await fetch(base+'/api/reviews',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer session-token'},body:JSON.stringify({prototypeRef:{...prototype.ref,digest:'sha256:'+'0'.repeat(64)},decision:'approved',scenarioReviews:reviews})});
 assert.equal(stale.status,400);
 assert.match((await stale.json()).error,/Stale prototype/);
 const incomplete=await fetch(base+'/api/reviews',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer session-token'},body:JSON.stringify({prototypeRef:prototype.ref,decision:'approved',scenarioReviews:[{...reviews[0],segmentReviews:reviews[0].segmentReviews.slice(0,1)}]})});
 assert.equal(incomplete.status,400);
 assert.match((await incomplete.json()).error,/Incomplete prototype review/);
}));

test('review API persists host-verified creative locks',()=>withServer(async({base,directory})=>{
 const prototype=await (await fetch(base+'/api/prototype')).json();
 const response=await fetch(base+'/api/reviews',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer session-token'},body:JSON.stringify({prototypeRef:prototype.ref,decision:'approved',scenarioReviews:reviews})});
 assert.equal(response.status,201);
 const result=await response.json();
 assert.equal(result.prototype.lifecycle,'locked');
 assert.equal(result.review.lifecycle,'locked');
 assert.deepEqual(result.review.payload.reviewer,{id:'designer-1',role:'human'});
 assert.equal(result.review.payload.prototypeRef.digest,result.prototype.lock.digest);
 const persisted=await import('node:fs/promises').then(fs=>fs.readFile(join(directory,'scorpio-prototype-review','1.json'),'utf8'));
 assert.equal(JSON.parse(persisted).payload.scenarioReviews[0].segmentReviews.length,3);
}));
