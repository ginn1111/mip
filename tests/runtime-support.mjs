// Shared conformance helpers for runtime adapter tests (AGE-31). Not a *.test.mjs file.
import {scorpio} from '../examples/scorpio/review.mjs';
import {reviewInstants} from '../packages/prototype/review-manifest.mjs';
import {evaluate} from '../packages/prototype/index.mjs';
import {artifactDigest} from '../packages/artifacts/index.mjs';

export const SCENARIO='select-scorpio';
export const instants=()=>reviewInstants(scorpio,SCENARIO,[]);
/** Seek at every review instant; compare read(actor,prop) with evaluate(). Returns a verification-record payload (never locked). */
export function verificationRecord(name,adapter,read,spec=scorpio,scenarioId=SCENARIO){
 const checks=instants().map(t=>{
  adapter.seek(t);
  const want=evaluate(spec,scenarioId,t).actors;
  const passed=Object.entries(want).every(([id,props])=>Object.entries(props).every(([p,v])=>Math.abs(read(id,p)-v)<=1e-6));
  return {name:`${name}@${t}ms`,passed};
 });
 const contract={protocol:'mip/0.7',id:'impl-'+name,projectId:'scorpio',kind:'implementation-contract',revision:1,lifecycle:'draft',dependencies:[],payload:{runtime:name,bindings:{},invariants:[]},evidence:[],approvals:[]};
 return {implementationRef:{id:contract.id,revision:1,digest:artifactDigest(contract)},checks,result:checks.every(c=>c.passed)?'pass':'fail'};
}
