// AGE-37: Figma handoff importer (docs/specs/AGE-37.md B1-B4). Pure mapping plus one local-file loader.
// No network, no token, no approval or lock: output is draft evidence for a human to review.
import {readFileSync} from 'node:fs';
import {digest,parseStrictJson} from '../artifacts/index.mjs';

export const METHOD='figma-prototype';
const FRAME_TYPES=new Set(['FRAME','COMPONENT','COMPONENT_SET']);
const LAYER_TYPES=new Set(['FRAME','GROUP','COMPONENT','COMPONENT_SET','INSTANCE','TEXT','RECTANGLE','ELLIPSE','VECTOR','LINE','STAR','REGULAR_POLYGON','BOOLEAN_OPERATION']);
const SUGGESTION='Record a screen capture of the prototype and run the video extractor (AGE-35) to measure movement.';
const list=v=>Array.isArray(v)?v:[];

/** B1: read a local Figma REST `GET /v1/files/:key` JSON file; duplicate keys rejected. */
export const readFigmaFile=path=>parseStrictJson(readFileSync(path,'utf8'));

// Interactions of one node: modern `interactions[].actions[]` and legacy `transitionNodeID` fields.
function transitionsOf(node){
 const out=[];
 for(const i of list(node.interactions))for(const a of list(i?.actions))
  if(a?.destinationId)out.push({to:a.destinationId,type:a.transition?.type??null,durationMs:a.transition?.duration??null,trigger:i.trigger?.type??null});
 if(node.transitionNodeID)out.push({to:node.transitionNodeID,type:null,durationMs:node.transitionDuration??null,trigger:null});
 return out;
}

/**
 * @param file parsed Figma file JSON
 * @param opts `{uri, capturedAt, licenseOrPermissionNotes, packId?}`; notes come from the user (B4)
 * @returns `{pack, unknowns, storyboard, actors, constraints, unsupported}`
 */
export function importFigma(file,{uri,capturedAt,licenseOrPermissionNotes,packId='figma-import'}={}){
 if(!uri||!capturedAt||!licenseOrPermissionNotes?.trim())throw new TypeError('uri, capturedAt and licenseOrPermissionNotes are required');
 const root=file?.document;
 if(root?.type!=='DOCUMENT')throw new TypeError('not a Figma file response: missing document node');
 const nodes=new Map(),storyboard=[],actors=[],unsupported=[],unknowns=[],observations=[],bindings=[];
 const index=n=>{nodes.set(n.id,n);list(n.children).forEach(index);};index(root);

 const layer=(n,frameId)=>{
  if(!LAYER_TYPES.has(n.type)){unsupported.push({nodeId:n.id,name:n.name??null,type:n.type});return;}
  actors.push({nodeId:n.id,name:n.name??null,type:n.type,frameId,bounds:n.absoluteBoundingBox??null});
  list(n.children).forEach(c=>layer(c,frameId));
 };
 for(const page of list(root.children))for(const n of list(page.children)){
  if(!FRAME_TYPES.has(n.type)){unsupported.push({nodeId:n.id,name:n.name??null,type:n.type});continue;}
  storyboard.push({nodeId:n.id,name:n.name??null,page:page.name??null,bounds:n.absoluteBoundingBox??null});
  list(n.children).forEach(c=>layer(c,n.id));
 }

 let seq=0;
 for(const n of nodes.values()){
  for(const t of transitionsOf(n)){
   const id=`obs-${++seq}`;
   // Time is local to the transition (0..duration); a missing duration is [0,0] plus an unknown, never a guess.
   observations.push({id,sourceId:'src-figma',timeRangeMs:[0,t.durationMs??0],actorId:n.id,event:'transition',property:'navigation',
    measuredValue:{destinationId:t.to,transitionType:t.type,durationMs:t.durationMs,trigger:t.trigger},measurementMethod:METHOD,confidence:1,evidenceRefs:[]});
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

 // B2: variables are not part of the files response proper; accept them when present (see spec assumptions).
 const vars=file.variables??file.meta?.variables??{};
 const constraints=Object.entries(vars).map(([variableId,v])=>({variableId,name:v?.name??null,resolvedType:v?.resolvedType??null,valuesByMode:v?.valuesByMode??null}));

 const pack={protocol:'mip/0.7',id:packId,
  sources:[{id:'src-figma',kind:'figma',uri,digest:digest(file),capturedAt,environment:{viewport:null,device:null,frameRate:null},licenseOrPermissionNotes}],
  observations,hypotheses:[],bindings};
 return {pack,unknowns,storyboard,actors,constraints,unsupported};
}
