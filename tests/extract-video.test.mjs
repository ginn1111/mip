// AGE-35: video/GIF/storyboard extractor (docs/specs/AGE-35.md B1-B5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {extractEvidence,assertNoEasingClaim} from '../packages/extract-video/index.mjs';
import {findChrome,withReviewer} from './browser-harness.mjs';

const has=bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0;
const skip=has('ffmpeg')&&has('ffprobe')?false:'no ffmpeg installed';
const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
const validate=ajv.compile(JSON.parse(readFileSync('schemas/v0.7/evidence-pack.schema.json','utf8')));
const ok=pack=>assert.equal(validate(pack),true,JSON.stringify(validate.errors));
// Moving white square via overlay (drawbox's `t` is thickness, not time). Static square when x is a number.
const MOVE='t*100';
const gen=(file,x,secs=2)=>{
 const r=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=black:s=320x240:r=30:d=${secs}`,'-f','lavfi','-i',`color=c=white:s=40x40:r=30:d=${secs}`,
  '-filter_complex',`[0][1]overlay=x='${x}':y=100`,'-pix_fmt','yuv420p',file]);
 assert.equal(r.status,0,String(r.stderr));
};
const tmp=async fn=>{const d=await mkdtemp(join(tmpdir(),'mip-video-'));try{return await fn(d);}finally{await rm(d,{recursive:true,force:true});}};
const run=(file,o)=>extractEvidence(file,{capturedAt:'2026-10-16T00:00:00Z',...o});

test('synthetic square moving left to right: motion along x, confidence < 1, no easing claim',{skip},()=>tmp(d=>{
 const f=join(d,'sq.mp4');gen(f,MOVE);
 const {pack,report}=run(f);
 ok(pack);
 const motion=pack.observations.filter(o=>o.measurementMethod==='centroid-track');
 assert.ok(motion.length>=1,'centroid-track observation');
 for(const m of motion){assert.equal(m.measuredValue.axis,'x');assert.equal(m.measuredValue.direction,'right');assert.ok(m.measuredValue.displacement.x>0);}
 assert.ok(pack.observations.every(o=>o.confidence>0&&o.confidence<1));
 assert.equal(report.easingClaims,0);assert.equal(report.approvals,0);
 assert.doesNotThrow(()=>assertNoEasingClaim(pack));
 assert.match(pack.sources[0].digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(pack.sources[0].kind,'video');
 assert.deepEqual(pack.bindings,[]);
}));

test('mutation: an observation that claims an easing curve is rejected',()=>{
 const base={observations:[{id:'o',measurementMethod:'centroid-track',measuredValue:{axis:'x'}}]};
 assert.doesNotThrow(()=>assertNoEasingClaim(base));
 assert.throws(()=>assertNoEasingClaim({observations:[{...base.observations[0],measuredValue:{easing:'cubic-bezier(0.4,0,0.2,1)'}}]}),/easing claim/);
 assert.throws(()=>assertNoEasingClaim({observations:[{...base.observations[0],event:'ease-in'}]}),/easing claim/);
});

test('duplicate frames give no motion',{skip},()=>tmp(d=>{
 const f=join(d,'still.mp4');gen(f,'100');
 const {pack}=run(f);ok(pack);
 assert.deepEqual(pack.observations.map(o=>o.event),['no-motion']);
 assert.equal(pack.observations.some(o=>o.measurementMethod==='centroid-track'),false);
}));

test('clip shorter than one sample interval gives one low-confidence observation',{skip},()=>tmp(d=>{
 const f=join(d,'short.mp4');gen(f,MOVE,0.05);
 const {pack}=run(f);ok(pack);
 assert.equal(pack.observations.length,1);
 assert.ok(pack.observations[0].confidence<=0.1);
 assert.equal(pack.observations[0].event,'insufficient-samples');
}));

test('GIF input is fingerprinted and typed gif',{skip},()=>tmp(d=>{
 const f=join(d,'sq.gif');
 assert.equal(spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=black:s=160x120:r=10:d=2','-f','lavfi','-i','color=c=white:s=20x20:r=10:d=2','-filter_complex',"[0][1]overlay=x='t*50':y=40",f]).status,0);
 const {pack}=run(f);ok(pack);
 assert.equal(pack.sources[0].kind,'gif');
 assert.ok(pack.observations.some(o=>o.measurementMethod==='centroid-track'));
}));

test('annotations add DECLARED bindings and actor names; code creates no approval or lock',{skip},()=>tmp(async d=>{
 const f=join(d,'sq.mp4');gen(f,MOVE);
 const a=join(d,'ann.json');await writeFile(a,JSON.stringify({actorName:'square',bindings:[{intentField:'actors.square',observationIds:[]}]}));
 const {pack}=run(f,{annotations:a});ok(pack);
 assert.deepEqual(pack.bindings,[{intentField:'actors.square',observationIds:[],hypothesisIds:[],provenanceClass:'DECLARED'}]);
 assert.ok(pack.observations.some(o=>o.actorId==='square'));
 assert.ok(!('approvals' in pack)&&!('lock' in pack));
 const bad=join(d,'dup.json');await writeFile(bad,'{"actorName":"a","actorName":"b"}');
 assert.throws(()=>run(f,{annotations:bad}),/duplicate/i);
}));

test('missing ffmpeg gives a one-line error',{skip},()=>tmp(d=>{
 const f=join(d,'sq.mp4');gen(f,MOVE);
 assert.throws(()=>run(f,{ffmpegBin:'/nonexistent/ffmpeg'}),e=>{assert.ok(!e.message.includes('\n'));assert.match(e.message,/ffmpeg not found/);return true;});
}));

test('storyboard folder: captions become storyboard-caption observations, digests bind images',()=>tmp(async d=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 await writeFile(join(d,'a.png'),png);await writeFile(join(d,'b.png'),png);
 await writeFile(join(d,'captions.json'),JSON.stringify({'a.png':'card rests','b.png':'card tilts right'}));
 const {pack}=run(d);ok(pack);
 assert.equal(pack.sources[0].kind,'storyboard');
 assert.deepEqual(pack.observations.map(o=>o.measurementMethod),['storyboard-caption','storyboard-caption']);
 assert.deepEqual(pack.observations.map(o=>o.timeRangeMs),[[0,1000],[1000,2000]]);
 assert.ok(pack.observations.every(o=>o.evidenceRefs.length===1&&o.confidence<1));
 assert.equal(run(d).pack.sources[0].digest,pack.sources[0].digest);
 await writeFile(join(d,'captions.json'),'{"a.png":"x","a.png":"y"}');
 assert.throws(()=>run(d),/duplicate/i);
}));

const chrome=findChrome();
test('Scorpio Canvas preview recorded to video produces an uncertainty report',{skip:(!chrome&&'no Chrome installed')||skip,timeout:120000},()=>withReviewer(async({browser:b,url,directory})=>{
 await b.goto(url);
 await b.waitFor('document.querySelectorAll("#segments li").length===3','segments rendered');
 const frames=join(directory,'frames');await mkdir(frames);
 for(let i=0;i<30;i++){
  await b.scrub(i*150);
  await b.waitFor(`document.getElementById("time").value==="${i*150} ms"`,'scrub');
  const data=await b.evaluate('document.getElementById("preview").toDataURL("image/png")');
  await writeFile(join(frames,`f${String(i).padStart(3,'0')}.png`),Buffer.from(data.split(',')[1],'base64'));
 }
 const video=join(directory,'scorpio-preview.mp4');
 const r=spawnSync('ffmpeg',['-v','error','-y','-framerate','10','-i',join(frames,'f%03d.png'),'-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-pix_fmt','yuv420p',video]);
 assert.equal(r.status,0,String(r.stderr));
 const {pack,report}=run(video);ok(pack);
 assert.ok(report.limitations.length>=3);
 assert.ok(report.observations.length>=1);
 assert.equal(report.easingClaims,0);
 assert.ok(pack.observations.every(o=>o.confidence<1));
}));
