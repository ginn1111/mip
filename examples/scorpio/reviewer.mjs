import {scorpio} from './review.mjs';
import {reviewFrame} from '../../packages/prototype/review.mjs';
const $=id=>document.getElementById(id),ctx=$('preview').getContext('2d');
let scenario=scorpio.scenarios[0].id,timeMs=0,playing=false,lastTimestamp=null,prototype,locked=false,baseSavedAt=null,draftLoaded=false;
const state=new Map(); // `${scenarioId}/${segmentId}` -> {accepted, comments:[{timeMs,text}]}
const key=(s,g)=>s+'/'+g;
const segmentsOf=s=>prototype.reviewSegments.filter(x=>x.scenarioIds.includes(s));
const entry=(s,g)=>{if(!state.has(key(s,g)))state.set(key(s,g),{accepted:false,comments:[]});return state.get(key(s,g));};
for(const option of scorpio.scenarios){const el=document.createElement('option');el.value=option.id;el.textContent=option.id;$('scenario').append(el);}

function render(){
 const frame=reviewFrame(scorpio,scenario,timeMs),w=720,h=405;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#181715';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(300,206);ctx.rotate(frame.snapshot.actors.globe.rotation);
 ctx.strokeStyle='#cc785c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,108,0,Math.PI*2);ctx.stroke();
 for(let latitude=-2;latitude<=2;latitude++){ctx.beginPath();ctx.ellipse(0,0,Math.cos(latitude*.28)*108,108*Math.abs(Math.sin(latitude*.28))+.5,0,0,Math.PI*2);ctx.stroke();}
 ctx.beginPath();ctx.ellipse(0,0,108,38,Math.PI/2,0,Math.PI*2);ctx.stroke();ctx.restore();
 ctx.globalAlpha=frame.snapshot.actors.stars.opacity;ctx.strokeStyle='#faf9f5';ctx.lineWidth=2;
 const stars=[[370,100],[422,130],[466,176],[440,227],[481,263],[512,239]];
 ctx.beginPath();stars.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
 ctx.fillStyle='#faf9f5';for(const [x,y] of stars){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 const ms=Math.round(timeMs);
 $('time').value=ms+' ms';$('comment-time').textContent=ms+' ms';$('timeline').value=String(ms);$('caption').textContent=frame.storyboard?.caption??'Scene';
 $('state').textContent='State: '+frame.snapshot.state;$('transition').textContent='Transitions: '+(frame.activeTransitions.map(t=>t.id).join(', ')||'none');
 for(const btn of $('frames').querySelectorAll('button'))btn.setAttribute('aria-current',String(Number(btn.dataset.time)===frame.storyboard?.timeMs));
}
for(const point of scorpio.storyboard){const b=document.createElement('button');b.type='button';b.textContent=point.timeMs+'ms';b.dataset.time=String(point.timeMs);b.title=point.caption;b.addEventListener('click',()=>{timeMs=point.timeMs;render();});$('frames').append(b);}

function show(message,type=''){$('status').textContent=message;$('status').className='status '+type;}
const allSegments=()=>prototype.scenarios.flatMap(s=>segmentsOf(s).map(g=>[s,g.id]));
const allAccepted=()=>allSegments().every(([s,g])=>entry(s,g).accepted);
const totalComments=()=>allSegments().reduce((n,[s,g])=>n+entry(s,g).comments.length,0);
function refresh(){
 const list=$('segments');list.replaceChildren();
 for(const segment of segmentsOf(scenario)){
  const e=entry(scenario,segment.id),li=document.createElement('li');li.className='segment';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='segment-'+segment.id;checkbox.checked=e.accepted;checkbox.disabled=locked;
  checkbox.addEventListener('change',()=>{e.accepted=checkbox.checked;refresh();});
  const label=document.createElement('label');label.htmlFor=checkbox.id;label.textContent=`${segment.id} (${segment.startMs}–${segment.endMs} ms)`;
  const comments=document.createElement('ul');comments.className='comments';
  for(const [i,c] of e.comments.entries()){
   const item=document.createElement('li'),at=document.createElement('span'),text=document.createElement('span'),remove=document.createElement('button');
   at.className='at';at.textContent=c.timeMs+' ms';text.className='text';text.textContent=c.text;
   remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove comment at ${c.timeMs} ms`);remove.disabled=locked;
   remove.addEventListener('click',()=>{e.comments.splice(i,1);refresh();});
   item.append(at,text,remove);comments.append(item);
  }
  li.append(checkbox,label,comments);list.append(li);
 }
 $('approve').disabled=locked||!prototype||!allAccepted();
 for(const id of ['save','request-changes','add-comment','load-draft'])$(id).disabled=locked||!prototype;
}

const scenarioReviews=()=>prototype.scenarios.map(s=>({scenarioId:s,accepted:segmentsOf(s).every(g=>entry(s,g.id).accepted),
 segmentReviews:segmentsOf(s).map(g=>({segmentId:g.id,accepted:entry(s,g.id).accepted,comments:entry(s,g.id).comments.map(c=>({timeMs:c.timeMs,text:c.text}))}))}));
async function call(method,path,body){
 const response=await fetch(path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+$('token').value},body:body===undefined?undefined:JSON.stringify(body)});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(json.error||'Request failed');
 return json;
}
const query=()=>new URLSearchParams({id:prototype.ref.id,revision:String(prototype.ref.revision),digest:prototype.ref.digest});
async function fetchDraft(){const {draft}=await call('GET','/api/draft?'+query());baseSavedAt=draft?.savedAt??null;draftLoaded=true;return draft;}
async function saveDraft(status){
 if(!draftLoaded)await fetchDraft().then(d=>{if(d)throw new Error('A saved draft exists: use "Load saved draft" first so it is not overwritten.');});
 const {draft}=await call('PUT','/api/draft',{prototypeRef:prototype.ref,status,scenarioReviews:scenarioReviews(),baseSavedAt});
 baseSavedAt=draft.savedAt;return {draft};
}
const when=d=>new Date(d.savedAt).toLocaleTimeString();
function applyDraft(draft){
 for(const sr of draft.scenarioReviews)for(const seg of sr.segmentReviews){
  const e=entry(sr.scenarioId,seg.segmentId);e.accepted=seg.accepted;e.comments=seg.comments.map(c=>({timeMs:c.timeMs,text:c.text}));
 }
}
async function guarded(work){
 try{await work();}catch(error){show(error.message,'error');}finally{refresh();}
}

async function load(){
 const response=await fetch('/api/prototype');if(!response.ok)throw new Error('Prototype evidence unavailable');prototype=await response.json();
 $('prototype-ref').textContent=`${prototype.ref.id}@${prototype.ref.revision} · ${prototype.ref.digest}`;
 refresh();show('Add comments, review every segment, then save or approve.');
}
$('load-draft').addEventListener('click',()=>guarded(async()=>{
 const draft=await fetchDraft();
 if(!draft){show('No saved draft yet.');return;}
 applyDraft(draft);
 show(draft.status==='changes_requested'?`Loaded draft saved ${when(draft)}: changes were requested. Approving saves it again as a draft.`:`Loaded draft saved ${when(draft)} by ${draft.reviewer.id}.`);
}));
$('add-comment').addEventListener('click',()=>{
 const text=$('comment').value.trim(),t=Math.round(timeMs),segments=segmentsOf(scenario);
 if(!text){show('Write a comment first.','error');return;}
 const segment=segments.find(s=>t>=s.startMs&&t<s.endMs)??segments.find(s=>t===s.endMs);
 if(!segment){show('No segment covers this instant.','error');return;}
 const e=entry(scenario,segment.id);e.comments.push({timeMs:t,text});e.comments.sort((a,b)=>a.timeMs-b.timeMs);
 $('comment').value='';refresh();show(`Comment added to ${segment.id} at ${t} ms. Save draft to keep it.`);
});
$('save').addEventListener('click',()=>guarded(async()=>{const {draft}=await saveDraft('draft');show(`Draft saved ${when(draft)}.`,'success');}));
$('request-changes').addEventListener('click',()=>guarded(async()=>{
 if(!totalComments()){show('Add at least one comment before requesting changes.','error');return;}
 const {draft}=await saveDraft('changes_requested');show(`Changes requested and saved ${when(draft)}. Approval stays blocked until you save a new draft.`,'success');
}));
$('approve').addEventListener('click',()=>guarded(async()=>{
 $('approve').disabled=true;show('Saving review and locking exact digest…');
 await saveDraft('draft');
 const result=await call('POST','/api/reviews',{prototypeRef:prototype.ref,decision:'approved'});
 locked=true;show(`Locked ${result.prototype.id}@${result.prototype.revision} and ${result.review.id}@${result.review.revision}.`,'success');
}));
$('scenario').addEventListener('change',e=>{scenario=e.target.value;render();if(prototype)refresh();});$('timeline').addEventListener('input',e=>{timeMs=Number(e.target.value);render();});
$('play').addEventListener('click',()=>{playing=true;lastTimestamp=null;});$('pause').addEventListener('click',()=>{playing=false;});
function tick(timestamp){if(playing){if(lastTimestamp!==null)timeMs=Math.min(scorpio.durationMs,timeMs+timestamp-lastTimestamp);lastTimestamp=timestamp;if(timeMs===scorpio.durationMs)playing=false;render();}requestAnimationFrame(tick);}
render();requestAnimationFrame(tick);load().catch(error=>show(error.message,'error'));
