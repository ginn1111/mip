import {evaluate} from '../../packages/prototype/index.mjs';
import {nearestFrame} from './align.mjs';
const $=id=>document.getElementById(id);
let view,timeMs=0;
const call=async(method,path,body)=>{
 const r=await fetch(path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+$('token').value},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j;
};
const show=(m,t='')=>{$('status').textContent=m;$('status').className='status '+t;};
const text=(tag,s,cls)=>{const e=document.createElement(tag);e.textContent=s;if(cls)e.className=cls;return e;};

function render(){
 const t=Math.round(timeMs);$('time').value=t+' ms';$('timeline').value=String(t);
 const near=nearestFrame(view.frames,t);
 $('frame-time').textContent=near?near.frame.timeMs:'–';$('offset').textContent=near?near.offsetMs:'–';$('preview-time').textContent=t;
 const f=$('frame');f.replaceChildren(...(near?[text('div',near.frame.uri,'mono'),text('div','observation '+near.frame.observationId),text('div',(near.offsetMs===0?'exact frame':'nearest frame, '+near.offsetMs+' ms from this instant'))]:[text('div','No frames')]));
 const state=evaluate(view.spec,view.spec.scenarios[0].id,t),p=$('preview');
 p.replaceChildren(...Object.entries(state.actors).flatMap(([a,props])=>Object.entries(props).map(([k,v])=>text('div',`${a}.${k} = ${JSON.stringify(v)}`,'mono'))));
}
function items(){
 const list=$('items');list.replaceChildren();
 for(const k of view.keyframes){
  const li=document.createElement('li');li.className='item';li.dataset.observation=k.observationId;li.dataset.decision=view.decisions[k.observationId]??'pending';
  const value=document.createElement('input'),at=document.createElement('input');
  value.type=at.type='text';value.value=[k.value].flat().join(',');at.value=String(k.timeMs);
  value.setAttribute('aria-label','Value of '+k.observationId);at.setAttribute('aria-label','Time of '+k.observationId);
  const btn=(label,cls,fn)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.disabled=view.locked;b.addEventListener('click',()=>guarded(fn));return b;};
  const row=document.createElement('div');row.className='row';
  row.append(value,at,btn('Accept','accept',()=>decide(k,'accepted')),btn('Reject','reject',()=>decide(k,'rejected')),
   btn('Save edit','edit',async()=>{
    const n=value.value.split(',').map(Number),v=Array.isArray(k.value)?n:n[0];
    const {ref}=await call('POST','/api/edit',{prototypeRef:view.ref,observationId:k.observationId,value:v,timeMs:Number(at.value)});
    await load();show(`Edit saved as revision ${ref.revision}. Decide it again.`,'success');}));
  li.append(text('strong',`${k.actorId}.${k.property}`),text('span',` @ ${k.timeMs} ms · ${k.observationId} · ${li.dataset.decision}`,'muted'),row);
  list.append(li);
 }
 $('mode').value=view.mode??'';$('mode').disabled=view.locked;
 $('approve').disabled=view.locked||!view.mode||!view.keyframes.every(k=>view.decisions[k.observationId]==='accepted');
}
async function decide(k,decision){await call('PUT','/api/decision',{prototypeRef:view.ref,observationId:k.observationId,decision});await load();show(`${k.observationId} ${decision}.`,'success');}
async function guarded(fn){try{await fn();}catch(e){show(e.message,'error');}}
async function load(){
 const r=await fetch('/api/alignment');if(!r.ok)throw new Error('Alignment evidence unavailable');
 view=await r.json();
 $('prototype-ref').textContent=`${view.ref.id}@${view.ref.revision} · ${view.ref.digest}`;
 $('timeline').max=String(view.spec.durationMs);timeMs=Math.min(timeMs,view.spec.durationMs);
 items();render();
}
$('timeline').addEventListener('input',e=>{timeMs=Number(e.target.value);render();});
$('mode').addEventListener('change',e=>guarded(async()=>{await call('PUT','/api/mode',{prototypeRef:view.ref,mode:e.target.value});await load();show('Mode '+e.target.value+' recorded.','success');}));
$('approve').addEventListener('click',()=>guarded(async()=>{
 $('approve').disabled=true;show('Saving review and locking exact digest…');
 const scenarioReviews=view.spec.scenarios.map(s=>({scenarioId:s.id,accepted:true,segmentReviews:view.spec.reviewSegments.filter(g=>g.scenarioIds.includes(s.id)).map(g=>({segmentId:g.id,accepted:true,comments:[]}))}));
 const q=new URLSearchParams({id:view.ref.id,revision:String(view.ref.revision),digest:view.ref.digest});
 const {draft}=await call('GET','/api/draft?'+q);
 await call('PUT','/api/draft',{prototypeRef:view.ref,status:'draft',scenarioReviews,baseSavedAt:draft?.savedAt??null});
 const result=await call('POST','/api/reviews',{prototypeRef:view.ref,decision:'approved'});
 await load();show(`Locked ${result.prototype.id}@${result.prototype.revision} and ${result.review.id}@${result.review.revision}.`,'success');
}));
load().catch(e=>show(e.message,'error'));
