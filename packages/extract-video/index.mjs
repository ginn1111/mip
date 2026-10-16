// AGE-35: video/GIF/storyboard -> Reference Evidence Pack + uncertainty report (docs/specs/AGE-35.md B1-B5).
// Motion is approximate (centroid of changed pixels). No easing curve and no original code is ever claimed.
// Code never creates an approval or a lock: every approval happens in the web reviewer.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync,openSync,readFileSync,readSync,statSync} from 'node:fs';
import {basename,extname,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseStrictJson} from '../artifacts/index.mjs';
import {validateEvidencePack} from '../evidence/index.mjs';

export const DEFAULTS={timeoutMs:120000,maxBuffer:1<<30,fps:10,threshold:0.002,size:64,pixelDelta:16,moveEpsilon:0.02,storyboardFrameMs:1000};
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
// Streams the file in 1 MiB chunks so a large recording is never held in memory.
function shaFile(file){
 const h=createHash('sha256'),buf=Buffer.allocUnsafe(1<<20),fd=openSync(file,'r');
 try{for(let n;(n=readSync(fd,buf,0,buf.length,null))>0;)h.update(buf.subarray(0,n));}finally{closeSync(fd);}
 return 'sha256:'+h.digest('hex');
}
const round=(n,d=4)=>Number(n.toFixed(d));
const MEDIA={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
// ponytail: caps keep every extracted confidence below 1; calibrate against a real reference video when one exists.
const CONF={frameDiff:0.8,centroidMax:0.8,short:0.1,noMotion:0.6,caption:0.5};

function tools({ffmpegBin=process.env.MIP_FFMPEG||'ffmpeg',ffprobeBin=process.env.MIP_FFPROBE||'ffprobe'}={}){
 for(const bin of [ffmpegBin,ffprobeBin])
  if(spawnSync(bin,['-version'],{stdio:'ignore',timeout:10000}).status!==0)throw new Error(`${basename(bin)} not found: install ffmpeg and ffprobe, or set MIP_FFMPEG and MIP_FFPROBE`);
 return {ffmpegBin,ffprobeBin};
}

// Fails closed with one clear line on timeout or oversize output.
function run(bin,args,{timeoutMs,maxBuffer,...rest}){
 const r=spawnSync(bin,args,{timeout:timeoutMs,maxBuffer,...rest});
 if(r.error?.code==='ETIMEDOUT')throw new Error(`${basename(bin)} timed out after ${timeoutMs} ms`);
 if(r.error?.code==='ENOBUFS')throw new Error(`${basename(bin)} output too large (maxBuffer ${maxBuffer} bytes exceeded)`);
 if(r.error)throw new Error(`${basename(bin)} failed: ${r.error.message}`);
 return r;
}

function probe(ffprobeBin,file,{timeoutMs}){
 const r=run(ffprobeBin,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate:format=duration','-of','json',file],{encoding:'utf8',timeoutMs,maxBuffer:1<<24});
 if(r.status!==0)throw new Error('ffprobe failed: '+(r.stderr||'').trim().split('\n')[0]);
 const info=parseStrictJson(r.stdout),s=info.streams?.[0];
 if(!s)throw new Error('no video stream in '+basename(file));
 const [n,d]=String(s.r_frame_rate).split('/').map(Number);
 return {codec:s.codec_name,width:s.width,height:s.height,frameRate:d?round(n/d,3):null,durationMs:Math.round(Number(info.format?.duration??0)*1000)};
}

function sample(ffmpegBin,file,{fps,size,timeoutMs,maxBuffer}){
 const r=run(ffmpegBin,['-v','error','-i',file,'-vf',`fps=${fps},scale=${size}:${size}:flags=area,format=gray`,'-f','rawvideo','-'],{timeoutMs,maxBuffer});
 if(r.status!==0)throw new Error('ffmpeg failed: '+String(r.stderr).trim().split('\n')[0]);
 const frames=[],px=size*size;
 for(let at=0;at+px<=r.stdout.length;at+=px)frames.push(r.stdout.subarray(at,at+px));
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

function motionObservations({diffs,timesMs,sourceId,actor,opts}){
 const obs=[];let next=1;
 const add=x=>obs.push({id:'obs-'+next++,sourceId,actorId:'frame',evidenceRefs:[],...x});
 let i=0;
 while(i<diffs.length){
  if(diffs[i].mean<=opts.threshold){i++;continue;}
  let j=i;while(j+1<diffs.length&&diffs[j+1].mean>opts.threshold)j++;
  const seg=diffs.slice(i,j+1),range=[timesMs[i],timesMs[j+1]];
  add({timeRangeMs:range,event:'frame-change',property:'meanFrameDifference',measurementMethod:'frame-diff',confidence:CONF.frameDiff,
   measuredValue:{mean:round(seg.reduce((s,d)=>s+d.mean,0)/seg.length),peak:round(Math.max(...seg.map(d=>d.mean))),pairs:seg.length}});
  const pts=seg.map(d=>d.centroid).filter(Boolean);
  if(pts.length){
   const from=pts[0],to=pts.at(-1),dx=to.x-from.x,dy=to.y-from.y;
   add({actorId:actor,timeRangeMs:range,event:'motion',property:'changedPixelCentroid',measurementMethod:'centroid-track',
    confidence:round(Math.min(CONF.centroidMax,0.2+0.1*pts.length),2),
    measuredValue:{...direction(dx,dy,opts.moveEpsilon),unit:'fraction-of-frame',from:{x:round(from.x),y:round(from.y)},to:{x:round(to.x),y:round(to.y)},displacement:{x:round(dx),y:round(dy)},samples:pts.length}});
  }
  i=j+1;
 }
 return obs;
}

function videoObservations({frames,diffs,timesMs,durationMs,sourceId,actor,opts}){
 if(frames.length<2)
  return [{id:'obs-1',sourceId,actorId:'frame',timeRangeMs:[0,durationMs],event:'insufficient-samples',property:'meanFrameDifference',
   measuredValue:{frames:frames.length},measurementMethod:'frame-diff',confidence:CONF.short,evidenceRefs:[]}];
 const obs=motionObservations({diffs,timesMs,sourceId,actor,opts});
 return obs.length?obs:[{id:'obs-1',sourceId,actorId:'frame',timeRangeMs:[timesMs[0],timesMs.at(-1)],event:'no-motion',property:'meanFrameDifference',
  measuredValue:{mean:round(diffs.reduce((s,d)=>s+d.mean,0)/diffs.length),peak:round(Math.max(...diffs.map(d=>d.mean))),pairs:diffs.length},
  measurementMethod:'frame-diff',confidence:CONF.noMotion,evidenceRefs:[]}];
}

// ponytail: hand-rolled mirror of schemas/v0.7/evidence-pack.schema.json for what this extractor emits (ajv is a devDependency, no new runtime dep);
// tests validate every pack against the real schema. Swap for the compiled schema if ajv ships as a dependency.
const str=v=>typeof v==='string'&&v.length>0,obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function assertSchemaShape(pack){
 const bad=[],need=(ok,what)=>{if(!ok)bad.push(what);};
 need(pack.protocol==='mip/0.7','protocol');need(str(pack.id),'id');
 need(Array.isArray(pack.sources)&&pack.sources.length>0&&pack.sources.every(x=>obj(x)&&str(x.id)&&str(x.kind)&&str(x.uri)&&/^sha256:[a-f0-9]{64}$/.test(x.digest)&&str(x.capturedAt)&&!Number.isNaN(Date.parse(x.capturedAt))&&obj(x.environment)&&str(x.licenseOrPermissionNotes)),'sources');
 need(Array.isArray(pack.observations)&&pack.observations.every(x=>obj(x)&&str(x.id)&&str(x.sourceId)&&Array.isArray(x.timeRangeMs)&&x.timeRangeMs.length===2&&x.timeRangeMs.every(Number.isInteger)&&x.timeRangeMs.every(n=>n>=0)&&str(x.actorId)&&str(x.event)&&str(x.property)&&str(x.measurementMethod)&&typeof x.confidence==='number'&&x.confidence>=0&&x.confidence<=1&&Array.isArray(x.evidenceRefs)),'observations');
 need(Array.isArray(pack.hypotheses),'hypotheses');
 need(Array.isArray(pack.bindings)&&pack.bindings.every(x=>obj(x)&&str(x.intentField)&&isStrings(x.observationIds)&&isStrings(x.hypothesisIds)&&['OBSERVED','INFERRED','DECLARED'].includes(x.provenanceClass)),'bindings');
 if(bad.length)throw new Error('invalid evidence pack: schema shape violated at '+bad.join(', '));
}

/**
 * Rejects any observation that asserts an easing curve (RFC 0007). Scans object keys (incl. measuredValue)
 * and the event/property/measurementMethod fields as whole words; never uri, actorId or caption text.
 */
export function assertNoEasingClaim(pack){
 const bad=/\b(ease|easing|bezier|spring|cubic)\b/i,hit=text=>bad.test(String(text).replace(/([a-z])([A-Z])/g,'$1 $2'));
 const keys=(v,path)=>{
  if(Array.isArray(v))v.forEach((x,i)=>keys(x,`${path}[${i}]`));
  else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(hit(k))throw new Error(`easing claim at ${path}.${k}`);keys(x,`${path}.${k}`);}
 };
 for(const obs of pack.observations??[]){
  const {measuredValue,actorId,evidenceRefs,...rest}=obs;
  keys(rest,obs.id);keys(measuredValue,obs.id+'.measuredValue');
  for(const f of ['event','property','measurementMethod'])if(typeof obs[f]==='string'&&hit(obs[f]))throw new Error(`easing claim at ${obs.id}.${f}`);
 }
}

const isStrings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x);

/** Validates annotation shape up front; returns the actor name. Bindings are attached later by `bindAnnotations`. */
function annotate(annotations){
 if(!annotations)return null;
 if(typeof annotations!=='object'||Array.isArray(annotations))throw new Error('annotations must be an object');
 const {actorName:actor,bindings}=annotations;
 if(actor!==undefined&&(typeof actor!=='string'||!actor))throw new Error('annotations.actorName must be a non-empty string');
 if(bindings!==undefined&&!Array.isArray(bindings))throw new Error('annotations.bindings must be an array');
 for(const b of bindings??[]){
  if(typeof b?.intentField!=='string'||!b.intentField)throw new Error('annotation binding needs intentField');
  if(b.observationIds!==undefined&&!isStrings(b.observationIds))throw new Error(`annotation binding ${b.intentField}: observationIds must be an array of strings`);
 }
 return actor??null;
}

function bindAnnotations(pack,annotations){
 const ids=new Set(pack.observations.map(x=>x.id));
 for(const b of annotations?.bindings??[]){
  const observationIds=b.observationIds??[];
  for(const id of observationIds)if(!ids.has(id))throw new Error(`annotation binding ${b.intentField}: unknown observation ${id}`);
  pack.bindings.push({intentField:b.intentField,observationIds,hypothesisIds:[],provenanceClass:'DECLARED'});
 }
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
  if(/[\\/]|\.\./.test(file))throw new Error('storyboard key must be a plain file name in the folder: '+file);
  const path=resolve(dir,file),rel=relative(resolve(dir),path);
  if(!rel||rel.startsWith('..')||rel!==file)throw new Error('storyboard key escapes the folder: '+file);
  const mediaType=MEDIA[extname(file).toLowerCase()];
  if(!mediaType)throw new Error('unsupported storyboard image: '+file);
  const d=shaFile(path);
  hash.update(file+'\0'+d+'\n');
  return {id:'obs-'+(i+1),sourceId:'src-1',timeRangeMs:[i*o.storyboardFrameMs,(i+1)*o.storyboardFrameMs],actorId:'frame',event:'storyboard-frame',property:'caption',
   measuredValue:captions[file],measurementMethod:'storyboard-caption',confidence:CONF.caption,evidenceRefs:[{uri:pathToFileURL(join(dir,file)).href,digest:d,mediaType}]};
 });
 return {kind:'storyboard',digest:'sha256:'+hash.digest('hex'),environment:{viewport:null,device:null,frameRate:null},observations};
}

