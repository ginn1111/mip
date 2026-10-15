// AGE-35: video/GIF/storyboard -> Reference Evidence Pack + uncertainty report (docs/specs/AGE-35.md B1-B5).
// Motion is approximate (centroid of changed pixels). No easing curve and no original code is ever claimed.
// Code never creates an approval or a lock: every approval happens in the web reviewer.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {basename,extname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStrictJson} from '../artifacts/index.mjs';
import {validateEvidencePack} from '../evidence/index.mjs';

export const DEFAULTS={fps:10,threshold:0.002,size:64,pixelDelta:16,moveEpsilon:0.02,storyboardFrameMs:1000};
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const round=(n,d=4)=>Number(n.toFixed(d));
const MEDIA={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
// ponytail: caps keep every extracted confidence below 1; calibrate against a real reference video when one exists.
const CONF={frameDiff:0.8,centroidMax:0.8,short:0.1,noMotion:0.6,caption:0.5};

function tools({ffmpegBin=process.env.MIP_FFMPEG||'ffmpeg',ffprobeBin=process.env.MIP_FFPROBE||'ffprobe'}={}){
 for(const bin of [ffmpegBin,ffprobeBin])
  if(spawnSync(bin,['-version'],{stdio:'ignore'}).status!==0)throw new Error(`${basename(bin)} not found: install ffmpeg and ffprobe, or set MIP_FFMPEG and MIP_FFPROBE`);
 return {ffmpegBin,ffprobeBin};
}

function probe(ffprobeBin,file){
 const r=spawnSync(ffprobeBin,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate:format=duration','-of','json',file],{encoding:'utf8'});
 if(r.status!==0)throw new Error('ffprobe failed: '+(r.stderr||'').trim().split('\n')[0]);
 const info=parseStrictJson(r.stdout),s=info.streams?.[0];
 if(!s)throw new Error('no video stream in '+basename(file));
 const [n,d]=String(s.r_frame_rate).split('/').map(Number);
 return {codec:s.codec_name,width:s.width,height:s.height,frameRate:d?round(n/d,3):null,durationMs:Math.round(Number(info.format?.duration??0)*1000)};
}

function sample(ffmpegBin,file,{fps,size}){
 const r=spawnSync(ffmpegBin,['-v','error','-i',file,'-vf',`fps=${fps},scale=${size}:${size}:flags=area,format=gray`,'-f','rawvideo','-'],{maxBuffer:1<<30});
 if(r.status!==0)throw new Error('ffmpeg failed: '+String(r.stderr).trim().split('\n')[0]);
 const frames=[],px=size*size;
 for(let o=0;o+px<=r.stdout.length;o+=px)frames.push(r.stdout.subarray(o,o+px));
 return frames;
}

/** Pairwise mean frame difference (0..1) and centroid of changed pixels (fraction of frame; null when nothing changed). */
export function diffFrames(frames,{size,pixelDelta}){
 const out=[];
 for(let f=1;f<frames.length;f++){
  const a=frames[f-1],b=frames[f];let sum=0,n=0,sx=0,sy=0;
  for(let i=0;i<b.length;i++){
   const d=Math.abs(b[i]-a[i]);sum+=d;
   if(d>pixelDelta){n++;sx+=i%size;sy+=Math.floor(i/size);}
  }
  out.push({mean:sum/b.length/255,centroid:n?{x:sx/n/(size-1),y:sy/n/(size-1)}:null});
 }
 return out;
}

const direction=(dx,dy,eps)=>{
 const ax=Math.abs(dx),ay=Math.abs(dy);
 if(ax<eps&&ay<eps)return {axis:'none',direction:'none'};
 return ax>=ay?{axis:'x',direction:dx>0?'right':'left'}:{axis:'y',direction:dy>0?'down':'up'};
};

function motionObservations({diffs,timesMs,sourceId,actor,o}){
 const obs=[];let next=1;
 const add=x=>obs.push({id:'obs-'+next++,sourceId,actorId:'frame',evidenceRefs:[],...x});
 let i=0;
 while(i<diffs.length){
  if(diffs[i].mean<=o.threshold){i++;continue;}
  let j=i;while(j+1<diffs.length&&diffs[j+1].mean>o.threshold)j++;
  const seg=diffs.slice(i,j+1),range=[timesMs[i],timesMs[j+1]];
  add({timeRangeMs:range,event:'frame-change',property:'meanFrameDifference',measurementMethod:'frame-diff',confidence:CONF.frameDiff,
   measuredValue:{mean:round(seg.reduce((s,d)=>s+d.mean,0)/seg.length),peak:round(Math.max(...seg.map(d=>d.mean))),pairs:seg.length}});
  const pts=seg.map(d=>d.centroid).filter(Boolean);
  if(pts.length){
   const from=pts[0],to=pts.at(-1),dx=to.x-from.x,dy=to.y-from.y;
   add({actorId:actor,timeRangeMs:range,event:'motion',property:'changedPixelCentroid',measurementMethod:'centroid-track',
    confidence:round(Math.min(CONF.centroidMax,0.2+0.1*pts.length),2),
    measuredValue:{...direction(dx,dy,o.moveEpsilon),unit:'fraction-of-frame',from:{x:round(from.x),y:round(from.y)},to:{x:round(to.x),y:round(to.y)},displacement:{x:round(dx),y:round(dy)},samples:pts.length}});
  }
  i=j+1;
 }
 return obs;
}

function videoObservations({frames,diffs,timesMs,durationMs,sourceId,actor,o}){
 if(frames.length<2)
  return [{id:'obs-1',sourceId,actorId:'frame',timeRangeMs:[0,durationMs],event:'insufficient-samples',property:'meanFrameDifference',
   measuredValue:{frames:frames.length},measurementMethod:'frame-diff',confidence:CONF.short,evidenceRefs:[]}];
 const obs=motionObservations({diffs,timesMs,sourceId,actor,o});
 return obs.length?obs:[{id:'obs-1',sourceId,actorId:'frame',timeRangeMs:[timesMs[0],timesMs.at(-1)],event:'no-motion',property:'meanFrameDifference',
  measuredValue:{mean:round(diffs.reduce((s,d)=>s+d.mean,0)/diffs.length),peak:round(Math.max(...diffs.map(d=>d.mean))),pairs:diffs.length},
  measurementMethod:'frame-diff',confidence:CONF.noMotion,evidenceRefs:[]}];
}

/** Rejects any observation that asserts an easing curve (RFC 0007). Caption text is human-written and not scanned. */
export function assertNoEasingClaim(pack){
 const bad=/ease|easing|bezier|spring|cubic/i;
 const walk=(v,path)=>{
  if(Array.isArray(v))v.forEach((x,i)=>walk(x,`${path}[${i}]`));
  else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(bad.test(k))throw new Error(`easing claim at ${path}.${k}`);walk(x,`${path}.${k}`);}
  else if(typeof v==='string'&&bad.test(v))throw new Error(`easing claim at ${path}`);
 };
 for(const o of pack.observations??[]){
  const {measuredValue,...rest}=o;
  walk(rest,o.id);
  if(o.measurementMethod!=='storyboard-caption')walk(measuredValue,o.id+'.measuredValue');
 }
}

function annotate(pack,annotations){
 if(!annotations)return null;
 const actor=annotations.actorName;
 if(actor!==undefined&&(typeof actor!=='string'||!actor))throw new Error('annotations.actorName must be a non-empty string');
 for(const b of annotations.bindings??[]){
  if(typeof b?.intentField!=='string'||!b.intentField)throw new Error('annotation binding needs intentField');
  pack.bindings.push({intentField:b.intentField,observationIds:b.observationIds??[],hypothesisIds:[],provenanceClass:'DECLARED'});
 }
 return actor??null;
}

function sourceFor({kind,uri,digest,capturedAt,environment,notes}){
 return {id:'src-1',kind,uri,digest,capturedAt,environment,licenseOrPermissionNotes:notes};
}

function storyboard(dir,o){
 const captionsFile=join(dir,o.captionsFile??'captions.json');
 const raw=readFileSync(captionsFile),captions=parseStrictJson(raw.toString('utf8'));
 const files=Object.keys(captions);
 const hash=createHash('sha256').update('captions.json\0'+sha(raw)+'\n');
 const observations=files.map((file,i)=>{
  if(typeof captions[file]!=='string'||!captions[file])throw new Error('caption must be a non-empty string: '+file);
  const media=MEDIA[extname(file).toLowerCase()];
  if(!media)throw new Error('unsupported storyboard image: '+file);
  const bytes=readFileSync(join(dir,file)),d=sha(bytes);
  hash.update(file+'\0'+d+'\n');
  return {id:'obs-'+(i+1),sourceId:'src-1',timeRangeMs:[i*o.storyboardFrameMs,(i+1)*o.storyboardFrameMs],actorId:'frame',event:'storyboard-frame',property:'caption',
   measuredValue:captions[file],measurementMethod:'storyboard-caption',confidence:CONF.caption,evidenceRefs:[{uri:pathToFileURL(join(dir,file)).href,digest:d,mediaType:media}]};
 });
 return {kind:'storyboard',digest:'sha256:'+hash.digest('hex'),environment:{viewport:null,device:null,frameRate:null},observations};
}

function media(input,o){
 const {ffmpegBin,ffprobeBin}=tools(o);
 const bytes=readFileSync(input),p=probe(ffprobeBin,input);
 const frames=sample(ffmpegBin,input,o),timesMs=frames.map((_,i)=>Math.round(i*1000/o.fps));
 return {p,frames,timesMs,digest:sha(bytes),kind:p.codec==='gif'||extname(input).toLowerCase()==='.gif'?'gif':'video'};
}

/**
 * Extract an evidence pack from a video/GIF file or a storyboard folder (images + captions.json).
 * Returns `{pack, report}`; throws on missing tools, bad input, an invalid pack or an easing claim.
 */
export function extractEvidence(input,options={}){
 const o={...DEFAULTS,...options},abs=resolve(input);
 const annotations=o.annotations?parseStrictJson(readFileSync(o.annotations,'utf8')):null;
 const capturedAt=o.capturedAt??new Date().toISOString(),notes=o.licenseOrPermissionNotes??'unknown';
 const dir=statSync(abs).isDirectory();
 let src,observations,limitations,timing;
 const pack={protocol:'mip/0.7',id:o.id??'',sources:[],observations:[],hypotheses:[],bindings:[]};
 const actor=annotate(pack,annotations);
 if(dir){
  src=storyboard(abs,o);observations=src.observations;
  limitations=['Storyboard captions are human-written descriptions; no pixel measurement was made.','Frame timing is a fixed assumed duration per image, not read from a recording.'];
  timing={frameDurationMs:o.storyboardFrameMs};
 }else{
  const m=media(abs,o);
  src={kind:m.kind,digest:m.digest,environment:{viewport:`${m.p.width}x${m.p.height}`,device:null,frameRate:m.p.frameRate}};
  const diffs=diffFrames(m.frames,o);
  observations=videoObservations({frames:m.frames,diffs,timesMs:m.timesMs,durationMs:m.p.durationMs,sourceId:'src-1',actor:actor??'changed-region',o});
  limitations=[`Sampled at ${o.fps} fps on a ${o.size}x${o.size} grayscale grid; faster or smaller motion can be missed.`,
   'Motion position is the centroid of changed pixels: it lies between old and new positions, so displacement is approximate.',
   'No easing curve is asserted; sampled positions cannot determine one.','Original code, framework and exact timing functions cannot be recovered from video.'];
  timing={fps:o.fps,threshold:o.threshold,size:o.size,frames:m.frames.length};
 }
 pack.sources.push(sourceFor({kind:src.kind,uri:pathToFileURL(abs).href,digest:src.digest,capturedAt,environment:src.environment,notes}));
 pack.observations=observations;
 if(!pack.id)pack.id='pack-'+src.digest.slice(7,19);
 assertNoEasingClaim(pack);
 const check=validateEvidencePack(pack);
 if(!check.ok)throw new Error('invalid evidence pack: '+JSON.stringify(check.violations));
 const report={packId:pack.id,source:{id:'src-1',kind:src.kind,digest:src.digest},parameters:timing,limitations,
  observations:observations.map(x=>({id:x.id,measurementMethod:x.measurementMethod,confidence:x.confidence,event:x.event,timeRangeMs:x.timeRangeMs})),
  declaredBindings:pack.bindings.length,easingClaims:0,approvals:0,
  reviewNote:'Every observation is a measurement or a human caption, never a fact about the original implementation. A human approves in the web reviewer.'};
 return {pack,report};
}
