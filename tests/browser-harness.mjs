// Shared real-browser harness: headless Chrome driven over CDP with Node's built-in WebSocket.
// Every failure path stops Chrome and the reviewer server, so a slow or broken browser can fail a test but never hang the runner.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewerServer} from '../examples/scorpio/serve.mjs';

export const findChrome=()=>[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean)
 .find(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,what,ms=8000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){try{last=await fn();if(last)return last;}catch(e){last=e;}await sleep(50);}
 throw new Error('Timed out waiting for '+what+(last instanceof Error?': '+last.message:''));
}

/** SIGTERM, wait for exit, then SIGKILL. Resolves once the process is really gone. */
export async function stopProcess(proc,graceMs=2000){
 if(proc.exitCode!==null||proc.signalCode!==null)return;
 const exited=new Promise(r=>proc.once('exit',r));
 proc.kill('SIGTERM');
 if(await Promise.race([exited.then(()=>true),sleep(graceMs).then(()=>false)]))return;
 proc.kill('SIGKILL');await exited;
}

// First Chrome launch on a cold CI runner is slow; default is generous, tests can lower it.
export async function launch({chromeBin=findChrome(),startTimeoutMs=Number(process.env.CHROME_START_TIMEOUT_MS)||45000}={}){
 if(!chromeBin)throw new Error('No Chrome available');
 const profile=await mkdtemp(join(tmpdir(),'mip-chrome-'));
 const proc=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws;
 const cleanup=async()=>{try{ws?.close();}catch{}await stopProcess(proc);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});};
 try{
  const port=Number(await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8').then(t=>t.split('\n')[0]),'DevToolsActivePort',startTimeoutMs));
  const page=await until(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok&&r.json();},'a page target',startTimeoutMs);
  ws=new WebSocket(page.webSocketDebuggerUrl);
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
  return {
   problems,failedAssets,evaluate,pid:proc.pid,
   async goto(url){await send('Page.navigate',{url});await until(()=>evaluate('document.readyState==="complete"'),'page load',15000);},
   waitFor:(expr,what)=>until(()=>evaluate(expr),what,15000),
   click:sel=>evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`),
   type:(sel,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`),
   scrub:ms=>evaluate(`(()=>{const t=document.getElementById('timeline');t.value='${ms}';t.dispatchEvent(new Event('input',{bubbles:true}));})()`),
   tick:(sel,on=true)=>evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(sel)});if(c.checked!==${on})c.click();})()`),
   text:sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent??null`),
   close:cleanup,
  };
 }catch(error){await cleanup();throw error;}
}

/** Starts a reviewer server and a browser; always tears both down, whichever step fails. */
export async function withReviewer(fn){
 const directory=await mkdtemp(join(tmpdir(),'mip-browser-'));
 const server=await createReviewerServer({directory,approvalSecret:'secret',reviewToken:'session-token',reviewerId:'designer-1'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await launch();
  await fn({browser,directory,url:'http://127.0.0.1:'+server.address().port+'/'});
 }finally{
  if(browser)await browser.close();
  server.closeAllConnections?.();
  await new Promise(r=>server.close(r));
  await rm(directory,{recursive:true,force:true});
 }
}
