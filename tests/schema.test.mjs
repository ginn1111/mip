import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {canonicalize} from 'json-canonicalize';
import {createHash} from 'node:crypto';

const base='schemas/v0.7/';
const load=name=>JSON.parse(readFileSync(base+name+'.schema.json','utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});
addFormats(ajv);
const artifact=ajv.compile(load('artifact'));
const message=ajv.compile(load('message'));
const glossary=ajv.compile(load('glossary'));
const payload=ajv.compile(load('payload'));
const hash=value=>'sha256:'+createHash('sha256').update(canonicalize(value),'utf8').digest('hex');
const digest=hash({example:1});
const human={id:'designer',role:'human'};
const core={protocol:'mip/0.7',id:'scorpio-intent',projectId:'zodiac',kind:'intent-profile',revision:1,lifecycle:'draft',dependencies:[],payload:{scene:'scorpio',goal:'cinematic reveal',constraints:[]},evidence:[],approvals:[]};

test('valid draft artifact',()=>assert.equal(artifact(core),true,JSON.stringify(artifact.errors)));
test('reject unsupported protocol',()=>assert.equal(artifact({...core,protocol:'mip/9'}),false));
test('reject locked artifact without lock and human approval',()=>assert.equal(artifact({...core,lifecycle:'locked'}),false));
test('accept structural locked artifact with human approval',()=>{
 const locked={...core,lifecycle:'locked',approvals:[{decision:'approved',actor:human,timestamp:'2026-10-13T10:00:00Z',reviewedDigest:digest}],lock:{digest,timestamp:'2026-10-13T10:01:00Z',dependencyDigests:[]}};
 assert.equal(artifact(locked),true,JSON.stringify(artifact.errors));
});
test('valid/invalid messages',()=>{
 const m={protocol:'mip/0.7',messageId:'m1',sessionId:'s',actor:human,type:'INTENT',artifactRefs:[],payload:{text:'organic'},timestamp:'2026-10-13T10:00:00Z'};
 assert.equal(message(m),true,JSON.stringify(message.errors));
 assert.equal(message({...m,type:'IMAGINARY'}),false);
});
test('valid glossary and rejection of missing definition',()=>{
 const g={id:'motion.organic',revision:1,term:'organic',domain:'motion',definition:'natural-feeling movement',aliases:['fluid'],interpretations:[{id:'fluid',context:['3d'],meaning:'smooth motion',motionHints:['gentle easing']}],provenance:{source:'project'},status:'approved'};
 assert.equal(glossary(g),true,JSON.stringify(glossary.errors));
 assert.equal(glossary({...g,definition:''}),false);
});
test('six phase payload variants',()=>{
 const fixtures=[
 ['intent-profile',{scene:'scorpio',goal:'discovery',constraints:[]}],
 ['semantic-contract',{concepts:[],blockingAmbiguities:[]}],
 ['prototype-spec',{durationMs:5000,fps:30,actors:[],states:[],transitions:[],tracks:[],storyboard:[],scenarios:[]}],
 ['prototype-review',{prototypeRef:{id:'proto',revision:1,digest},scenarioReviews:[],decision:'approved'}],
 ['implementation-contract',{runtime:'r3f',bindings:{},invariants:[]}],
 ['verification-record',{implementationRef:{id:'impl',revision:1,digest},checks:[],result:'pass'}]
 ];
 for(const [kind,data] of fixtures) assert.equal(payload({kind,payload:data}),true,kind+JSON.stringify(payload.errors));
 assert.equal(payload({kind:'semantic-contract',payload:{concepts:[],blockingAmbiguities:['magnetic']}}),false);
});
test('canonicalization and digest invariants',()=>{
 const a={z:1,a:{b:2,a:1}},b={a:{a:1,b:2},z:1};
 const canonical='{"a":{"a":1,"b":2},"z":1}';
 assert.equal(canonicalize(a),canonical);
 assert.equal(hash(a),hash(b));
 assert.equal(hash(a),'sha256:'+createHash('sha256').update(canonical,'utf8').digest('hex'));
 assert.notEqual(hash(a),hash({...a,z:2}));
});
test('metadata excluded from content digest',()=>{
 const material=x=>Object.fromEntries(['protocol','id','projectId','kind','revision','dependencies','payload','evidence'].map(k=>[k,x[k]]));
 assert.equal(hash(material(core)),hash(material({...core,lifecycle:'locked',approvals:[{decision:'approved'}],lock:{digest}})));
 assert.notEqual(hash(material(core)),hash(material({...core,payload:{goal:'changed'}})));
});
