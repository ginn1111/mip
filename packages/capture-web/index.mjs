// AGE-36 live website motion capture (docs/specs/AGE-36.md B1-B5).
// Headless Chrome over CDP (same pattern as tests/browser-harness.mjs). Builds an AGE-34 evidence pack, source kind `website`.
// Never creates an approval or a lock; observations only. CDP easing is the element's declared CSS timing function, not original source.
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseStrictJson} from '../artifacts/index.mjs';

const LOCAL=new Set(['localhost','127.0.0.1']);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=buf=>'sha256:'+createHash('sha256').update(buf).digest('hex');
const STYLES=['opacity','transform','transition-property','transition-duration','transition-timing-function','animation-name','animation-duration','animation-timing-function'];

export class SourceRefused extends Error{constructor(url,reason){super(`Refused ${url}: ${reason}`);this.code='SOURCE_REFUSED';this.url=url;}}

/** B1: allowlist file is a JSON array of http(s) URLs; an entry covers its origin and path prefix. */
export async function loadAllowlist(file){
 const list=parseStrictJson(await readFile(file,'utf8'));
 if(!Array.isArray(list)||!list.every(u=>typeof u==='string'))throw new TypeError('Allowlist must be a JSON array of URL strings');
 return list.map(u=>new URL(u));
}

/** Pure; returns the permission note or throws SourceRefused. Runs before any request. */
export function authorize(url,allowlist=[]){
 let u;try{u=new URL(url);}catch{throw new SourceRefused(url,'not a valid URL');}
 if(u.protocol!=='http:'&&u.protocol!=='https:')throw new SourceRefused(url,'only http(s) allowed');
 if(LOCAL.has(u.hostname))return 'Authorized: localhost source.';
 if(allowlist.some(a=>a.origin===u.origin&&u.pathname.startsWith(a.pathname)))return 'Authorized: URL in human-provided allowlist file. Rights policy for external sites still undecided (AGE-36 spec).';
 throw new SourceRefused(url,'not localhost and not in allowlist');
}

export function validateScenario(s){
 const bad=m=>{throw new TypeError('Invalid scenario: '+m);};
 if(!s||typeof s!=='object')bad('object required');
 const {width,height}=s.viewport??{};
 if(!(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0))bad('viewport {width,height} positive integers');
 if(!Array.isArray(s.steps)||!s.steps.length)bad('steps required');
 for(const st of s.steps){
  if(st?.type==='navigate'){if(typeof st.url!=='string')bad('navigate needs url');}
  else if(st?.type==='click'||st?.type==='hover'){if(typeof st.selector!=='string')bad(st.type+' needs selector');}
  else if(st?.type==='wait'){if(!(Number.isInteger(st.ms)&&st.ms>=0))bad('wait needs integer ms');}
  else bad('unknown step '+JSON.stringify(st?.type));
 }
 if(s.steps[0].type!=='navigate')bad('first step must be navigate');
 for(const k of ['inspect']) if(s[k]!==undefined&&!(Array.isArray(s[k])&&s[k].every(x=>typeof x==='string')))bad(k+' must be string[]');
 return s;
}
export const loadScenario=async file=>validateScenario(parseStrictJson(await readFile(file,'utf8')));

export const findChrome=()=>[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean)
 .find(bin=>spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);

async function stop(proc){
 if(proc.exitCode!==null||proc.signalCode!==null)return;
 const exited=new Promise(r=>proc.once('exit',r));
 proc.kill('SIGTERM');
 if(await Promise.race([exited.then(()=>true),sleep(2000).then(()=>false)]))return;
 proc.kill('SIGKILL');await exited;
}
async function until(fn,what,ms){
 const end=Date.now()+ms;
 while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(50);}
 throw new Error('Timed out waiting for '+what);
}

