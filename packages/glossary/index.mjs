import {readFileSync} from 'node:fs';
import {parseStrictJson} from '../artifacts/index.mjs';
const terms=parseStrictJson(readFileSync(new URL('../../glossary/core/seed.json', import.meta.url),'utf8'));
export function glossary(){return structuredClone(terms);}
const normalize=s=>String(s).normalize('NFC').toLocaleLowerCase('en-US');
const tokens=s=>normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** One token key for `known` and dedupe: same rule as `contains`. */
const tokenKey=s=>tokens(s).join(' ');
const contains=(haystack,needle)=>{
 const t=tokens(needle),words=tokens(haystack);
 return words.some((_,i)=>t.every((x,j)=>words[i+j]===x));
};
/** `candidates`: phrases the caller extracted. One that names no entry is `unknown`, never silently promoted (RFC 0002). */
export function resolve(text,{project=[],scene=[],domain=[],candidates=[]}={}){
 const matches=[];
 for(const layer of [scene,project,domain,terms]){
  for(const entry of layer){
   if(![entry.term,...entry.aliases].some(alias=>contains(text,alias)))continue;
   if(matches.some(m=>m.id===entry.id))continue;
   const ambiguous=entry.interpretations.length!==1 || entry.term==='magnetic' && layer===terms;
   matches.push({id:entry.id,term:entry.term,status:ambiguous?'ambiguous':'resolved',
     interpretations:structuredClone(entry.interpretations),provenance:entry.provenance,approvalStatus:entry.status});
  }
 }
 if(!Array.isArray(candidates))throw new TypeError('candidates must be an array of strings');
 const bad=candidates.findIndex(c=>typeof c!=='string');
 if(bad>=0)throw new TypeError(`candidates[${bad}] must be a string`);
 const known=new Set([...scene,...project,...domain,...terms].flatMap(e=>[e.term,...e.aliases].map(tokenKey)));
 const seen=new Set();
 for(const c of candidates){
  const key=tokenKey(c);
  if(!key||known.has(key)||seen.has(key))continue;
  seen.add(key);
  matches.push({term:c.trim(),status:'unknown',interpretations:[],provenance:null,approvalStatus:null});
 }
 return matches;
}
export function extractIntent(text,options={}){
 const concepts=resolve(text,options);
 return {scene:options.sceneId??'untitled',goal:text,constraints:[],references:[],
   concepts,blockingAmbiguities:concepts.filter(c=>c.status!=='resolved').map(c=>c.term)};
}
export function proposeSemanticContract(intent){
 return {concepts:intent.concepts.map(c=>({phrase:c.term,
   interpretation:c.status==='resolved'?(c.interpretations[0]?.meaning??''):'',
   status:c.status,...(c.id?{glossaryId:c.id}:{})})),blockingAmbiguities:intent.blockingAmbiguities};
}
export function reviewSemanticContract(contract,{decisions=[],actorId,reviewedDigest}={}){
 if(!actorId || !reviewedDigest) throw new Error('Authenticated human identity and reviewed artifact digest required');
 const resolved=structuredClone(contract);
 for(const decision of decisions){
  const concept=resolved.concepts.find(c=>c.phrase===decision.phrase);
  if(!concept)throw new Error('Unknown phrase: '+decision.phrase);
  if(!decision.interpretation?.trim())throw new Error('Interpretation is required');
  concept.interpretation=decision.interpretation;
  concept.status='resolved';
 }
 resolved.blockingAmbiguities=resolved.concepts.filter(c=>c.status!=='resolved').map(c=>c.phrase);
 return {contract:resolved,review:{actorId,reviewedDigest,decision:resolved.blockingAmbiguities.length?'changes_requested':'proposed_for_approval'}};
}
