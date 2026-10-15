// AGE-17: canonical hashing vectors (docs/specs/AGE-17.md B1; specs/v0.7/ADR-0001-integrity.md).
// Expected canonical strings and SHA-256 values are hard-coded, derived by hand and with `sha256sum`,
// never recomputed by the code under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalize} from 'json-canonicalize';
import {digest,artifactDigest} from '../packages/artifacts/index.mjs';

const V1={input:{z:1,a:{b:2,a:1}},canonical:'{"a":{"a":1,"b":2},"z":1}',sha:'sha256:958055856bfd0cb5a18d286fca17d9a25d679082bf993b5b32d4900a86520ce4'};
const V2={input:JSON.parse('{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"literals":[null,true,false]}'),
 canonical:'{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}',sha:'sha256:f9ef8430c38ca3edd7fb96a698d14fdf39c74c63299627162d38b59af2af5abb'};
// RFC 8785 3.2.3: keys sort by UTF-16 code units: CR(0xd) < "1"(0x31) < U+0080 < o-diaeresis(0xf6) < euro(0x20ac) < emoji(0xd83d 0xde00) < dalet(0xfb33).
const V3={input:{'\u20ac':'Euro Sign','\r':'Carriage Return','\ufb33':'Hebrew Letter Dalet With Dagesh',1:'One','\u{1f600}':'Emoji: Grinning Face','\u0080':'Control','\u00f6':'Latin Small Letter O With Diaeresis'},
 canonical:'{"\\r":"Carriage Return","1":"One","\u0080":"Control","\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign","\u{1f600}":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
 sha:'sha256:5e321556d22018a9656991a9e94f77ec175fa193e52a2429d312f8419ec8b08c'};

for(const [name,v] of Object.entries({V1,V2,V3}))
 test(`${name}: canonical form and SHA-256 match the hard-coded vector`,()=>{
  assert.equal(canonicalize(v.input),v.canonical);
  assert.equal(digest(v.input),v.sha);
 });

test('V3: key insertion order does not change the digest',()=>{
 const reversed=Object.fromEntries(Object.entries(V3.input).reverse());
 assert.equal(digest(reversed),V3.sha);
});

const artifact={protocol:'mip/0.7',id:'a',projectId:'p',kind:'intent-profile',revision:1,dependencies:[],payload:{scene:'s',goal:'g',constraints:[]},evidence:[],approvals:[],lifecycle:'draft'};
test('V4: mutable governance fields do not change the artifact digest; immutable ones do',()=>{
 const base=artifactDigest(artifact);
 const human={decision:'approved',actor:{id:'h',role:'human'},timestamp:'2026-10-13T10:00:00Z',reviewedDigest:base};
 for(const change of [{lifecycle:'locked'},{approvals:[human]},{lock:{digest:base,dependencyDigests:[]}}])
  assert.equal(artifactDigest({...artifact,...change}),base,'excluded: '+Object.keys(change));
 const ref={id:'x',revision:1,digest:'sha256:'+'0'.repeat(64)};
 for(const change of [{payload:{...artifact.payload,goal:'other'}},{evidence:[{uri:'u',digest:ref.digest,mediaType:'text/plain'}]},{dependencies:[ref]},{revision:2},{id:'b'},{projectId:'q'},{kind:'semantic-contract'},{protocol:'mip/0.8'}])
  assert.notEqual(artifactDigest({...artifact,...change}),base,'included: '+Object.keys(change));
});

// V5: ADR-0001 forbids undefined, NaN, infinity and unsupported JSON values in digested content.
// Before AGE-17 these collided with null or a missing key; digest() now rejects them.
test('V5: unsupported values are rejected instead of colliding with other inputs',()=>{
 for(const [name,value] of [['NaN',{a:NaN}],['Infinity',{a:Infinity}],['-Infinity',{a:-Infinity}],['undefined',{a:undefined}],
  ['undefined in array',{a:[1,undefined]}],['function',{a:()=>1}],['symbol',{a:Symbol('s')}],['bigint',{a:1n}],
  ['Date',{a:new Date(0)}],['Map',{a:new Map()}],['nested NaN',{a:{b:[{c:NaN}]}}],['top-level undefined',undefined]])
  assert.throws(()=>digest(value),/Unsupported JSON value/,name);
 const cyclic={};cyclic.self=cyclic;
 assert.throws(()=>digest(cyclic),/Unsupported JSON value/,'cycle');
});
test('V5: plain JSON values still digest, including null, nested arrays and a shared non-cyclic reference',()=>{
 const shared={x:1};
 for(const value of [null,true,0,-0.5,'',[],{},{a:null},{a:[1,'b',{c:false}]},{p:shared,q:shared}])
  assert.match(digest(value),/^sha256:[0-9a-f]{64}$/);
 assert.equal(digest({a:null}),'sha256:'+'d091f9c83c091f79652fe8786375b3fe4ce0861a56f5bfbafedbe431877ff0e8');
});
test('V5: artifactDigest rejects an artifact with an unsupported value',()=>{
 assert.throws(()=>artifactDigest({...artifact,payload:{...artifact.payload,goal:NaN}}),/Unsupported JSON value/);
});
// Duplicate keys cannot be seen after JSON.parse (it keeps the last). Readers must not rely on
// digest() to detect them; see ADR-0002 follow-up.
test('V5 limitation: duplicate keys are invisible once parsed',()=>{
 assert.equal(digest(JSON.parse('{"a":1,"a":2}')),digest({a:2}));
});