async function launch({chromeBin,timeoutMs=45000,onEvent}){
 const profile=await mkdtemp(join(tmpdir(),'mip-capture-'));
 const proc=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let ws;
 const close=async()=>{try{ws?.close();}catch{}await stop(proc);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});};
 try{
  const port=Number(await until(()=>readFile(join(profile,'DevToolsActivePort'),'utf8').then(t=>t.split('\n')[0]),'DevToolsActivePort',timeoutMs));
  const page=await until(async()=>{const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});return r.ok&&r.json();},'a page target',timeoutMs);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('CDP socket failed'));});
  let id=0;const pending=new Map();
  ws.onmessage=({data})=>{
   const m=JSON.parse(data);
   if(m.id&&pending.has(m.id)){const {res,rej}=pending.get(m.id);pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}
   else if(m.method)onEvent(m.method,m.params);
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const n=++id;pending.set(n,{res,rej});ws.send(JSON.stringify({id:n,method,params}));});
  return {send,close};
 }catch(e){await close();throw e;}
}

/**
 * Replays `scenario` against authorized sources and returns {pack, uncertainty, frames}.
 * Observation times are on the scenario's declared clock (sum of waits), so replays agree; pixels are evidence, not asserted identical.
 */
export async function captureWeb({scenario,allowlist=[],allowlistFile,intervalMs=200,chromeBin=findChrome(),now=()=>new Date()}){
 validateScenario(scenario);
 if(allowlistFile)allowlist=await loadAllowlist(allowlistFile);
 const notes=new Set();
 for(const st of scenario.steps)if(st.type==='navigate')notes.add(authorize(st.url,allowlist)); // B1: before Chrome starts
 if(!chromeBin)throw new Error('No Chrome available');

 const uncertainty=[],animations=new Map(),actors=new Map();
 let clock=0,send;
 const blocked=new Set();
 const onEvent=(method,p)=>{
  if(method==='Animation.animationStarted'&&!animations.has(p.animation.id))animations.set(p.animation.id,{animation:p.animation,at:clock});
  if(method==='Fetch.requestPaused'){
   let ok=true;
   try{authorize(p.request.url,allowlist);}catch{ok=false;}
   if(ok)send('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});
   else{blocked.add(p.request.url);send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}
  }
 };
 const browser=await launch({chromeBin,onEvent});
 ({send}=browser);
 const frames=[];let current='';
 try{
  const evaluate=async expression=>{
   const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
   return r.result.value;
  };
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
  const shot=async()=>{
   const {data}=await send('Page.captureScreenshot',{format:'png'});
   frames.push({name:`frames/frame-${String(frames.length).padStart(4,'0')}.png`,png:Buffer.from(data,'base64'),at:clock});
  };
  for(const d of ['Page','Runtime','DOM','Animation'])await send(d+'.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:scenario.viewport.width,height:scenario.viewport.height,deviceScaleFactor:1,mobile:false});
  const sel=s=>JSON.stringify(s);
  for(const st of scenario.steps){
   if(st.type==='navigate'){
    current=st.url;
    await send('Page.navigate',{url:st.url});
    await until(()=>evaluate('document.readyState==="complete"'),'page load',15000);
    await settle();
   }else if(st.type==='click'||st.type==='hover'){
    const box=await evaluate(`(()=>{const e=document.querySelector(${sel(st.selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(!box){uncertainty.push({code:'SELECTOR_NOT_FOUND',selector:st.selector,step:st.type});continue;}
    if(st.type==='click')await evaluate(`document.querySelector(${sel(st.selector)}).click()`);
    else await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y});
    await settle();
   }else{
    for(let t=0;t<st.ms;t+=intervalMs){await shot();await sleep(Math.min(intervalMs,st.ms-t));clock+=Math.min(intervalMs,st.ms-t);}
    await settle();
   }
  }
  await shot();
  const source=await evaluate('document.documentElement.outerHTML');
  const canvases=await evaluate('document.querySelectorAll("canvas").length');
  const styles=[];
  for(const selector of scenario.inspect??[]){
   const got=await evaluate(`(()=>{const e=document.querySelector(${sel(selector)});if(!e)return null;const c=getComputedStyle(e);return Object.fromEntries(${sel(scenario.styles??STYLES)}.map(p=>[p,c.getPropertyValue(p)]));})()`);
   if(!got)uncertainty.push({code:'SELECTOR_NOT_FOUND',selector,step:'inspect'});
   else styles.push([selector,got]);
  }

  // Resolve actors after the run; a node removed meanwhile stays unresolved and is reported.
  for(const {animation} of animations.values()){
   const n=animation.source?.backendNodeId;if(n===undefined||actors.has(n))continue;
   try{
    const {node}=await send('DOM.describeNode',{backendNodeId:n});
    const attrs=node.attributes??[];const at=k=>attrs[attrs.indexOf(k)+1];
    actors.set(n,at('id')?`${node.localName}#${at('id')}`:node.localName);
   }catch{actors.set(n,null);}
  }

  const sourceId='src-web',observations=[];
  const obs=(o)=>{observations.push({id:'obs-'+(observations.length+1),sourceId,evidenceRefs:[],...o});};
  const CSS_EVENT={CSSTransition:'transition',CSSAnimation:'animation',WebAnimation:'web-animation'};
  for(const {animation:a,at} of animations.values()){
   const s=a.source??{},actor=actors.get(s.backendNodeId)??null;
   if(!actor)uncertainty.push({code:'ACTOR_UNRESOLVED',animation:a.name,detail:'target node unreadable'});
   const finite=Number.isFinite(s.iterations);
   if(!finite)uncertainty.push({code:'ITERATIONS_UNREADABLE',animation:a.name,detail:'infinite or unreadable iteration count recorded as null'});
   if(!s.easing)uncertainty.push({code:'EASING_UNREADABLE',animation:a.name});
   obs({
    timeRangeMs:[Math.round(at),Math.round(at+(s.delay??0)+(s.duration??0))],actorId:actor??'unknown',
    event:CSS_EVENT[a.type]??'animation',property:a.name||'unknown',
    measuredValue:{durationMs:s.duration??null,delayMs:s.delay??null,easing:s.easing??null,iterations:finite?s.iterations:null,direction:s.direction??null,fill:s.fill??null},
    measurementMethod:'cdp-animation:declared-css-timing-function',confidence:s.easing?0.9:0.5,
   });
  }
  for(const [selector,got] of styles)for(const [prop,value] of Object.entries(got)){
   if(value===''){uncertainty.push({code:'STYLE_UNREADABLE',selector,property:prop});continue;}
   obs({timeRangeMs:[Math.round(clock),Math.round(clock)],actorId:selector,event:'computed-style',property:prop,measuredValue:value,measurementMethod:'getComputedStyle',confidence:1});
  }
  for(const f of frames)obs({
   timeRangeMs:[Math.round(f.at),Math.round(f.at)],actorId:'page',event:'screenshot',property:'pixels',measuredValue:f.name,
   measurementMethod:'screenshot',confidence:1,evidenceRefs:[{uri:f.name,digest:sha(f.png),mediaType:'image/png'}],
  });
  if(canvases)uncertainty.push({code:'CANVAS_INTERNALS_INACCESSIBLE',count:canvases,detail:'canvas/WebGL motion is not inspectable through DOM/CSS/CDP; screenshots are the only evidence'});
  for(const url of [...blocked].sort())uncertainty.push({code:'REQUEST_BLOCKED',url,detail:'subresource outside localhost/allowlist was blocked'});

  const pack={
   protocol:'mip/0.7',id:'web-capture-'+sha(JSON.stringify(scenario)).slice(7,19),
   sources:[{id:sourceId,kind:'website',uri:current,digest:sha(source),capturedAt:now().toISOString(),
    environment:{viewport:`${scenario.viewport.width}x${scenario.viewport.height}`,device:null,frameRate:1000/intervalMs},
    licenseOrPermissionNotes:[...notes].join(' ')}],
   observations,hypotheses:[],bindings:[],
  };
  return {pack,uncertainty,frames};
 }finally{await browser.close();}
}

/** Writes pack.json, uncertainty.json and frames/ under `dir`. */
export async function writeCapture(dir,{pack,uncertainty,frames}){
 await mkdir(join(dir,'frames'),{recursive:true});
 await writeFile(join(dir,'pack.json'),JSON.stringify(pack,null,2)+'\n');
 await writeFile(join(dir,'uncertainty.json'),JSON.stringify(uncertainty,null,2)+'\n');
 for(const f of frames)await writeFile(join(dir,f.name),f.png);
}
