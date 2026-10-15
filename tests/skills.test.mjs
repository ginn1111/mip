import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {parseStrictJson} from '../packages/artifacts/index.mjs';
import {validatePrototype,evaluate} from '../packages/prototype/index.mjs';
import {planValid} from '../packages/prototype/review-rules.mjs';
import {reviewInstants,reviewManifest} from '../packages/prototype/review-manifest.mjs';

const read=p=>readFileSync(p,'utf8');
const example=()=>parseStrictJson(read('skills/mip-prototype/example.prototype.json'));
const skills=['mip-prototype','mip-verify'];

test('SKILL.md frontmatter: name equals directory, non-empty description (B1)',()=>{
 for(const name of skills){
  const m=/^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(read(`skills/${name}/SKILL.md`));
  assert.ok(m,name);assert.equal(m[1],name);assert.ok(m[2].trim());
 }
});

test('example passes validatePrototype and planValid (B3)',()=>{
 assert.equal(validatePrototype(example()),true);
 assert.equal(planValid(example()),true);
});

test('example fails the check when invalid (B5 mutation)',()=>{
 assert.throws(()=>validatePrototype({...example(),durationMs:0}));
 assert.equal(planValid({...example(),reviewSegments:[]}),false);
});

test('every storyboard instant of every scenario evaluates identically twice (B5)',()=>{
 const spec=example();
 for(const {id} of spec.scenarios)for(const {timeMs} of spec.storyboard)
  assert.deepEqual(evaluate(spec,id,timeMs),evaluate(structuredClone(spec),id,timeMs));
});

test('example payload matches the prototype-spec schema',()=>{
 const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
 const v=ajv.compile(JSON.parse(read('schemas/v0.7/payload.schema.json')));
 const art={kind:'prototype-spec',payload:example()};
 assert.equal(v(art),true,JSON.stringify(v.errors));
});

test('verification-record shape from the frame manifest is schema-valid',()=>{
 const spec=example(),checks=[];
 for(const {id} of spec.scenarios){
  const m=reviewManifest(spec,id,reviewInstants(spec,id,[]));
  for(const f of m.frames)checks.push({name:`${id}@${f.timeMs}`,passed:evaluate(spec,id,f.timeMs).state===f.snapshot.state});
 }
 const payload={implementationRef:{id:'impl',revision:1,digest:'sha256:'+'a'.repeat(64)},checks,result:checks.every(c=>c.passed)?'pass':'fail'};
 const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
 const v=ajv.compile(JSON.parse(read('schemas/v0.7/payload.schema.json')));
 assert.ok(checks.length>0);
 assert.equal(v({kind:'verification-record',payload}),true,JSON.stringify(v.errors));
});

test('skills carry the no-self-approval rule and never instruct approving or locking (B2, B4)',()=>{
 for(const name of skills){
  const text=read(`skills/${name}/SKILL.md`);
  assert.match(text,/never approves and never locks/i,name);
  assert.match(text,/web reviewer/i,name);
  // imperative approve/lock/sign off at line or sentence start, or after "and"/"then"
  assert.doesNotMatch(text,/(^|[.:;]\s+|\b(and|then)\s+)[-\d.\s]*(approve|lock|sign off)\b/im,name+': instructs approve/lock');
  assert.doesNotMatch(text,/^[-\d.\s]*(run\s+)?`?mip lock\b/im,name+': instructs mip lock');
 }
});

test('mip-prototype covers its APIs and handoff; mip-verify covers manifest and record keys',()=>{
 const p=read('skills/mip-prototype/SKILL.md'),v=read('skills/mip-verify/SKILL.md');
 for(const s of ['validatePrototype','evaluate(','mip preview','planValid'])assert.ok(p.includes(s),s);
 for(const s of ['review-manifest.mjs','implementationRef','checks','result','parseStrictJson'])assert.ok(v.includes(s),s);
});
