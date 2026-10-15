import {scorpio} from './review.mjs';
import {reviewFrame} from '../../packages/prototype/review.mjs';
const $=id=>document.getElementById(id),ctx=$('preview').getContext('2d');
let scenario=scorpio.scenarios[0].id,timeMs=0,playing=false,lastTimestamp=null,prototype;
const decisions=new Map();
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
 $('time').value=Math.round(timeMs)+' ms';$('timeline').value=String(Math.round(timeMs));$('caption').textContent=frame.storyboard?.caption??'Scene';
 $('state').textContent='State: '+frame.snapshot.state;$('transition').textContent='Transitions: '+(frame.activeTransitions.map(t=>t.id).join(', ')||'none');
 for(const btn of $('frames').querySelectorAll('button'))btn.setAttribute('aria-current',String(Number(btn.dataset.time)===frame.storyboard?.timeMs));
}
for(const point of scorpio.storyboard){const b=document.createElement('button');b.type='button';b.textContent=point.timeMs+'ms';b.dataset.time=String(point.timeMs);b.title=point.caption;b.addEventListener('click',()=>{timeMs=point.timeMs;render();});$('frames').append(b);}
function show(message,type=''){$('status').textContent=message;$('status').className='status '+type;}
function ready(){$('approve').disabled=decisions.size!==prototype?.reviewSegments.length||[...decisions.values()].some(x=>!x.accepted);}
async function load(){
 const response=await fetch('/api/prototype');if(!response.ok)throw new Error('Prototype evidence unavailable');prototype=await response.json();
 $('prototype-ref').textContent=`${prototype.ref.id}@${prototype.ref.revision} · ${prototype.ref.digest}`;
 for(const segment of prototype.reviewSegments){
  const li=document.createElement('li');li.className='segment';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='segment-'+segment.id;
  const label=document.createElement('label');label.htmlFor=checkbox.id;label.textContent=`${segment.id} (${segment.startMs}–${segment.endMs} ms)`;
  const notes=document.createElement('textarea');notes.placeholder='Optional review notes';
  checkbox.addEventListener('change',()=>{decisions.set(segment.id,{segmentId:segment.id,accepted:checkbox.checked,comments:notes.value.trim()?[notes.value.trim()]:[]});ready();});
  notes.addEventListener('input',()=>{if(decisions.has(segment.id))decisions.get(segment.id).comments=notes.value.trim()?[notes.value.trim()]:[];});
  li.append(checkbox,label,notes);$('segments').append(li);
 }
 show('Review all required segments.');
}
$('scenario').addEventListener('change',e=>{scenario=e.target.value;render();});$('timeline').addEventListener('input',e=>{timeMs=Number(e.target.value);render();});
$('play').addEventListener('click',()=>{playing=true;lastTimestamp=null;});$('pause').addEventListener('click',()=>{playing=false;});
$('approve').addEventListener('click',async()=>{
 try{
  $('approve').disabled=true;show('Persisting review and locking exact digest…');
  const response=await fetch('/api/reviews',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+$('token').value},
   body:JSON.stringify({prototypeRef:prototype.ref,decision:'approved',scenarioReviews:[{scenarioId:scenario,accepted:true,segmentReviews:[...decisions.values()]}]})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Approval failed');
  show(`Locked ${result.prototype.id}@${result.prototype.revision} and ${result.review.id}@${result.review.revision}.`,'success');
 }catch(error){show(error.message,'error');ready();}
});
function tick(timestamp){if(playing){if(lastTimestamp!==null)timeMs=Math.min(scorpio.durationMs,timeMs+timestamp-lastTimestamp);lastTimestamp=timestamp;if(timeMs===scorpio.durationMs)playing=false;render();}requestAnimationFrame(tick);}
render();requestAnimationFrame(tick);load().catch(error=>show(error.message,'error'));