import {scorpio} from './review.mjs';
import {reviewFrame,createReviewComment} from '../../packages/prototype/review.mjs';
const $=id=>document.getElementById(id);
const ctx=$('preview').getContext('2d');
let scenario=scorpio.scenarios[0].id, timeMs=0,playing=false,lastTimestamp=null;
const comments=[];
for(const option of scorpio.scenarios){const el=document.createElement('option');el.value=option.id;el.textContent=option.id;$('scenario').append(el);}
function render(){
 const frame=reviewFrame(scorpio,scenario,timeMs),w=720,h=405;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#080f24';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(300,206);ctx.rotate(frame.snapshot.actors.globe.rotation);
 ctx.strokeStyle='#629cc7';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,108,0,Math.PI*2);ctx.stroke();
 for(let latitude=-2;latitude<=2;latitude++){ctx.beginPath();ctx.ellipse(0,0,Math.cos(latitude*.28)*108,108*Math.abs(Math.sin(latitude*.28))+.5,0,0,Math.PI*2);ctx.stroke();}
 ctx.beginPath();ctx.ellipse(0,0,108,38,Math.PI/2,0,Math.PI*2);ctx.stroke();ctx.restore();
 const opacity=frame.snapshot.actors.stars.opacity;
 ctx.globalAlpha=opacity;ctx.strokeStyle='#e6bcfb';ctx.lineWidth=2;
 const stars=[[370,100],[422,130],[466,176],[440,227],[481,263],[512,239]];
 ctx.beginPath();stars.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
 ctx.fillStyle='#f8d7ff';for(const [x,y] of stars){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 $('time').value=timeMs+' ms';$('timeline').value=String(timeMs);$('caption').textContent=frame.storyboard?.caption??'Scene';
 $('state').textContent='State: '+frame.snapshot.state;
 $('transition').textContent='Transitions: '+(frame.activeTransitions.map(t=>t.id).join(', ')||'none');
 for(const btn of $('frames').querySelectorAll('button'))btn.setAttribute('aria-current',String(Number(btn.dataset.time)===frame.storyboard?.timeMs));
}
for(const point of scorpio.storyboard){const b=document.createElement('button');b.type='button';b.textContent=point.timeMs+'ms';b.dataset.time=String(point.timeMs);b.title=point.caption;b.addEventListener('click',()=>{timeMs=point.timeMs;render();});$('frames').append(b);}
$('scenario').addEventListener('change',e=>{scenario=e.target.value;render();});
$('timeline').addEventListener('input',e=>{timeMs=Number(e.target.value);render();});
$('play').addEventListener('click',()=>{playing=true;lastTimestamp=null;});
$('pause').addEventListener('click',()=>{playing=false;});
$('add').addEventListener('click',()=>{
 try{
 const review=createReviewComment({spec:scorpio,scenarioId:scenario,timeMs,authorId:$('author').value,text:$('comment').value});
 comments.push(review);const li=document.createElement('li');li.textContent=review.timeMs+'ms — '+review.authorId+': '+review.text;
 $('comments').append(li);$('comment').value='';
 }catch(error){alert(error.message);}
});
function tick(timestamp){if(playing){if(lastTimestamp!==null)timeMs=Math.min(scorpio.durationMs,timeMs+timestamp-lastTimestamp);lastTimestamp=timestamp;if(timeMs===scorpio.durationMs)playing=false;render();}requestAnimationFrame(tick);}
render();requestAnimationFrame(tick);
