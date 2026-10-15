// Real-browser test of the Scorpio reviewer. Drives headless Chrome over CDP (Node's built-in WebSocket).
// Skips when no Chrome is installed; set CHROME_BIN to point at a specific binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewerServer} from '../examples/scorpio/serve.mjs';

const CANDIDATES=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=CANDIDATES.find(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,what,ms=8000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){try{last=await fn();if(last)return last;}catch(e){last=e;}await sleep(50);}
 throw new Error('Timed out waiting for '+what+(last instanceof Error?': '+last.message:''));
}

async function launch(){
 const profile=await mkdtemp(join(tmpdir(),'mip-chrome-'));
 const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const port=Number((await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8').then(t=>t.split('\n')[0]),'DevToolsActivePort')));
 const page=await until(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok&&r.json();},'a page target');
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('CDP socket failed'));});
 let id=0;const pending=new Map(),problems=[],failedAssets=[];
 ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){const {res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);return;}
  if(m.method==='Runtime.exceptionThrown')problems.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')problems.push('console.error: '+m.params.args.map(a=>a.value??a.description).join(' '));
  if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&!/\/api\//.test(m.params.response.url))failedAssets.push(m.params.response.status+' '+m.params.response.url);
  if(m.method==='Network.loadingFailed')failedAssets.push('failed '+m.params.errorText);
 };
 const send=(method,params={})=>new Promise((res,rej)=>{const n=++id;pending.set(n,{res,rej});ws.send(JSON.stringify({id:n,method,params}));});
 for(const d of ['Page','Runtime','Network'])await send(d+'.enable');
 const evaluate=async expression=>{
  const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result.value;
 };
 const api={
  problems,failedAssets,evaluate,
  async goto(url){await send('Page.navigate',{url});await until(()=>evaluate('document.readyState==="complete"'),'page load');},
  waitFor:(expr,what)=>until(()=>evaluate(expr),what),
  click:sel=>evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`),
  type:(sel,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`),
  scrub:ms=>evaluate(`(()=>{const t=document.getElementById('timeline');t.value='${ms}';t.dispatchEvent(new Event('input',{bubbles:true}));})()`),
  tick:(sel,on=true)=>evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(sel)});if(c.checked!==${on})c.click();})()`),
  text:sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent??null`),
  async close(){try{ws.close();}catch{}proc.kill();await sleep(150);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});},
 };
 return api;
}

async function withReviewer(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-browser-'));
 const server=await createReviewerServer({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await launch();
 try{await fn({browser,directory,url:'http://127.0.0.1:'+server.address().port+'/'});}
 finally{await browser.close();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
}
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