function readMedia(input,o){
 const {ffmpegBin,ffprobeBin}=tools(o);
 const p=probe(ffprobeBin,input,o);
 const frames=sample(ffmpegBin,input,o),timesMs=frames.map((_,i)=>Math.round(i*1000/o.fps));
 return {p,frames,timesMs,digest:shaFile(input),kind:p.codec==='gif'||extname(input).toLowerCase()==='.gif'?'gif':'video'};
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
 const actor=annotate(annotations);
 if(dir){
  src=storyboard(abs,o);observations=src.observations;
  limitations=['Storyboard captions are human-written descriptions; no pixel measurement was made.','Frame timing is a fixed assumed duration per image, not read from a recording.'];
  timing={frameDurationMs:o.storyboardFrameMs};
 }else{
  const m=readMedia(abs,o);
  src={kind:m.kind,digest:m.digest,environment:{viewport:`${m.p.width}x${m.p.height}`,device:null,frameRate:m.p.frameRate}};
  const diffs=diffFrames(m.frames,o);
  observations=videoObservations({frames:m.frames,diffs,timesMs:m.timesMs,durationMs:m.p.durationMs,sourceId:'src-1',actor:actor??'changed-region',opts:o});
  limitations=[`Sampled at ${o.fps} fps on a ${o.size}x${o.size} grayscale grid; faster or smaller motion can be missed.`,
   'Motion position is the centroid of changed pixels: it lies between old and new positions, so displacement is approximate.',
   'No easing curve is asserted; sampled positions cannot determine one.','Original code, framework and exact timing functions cannot be recovered from video.'];
  timing={fps:o.fps,threshold:o.threshold,size:o.size,frames:m.frames.length};
 }
 pack.sources.push(sourceFor({kind:src.kind,uri:pathToFileURL(abs).href,digest:src.digest,capturedAt,environment:src.environment,notes}));
 pack.observations=observations;
 bindAnnotations(pack,annotations);
 if(!pack.id)pack.id='pack-'+src.digest.slice(7,19);
 assertSchemaShape(pack);
 assertNoEasingClaim(pack);
 const check=validateEvidencePack(pack);
 if(!check.ok)throw new Error('invalid evidence pack: '+JSON.stringify(check.violations));
 const report={packId:pack.id,source:{id:'src-1',kind:src.kind,digest:src.digest},parameters:timing,limitations,
  observations:observations.map(x=>({id:x.id,measurementMethod:x.measurementMethod,confidence:x.confidence,event:x.event,timeRangeMs:x.timeRangeMs})),
  declaredBindings:pack.bindings.length,easingClaims:0,approvals:0,
  reviewNote:'Every observation is a measurement or a human caption, never a fact about the original implementation. A human approves in the web reviewer.'};
 return {pack,report};
}
