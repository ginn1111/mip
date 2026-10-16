// Shared conformance helpers for runtime adapter tests (AGE-31). Not a *.test.mjs file.
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scorpio} from '../examples/scorpio/review.mjs';
import {reviewInstants} from '../packages/prototype/review-manifest.mjs';
import {evaluate} from '../packages/prototype/index.mjs';
import {artifactDigest,ArtifactStore} from '../packages/artifacts/index.mjs';

export const SCENARIO='select-scorpio';
// Numeric tolerance 1e-6 is an ASSUMPTION pending owner decision (docs/specs/AGE-31.md; same status as AGE-29). Not final.
export const TOLERANCE=1e-6;
export const instants=()=>reviewInstants(scorpio,SCENARIO,[]);

// Fixture only (same shape as lockedArtifact in tests/glossary.test.mjs). Production code never creates approvals or locks.
export const lockedArtifact=a=>{const h=artifactDigest(a);return {...a,lifecycle:'locked',approvals:[{actor:{role:'human',id:'reviewer'},decision:'approved',reviewedDigest:h}],lock:{digest:h,dependencyDigests:a.dependencies.map(d=>d.digest)}};};
export const prototypeArtifact=(payload=scorpio)=>({protocol:'mip/0.7',id:'scorpio-prototype',projectId:'scorpio',kind:'prototype-spec',revision:1,lifecycle:'draft',dependencies:[],payload,evidence:[],approvals:[]});
/** Store the Scorpio prototype-spec as an unlocked revision in a temp dir, read it back strictly, then lock it with the fixture pattern. */
export async function storedLockedPrototype(){
 const store=new ArtifactStore(await mkdtemp(join(tmpdir(),'mip-runtime-')));
 await store.create(prototypeArtifact());
 return lockedArtifact(await store.read('scorpio-prototype',1));
}
/** Fail closed: verification consumes only a locked, human-approved, digest-intact prototype-spec. Returns its digest. */
export function assertLockedPrototype(a){
 if(a?.kind!=='prototype-spec')throw new Error('Not a prototype-spec');
 if(a.lifecycle!=='locked')throw new Error('Prototype-spec is not locked');
 const h=artifactDigest(a);
 if(a.lock?.digest!==h)throw new Error('Prototype-spec digest mismatch');
 if(!a.approvals?.some(x=>x.decision==='approved'&&x.actor?.role==='human'&&x.reviewedDigest===h))throw new Error('Prototype-spec lacks human approval');
 return h;
}
/** Seek at every review instant; compare read(actor,prop) with evaluate(). Returns a verification-record payload (never locked) bound to the locked prototype digest. */
export function verificationRecord(name,adapter,read,prototype){
 const protoDigest=assertLockedPrototype(prototype),spec=prototype.payload;
 const checks=instants().map(t=>{
  adapter.seek(t);
  const want=evaluate(spec,SCENARIO,t).actors;
  const passed=Object.entries(want).every(([id,props])=>Object.entries(props).every(([p,v])=>Math.abs(read(id,p)-v)<=TOLERANCE));
  return {name:`${name}@${t}ms prototype=${protoDigest}`,passed};
 });
 const contract={protocol:'mip/0.7',id:'impl-'+name,projectId:'scorpio',kind:'implementation-contract',revision:1,lifecycle:'draft',dependencies:[{id:prototype.id,revision:prototype.revision,digest:protoDigest}],payload:{runtime:name,bindings:{},invariants:[`prototype-spec ${protoDigest}`]},evidence:[],approvals:[]};
 return {implementationRef:{id:contract.id,revision:1,digest:artifactDigest(contract)},checks,result:checks.every(c=>c.passed)?'pass':'fail'};
}
