// AGE-40: config validation and per-kind extraction. Site -> AGE-36 captureWeb; video|storyboard -> AGE-35 extractEvidence.
import {parseStrictJson} from '../../packages/artifacts/index.mjs';
import {extractEvidence} from '../../packages/extract-video/index.mjs';
import {captureWeb,loadScenario} from '../../packages/capture-web/index.mjs';
import {buildDrafts} from '../../packages/draft-artifacts/index.mjs';
import {stage,evaluate} from './metrics.mjs';

const KINDS=['video','site','storyboard'];

/** Parse + validate config text (strict JSON). Throws a clear Error. */
export function loadConfig(text){
 const cfg=parseStrictJson(text);
 if(!cfg||!Array.isArray(cfg.references)||!cfg.references.length)throw new Error('config.references must be a non-empty array of {id,kind,input,projectId}');
 for(const r of cfg.references){
  if(!r||typeof r.id!=='string'||!r.id)throw new Error('reference.id must be a non-empty string');
  if(!KINDS.includes(r.kind))throw new Error(`reference ${r.id}: kind must be one of ${KINDS.join('|')}`);
  if(r.input===undefined||r.input===null||r.input==='')throw new Error(`reference ${r.id}: input required`);
 }
 return cfg;
}

/** Returns {pack,...}. site input = scenario object or path to a scenario file. */
export async function extractReference(r,{captureOpts={},allowlistFile}={}){
 if(r.kind==='site'){
  const scenario=typeof r.input==='string'?await loadScenario(r.input):r.input;
  return captureWeb({scenario,allowlistFile,...captureOpts});
 }
 return extractEvidence(r.input);
}

/** One import-arm row per reference; plus a manual-arm row for each reference with a manual session. */
export async function runAll(cfg,{captureOpts}={}){
 const results=[];
 for(const r of cfg.references){
  const sessions=Array.isArray(r.sessions)?r.sessions:[];
  const extract=await stage(()=>extractReference(r,{captureOpts,allowlistFile:cfg.allowlistFile}));
  const draft=extract.ok?await stage(()=>buildDrafts(extract.value.pack,{projectId:r.projectId})):{ok:false,error:'skipped: extract failed'};
  const reference={id:r.id,kind:r.kind};
  for(const arm of ['manual','import']){
   const session=sessions.find(s=>s?.arm===arm)??null;
   if(arm==='manual'&&!session)continue;
   results.push(evaluate({arm,reference,stages:{extract,draft},truth:arm==='import'?r.truth:null,session,toleranceMs:cfg.toleranceMs}));
  }
 }
 return results;
}
