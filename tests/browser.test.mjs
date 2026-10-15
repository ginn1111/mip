// Real-browser test of the Scorpio reviewer, using the shared headless-Chrome/CDP harness.
// Skips when no Chrome is installed; set CHROME_BIN to point at a specific binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {findChrome,withReviewer} from './browser-harness.mjs';

const chrome=findChrome();
const ALL=['anticipation','rotation','constellation'];
const ready=b=>b.waitFor('document.querySelectorAll("#segments li").length===3&&!document.getElementById("save").disabled','segments rendered');
const comment=async(b,ms,text)=>{await b.scrub(ms);await b.type('#comment',text);await b.click('#add-comment');};

test('browser: page boots with no errors, shows the exact digest and every segment',{skip:!chrome&&'no Chrome installed',timeout:60000},()=>withReviewer(async({browser:b,url})=>{
 await b.goto(url);await ready(b);
 assert.match(await b.text('#prototype-ref'),/^scorpio-prototype@1 · sha256:[a-f0-9]{64}$/);
 assert.deepEqual(await b.evaluate('[...document.querySelectorAll("#segments label")].map(l=>l.textContent)'),
  ['anticipation (0–800 ms)','rotation (800–3600 ms)','constellation (3600–4500 ms)']);
 assert.equal(await b.evaluate('document.getElementById("approve").disabled'),true,'nothing reviewed yet');
 const before=await b.evaluate('document.getElementById("preview").toDataURL()');
 await b.scrub(3000);await b.waitFor('document.getElementById("time").value==="3000 ms"','scrub');
 assert.notEqual(await b.evaluate('document.getElementById("preview").toDataURL()'),before,'canvas must repaint when scrubbed');
 assert.deepEqual([b.problems,b.failedAssets],[[],[]],'no script errors or failed assets');
}));

