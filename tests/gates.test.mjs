import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactDigest} from '../packages/artifacts/index.mjs';
import {validateGate} from '../packages/gates/index.mjs';

function lock(a){
 const h=artifactDigest(a);
 return {...a,lifecycle:'locked',approvals:[{actor:{role:'human',id:'reviewer'},decision:'approved',reviewedDigest:h}],lock:{digest:h,dependencyDigests:a.dependencies.map(d=>d.digest)}};
}
const base=(id,kind,payload,deps=[])=>({protocol:'mip/0.7',id,projectId:'demo',revision:1,kind,lifecycle:'draft',dependencies:deps,payload,evidence:[],approvals:[]});
test('rejects unresolved blocking ambiguity',async()=>{
 const i=lock(base('i','intent-profile',{goal:'globe',scene:'zodiac',constraints:[]}));
 const s=lock(base('s','semantic-contract',{concepts:[],blockingAmbiguities:['magnetic']},[{id:'i',revision:1,digest:artifactDigest(i)}]));
 const out=await validateGate('prototype',[i,s],async()=>i);
 assert.equal(out.status,'BLOCKED');
 assert.ok(out.violations.some(v=>v.code==='UNRESOLVED_AMBIGUITY'));
});
test('rejects superseded artifacts',async()=>{
 const i=lock(base('i','intent-profile',{goal:'globe',scene:'zodiac',constraints:[]}));
 const r=await validateGate('semantic',[{...i,lifecycle:'superseded'}],async()=>{});
 assert.ok(r.violations.some(v=>v.code==='SUPERSEDED'));
});
test('rejects cyclic dependencies without recursion overflow',async()=>{
 const ia=base('a','intent-profile',{goal:'x',scene:'x',constraints:[]},[{id:'b',revision:1,digest:'sha256:'+'0'.repeat(64)}]);
 const ib=base('b','intent-profile',{goal:'x',scene:'x',constraints:[]},[{id:'a',revision:1,digest:'sha256:'+'0'.repeat(64)}]);
 const a=lock(ia),b=lock(ib);
 const out=await validateGate('semantic',[a],async ref=>ref.id==='a'?a:b);
 assert.ok(out.violations.some(v=>v.code==='DEPENDENCY_CYCLE'));
});
