import {readFileSync} from 'node:fs';
const terms=JSON.parse(readFileSync(new URL('../../glossary/core/seed.json', import.meta.url),'utf8'));
export function glossary(){return structuredClone(terms);}
export function resolve(text,{project=[],scene=[],domain=[]}={}){
 const layers=[scene,project,domain,terms];
 const normalized=String(text).toLowerCase();
 const matches=[];
 for(const layer of layers){
  for(const entry of layer){
   const aliases=[entry.term,...entry.aliases].sort((a,b)=>b.length-a.length);
   if(!aliases.some(a=>new RegExp('(^|[^a-z0-9])'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9])','i').test(normalized)))continue;
   if(matches.some(m=>m.id===entry.id))continue;
   matches.push({id:entry.id,term:entry.term,status:entry.interpretations.length===1?'resolved':'ambiguous',interpretations:entry.interpretations,provenance:entry.provenance,approvalStatus:entry.status});
  }
 }
 return matches;
}
export function extractIntent(text,options={}){
 const concepts=resolve(text,options);
 return {scene:options.sceneId??'untitled',goal:text,constraints:[],references:[],concepts,blockingAmbiguities:concepts.filter(c=>c.status!=='resolved').map(c=>c.term)};
}
export function proposeSemanticContract(intent){
 return {concepts:intent.concepts.map(c=>({phrase:c.term,interpretation:c.interpretations[0]?.meaning??'',status:c.status,glossaryId:c.id})),blockingAmbiguities:intent.blockingAmbiguities};
}