test('browser: comments are scoped, saved as a draft, restored after reload, then approved and locked',{skip:!chrome&&'no Chrome installed',timeout:90000},()=>withReviewer(async({browser:b,url,directory})=>{
 await b.goto(url);await ready(b);
 await b.type('#token','session-token');
 await comment(b,1500,'rotation feels magnetic');
 await comment(b,200,'ease in is abrupt');
 await b.type('#comment','');await b.click('#add-comment');
 assert.match(await b.text('#status'),/Write a comment first/,'empty comments are refused');
 const shown=await b.evaluate('[...document.querySelectorAll(".segment")].map(s=>({seg:s.querySelector("label").textContent.split(" ")[0],comments:[...s.querySelectorAll(".comments li")].map(li=>li.querySelector(".at").textContent+" "+li.querySelector(".text").textContent)}))');
 assert.deepEqual(shown,[{seg:'anticipation',comments:['200 ms ease in is abrupt']},{seg:'rotation',comments:['1500 ms rotation feels magnetic']},{seg:'constellation',comments:[]}]);
 await b.click('#save');await b.waitFor('/Draft saved/.test(document.getElementById("status").textContent)','draft saved');
 assert.equal(JSON.parse(await readFile(join(directory,'scorpio-prototype','1.draft.json'),'utf8')).status,'draft');
 assert.equal(await b.evaluate('document.getElementById("approve").disabled'),true,'saving a draft is not approval');

 await b.goto(url);await ready(b);await b.type('#token','session-token');
 assert.equal(await b.evaluate('document.querySelectorAll(".comments li").length'),0,'fresh page starts empty');
 await b.click('#load-draft');await b.waitFor('/Loaded draft/.test(document.getElementById("status").textContent)','draft loaded');
 assert.equal(await b.text('.segment:nth-child(1) .comments .at'),'200 ms');
 assert.equal(await b.text('.segment:nth-child(2) .comments .text'),'rotation feels magnetic');

 assert.equal(await b.evaluate('document.getElementById("approve").disabled'),true,'approve stays disabled with unreviewed segments');
 for(const id of ALL){await b.tick('#segment-'+id);}
 await b.waitFor('!document.getElementById("approve").disabled','approve enabled once all segments accepted');
 await b.click('#approve');
 await b.waitFor('/Locked scorpio-prototype@1/.test(document.getElementById("status").textContent)','locked');
 assert.equal(await b.evaluate('document.getElementById("status").className'),'status success');
 for(const sel of ['#save','#approve','#request-changes','#add-comment'])assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(sel)}).disabled`),true,sel+' disabled after lock');
 const review=JSON.parse(await readFile(join(directory,'scorpio-prototype-review','1.json'),'utf8'));
 assert.deepEqual(review.payload.reviewer,{id:'designer-1',role:'human'});
 const byId=Object.fromEntries(review.payload.scenarioReviews[0].segmentReviews.map(s=>[s.segmentId,s]));
 assert.deepEqual(byId.anticipation.comments,[{timeMs:200,text:'ease in is abrupt'}]);
 assert.deepEqual(byId.rotation.comments,[{timeMs:1500,text:'rotation feels magnetic'}]);
 assert.deepEqual([b.problems,b.failedAssets],[[],[]]);
}));

test('browser: wrong token is refused and request-changes blocks approval',{skip:!chrome&&'no Chrome installed',timeout:60000},()=>withReviewer(async({browser:b,url,directory})=>{
 await b.goto(url);await ready(b);
 await b.type('#token','nope');
 await b.click('#save');await b.waitFor('/Verified human identity required/.test(document.getElementById("status").textContent)','save refused');
 assert.equal(await b.evaluate('document.getElementById("status").className'),'status error');
 await b.type('#token','session-token');
 await b.click('#request-changes');await b.waitFor('/Add at least one comment/.test(document.getElementById("status").textContent)','needs a comment');
 await comment(b,1000,'too slow here');
 await b.click('#request-changes');await b.waitFor('/Changes requested and saved/.test(document.getElementById("status").textContent)','changes requested');
 assert.equal(JSON.parse(await readFile(join(directory,'scorpio-prototype','1.draft.json'),'utf8')).status,'changes_requested');
 await b.goto(url);await ready(b);await b.type('#token','session-token');
 await b.click('#load-draft');await b.waitFor('/changes were requested/.test(document.getElementById("status").textContent)','loaded changes_requested draft');
 for(const id of ALL)await b.tick('#segment-'+id);
 await b.waitFor('!document.getElementById("approve").disabled','approve enabled in UI');
 await b.click('#approve');
 await b.waitFor('/Locked scorpio-prototype@1/.test(document.getElementById("status").textContent)','a fresh saved draft supersedes the change request');
}));

test('browser: a fresh page cannot overwrite a saved draft it has not loaded',{skip:!chrome&&'no Chrome installed',timeout:90000},()=>withReviewer(async({browser:b,url,directory})=>{
 await b.goto(url);await ready(b);await b.type('#token','session-token');
 await comment(b,1500,'keep this note');
 await b.click('#save');await b.waitFor('/Draft saved/.test(document.getElementById("status").textContent)','draft saved');
 const path=join(directory,'scorpio-prototype','1.draft.json'),before=await readFile(path,'utf8');

 await b.goto(url);await ready(b);await b.type('#token','session-token');
 await b.click('#save');
 await b.waitFor('/use "Load saved draft" first/.test(document.getElementById("status").textContent)','overwrite refused');
 assert.equal(await b.evaluate('document.getElementById("status").className'),'status error');
 assert.equal(await readFile(path,'utf8'),before,'the saved draft is untouched');

 await b.click('#load-draft');await b.waitFor('/Loaded draft/.test(document.getElementById("status").textContent)','loaded');
 await comment(b,200,'second note');
 await b.click('#save');await b.waitFor('/Draft saved/.test(document.getElementById("status").textContent)','saved after load');
 const saved=JSON.parse(await readFile(path,'utf8')).scenarioReviews[0].segmentReviews;
 assert.deepEqual(saved.flatMap(s=>s.comments.map(c=>c.text)).sort(),['keep this note','second note']);
 assert.deepEqual([b.problems,b.failedAssets.filter(f=>!/\/api\//.test(f))],[[],[]]);
}));
