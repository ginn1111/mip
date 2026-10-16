// AGE-37: Figma handoff importer (docs/specs/AGE-37.md B1-B4). Pure mapping plus local-file loaders.
// No network, no token, no approval or lock: output is draft evidence for a human to review.
import {readFileSync} from 'node:fs';
import {digest,parseStrictJson} from '../artifacts/index.mjs';
import {validateEvidencePack} from '../evidence/index.mjs';

export const METHOD='figma-prototype';
const FRAME_TYPES=new Set(['FRAME','COMPONENT','COMPONENT_SET']);
const LAYER_TYPES=new Set(['FRAME','GROUP','COMPONENT','COMPONENT_SET','INSTANCE','TEXT','RECTANGLE','ELLIPSE','VECTOR','LINE','STAR','REGULAR_POLYGON','BOOLEAN_OPERATION']);
const SUGGESTION='Record a screen capture of the prototype and run the video extractor (AGE-35) to measure movement.';
const list=v=>Array.isArray(v)?v:[];

/** B1: read a local Figma REST `GET /v1/files/:key` JSON file; duplicate keys rejected. */
export const readFigmaFile=path=>parseStrictJson(readFileSync(path,'utf8'));

/** B2: read a local `GET /v1/files/:key/variables/local` response (variables live under `meta.variables`); duplicate keys rejected. */
export const readFigmaVariables=path=>parseStrictJson(readFileSync(path,'utf8'));

// Fail closed on durations the evidence-pack schema cannot hold (non-negative integer ms).
function duration(d,nodeId){
 if(d==null)return null;
 if(!Number.isInteger(d)||d<0)throw new TypeError(`invalid transition duration ${JSON.stringify(d)} at node ${nodeId}: expected a non-negative integer (ms)`);
 return d;
}

// Transitions of one node. Modern `interactions[].actions[]` win over the legacy `transitionNodeID` form of the same destination.
// Easing is what Figma declares, never something observed. Non-NODE actions (BACK, URL, ...) come back in `ignored`.
function transitionsOf(node){
 const out=[],ignored=[];
 for(const i of list(node.interactions))for(const a of list(i?.actions)){
  if(a?.type!=='NODE'||!a.destinationId){ignored.push(`ACTION:${a?.type}`);continue;}
  const e=a.transition?.easing?.type;
  out.push({to:a.destinationId,type:a.transition?.type??null,durationMs:duration(a.transition?.duration,node.id),trigger:i.trigger?.type??null,
   easing:e?{value:e,provenance:'declared-by-figma'}:null});
 }
 if(node.transitionNodeID&&!out.some(t=>t.to===node.transitionNodeID))
  out.push({to:node.transitionNodeID,type:null,durationMs:duration(node.transitionDuration,node.id),trigger:null,easing:null});
 return {out,ignored};
}

/**
 * @param file parsed Figma file JSON
 * @param opts `{uri, capturedAt, licenseOrPermissionNotes, packId?, variables?}`; notes come from the user (B4);
 *   `variables` is the parsed variables/local response (see `readFigmaVariables`)
 * @returns `{pack, unknowns, storyboard, actors, constraints, unsupported}`
 */
export function importFigma(file,{uri,capturedAt,licenseOrPermissionNotes,packId='figma-import',variables}={}){
 if(!uri||!capturedAt||!licenseOrPermissionNotes?.trim())throw new TypeError('uri, capturedAt and licenseOrPermissionNotes are required');
 const root=file?.document;
 if(root?.type!=='DOCUMENT')throw new TypeError('not a Figma file response: missing document node');
 const vars=variables==null?{}:variables.meta?.variables;
 if(vars===null||typeof vars!=='object'||Array.isArray(vars))throw new TypeError('variables: expected a variables/local response with meta.variables');
 const nodes=new Map(),storyboard=[],actors=[],unsupported=[],unknowns=[],observations=[],bindings=[];
 const index=n=>{nodes.set(n.id,n);list(n.children).forEach(index);};index(root);

 const skip=(n,type=n.type)=>unsupported.push({nodeId:n.id,name:n.name??null,type});
 // Unsupported nodes are listed once and their children are still walked: no frame or layer vanishes.
 const layer=(n,frameId)=>{
  if(LAYER_TYPES.has(n.type))actors.push({nodeId:n.id,name:n.name??null,type:n.type,frameId,bounds:n.absoluteBoundingBox??null});
  else skip(n);
  list(n.children).forEach(c=>layer(c,frameId));
 };
 const top=(n,page)=>{
  if(FRAME_TYPES.has(n.type)){
   storyboard.push({nodeId:n.id,name:n.name??null,page:page.name??null,bounds:n.absoluteBoundingBox??null});
   list(n.children).forEach(c=>layer(c,n.id));
  }else{skip(n);list(n.children).forEach(c=>top(c,page));}
 };
 for(const page of list(root.children))list(page.children).forEach(n=>top(n,page));

 let seq=0;
 for(const n of nodes.values()){
  const {out,ignored}=transitionsOf(n);
  for(const type of ignored)skip(n,type);
  for(const t of out){
   const id=`obs-${++seq}`;
   // Time is local to the transition (0..duration); a missing duration is [0,0] plus an unknown, never a guess.
   observations.push({id,sourceId:'src-figma',timeRangeMs:[0,t.durationMs??0],actorId:n.id,event:'transition',property:'navigation',
    measuredValue:{destinationId:t.to,transitionType:t.type,durationMs:t.durationMs,trigger:t.trigger,easing:t.easing},measurementMethod:METHOD,confidence:1,evidenceRefs:[]});
   bindings.push({intentField:`transitions.${n.id}.${seq}`,observationIds:[id],hypothesisIds:[],provenanceClass:'OBSERVED'});
   if(t.durationMs==null)unknowns.push({code:'TRANSITION_TIMING_MISSING',nodeId:n.id,message:`transition from ${n.id} to ${t.to} has no duration`,suggestion:SUGGESTION});
   if(!nodes.has(t.to))unknowns.push({code:'TRANSITION_DESTINATION_UNKNOWN',nodeId:n.id,message:`destination ${t.to} is not in the file`,suggestion:SUGGESTION});
  }
 }
 const moving=new Set(observations.map(o=>o.actorId));
 for(const f of storyboard){
  const inFrame=[f.nodeId,...actors.filter(a=>a.frameId===f.nodeId).map(a=>a.nodeId)];
  if(!inFrame.some(id=>moving.has(id)))unknowns.push({code:'FRAME_MOVEMENT_UNKNOWN',nodeId:f.nodeId,message:`frame ${f.nodeId} has no prototype interaction; movement and timing unknown`,suggestion:SUGGESTION});
 }

 // B2: variables come only from the separate variables/local response, never from the file response.
 const constraints=Object.entries(vars).map(([variableId,v])=>({variableId,name:v?.name??null,resolvedType:v?.resolvedType??null,valuesByMode:v?.valuesByMode??null}));

 const pack={protocol:'mip/0.7',id:packId,
  sources:[{id:'src-figma',kind:'figma',uri,digest:digest(file),capturedAt,environment:{viewport:null,device:null,frameRate:null},licenseOrPermissionNotes}],
  observations,hypotheses:[],bindings};
 // Fail closed: never return a pack the AGE-34 checks reject.
 const check=validateEvidencePack(pack);
 if(!check.ok)throw new TypeError(`import produced an invalid evidence pack: ${JSON.stringify(check.violations)}`);
 return {pack,unknowns,storyboard,actors,constraints,unsupported};
}
