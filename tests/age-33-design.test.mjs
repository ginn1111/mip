import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const doc=await readFile(new URL('../docs/design/AGE-33.md',import.meta.url),'utf8');
const TOOLS=['get_status','resolve_glossary','create_intent','validate_artifact','validate_gate','create_prototype','get_preview','request_review','lock_artifact','verify_implementation'];

test('AGE-33 design: frontmatter at byte 0',()=>assert.match(doc,/^---\nstatus: \w+\nscope: .+\nowner: .+\n---\n/));
test('AGE-33 design: one section per RFC 0005 tool with required fields',()=>{
 for(const [i,tool] of TOOLS.entries()){
  const m=new RegExp('^### 3\\.'+(i+1)+' '+tool+'\\n([\\s\\S]*?)(?=^### |^## )','m').exec(doc);
  assert.ok(m,'missing section '+tool);
  for(const field of ['Input','Output','Core','Errors'])assert.ok(m[1].includes('- '+field),tool+' lacks '+field);
 }
});
test('AGE-33 design: lock_artifact only refuses; no approving tool',()=>{
 const m=/^### 3\.9 lock_artifact\n([\s\S]*?)(?=^### |^## )/m.exec(doc)[1];
 assert.match(m,/APPROVAL_REFUSED/);
 assert.match(m,/creates no `\.lock` sidecar/);
 assert.doesNotMatch(doc,/^### \d+\.\d+ (approve|lock_and_approve)/m);
});
test('AGE-33 design: mip/0.7, parseStrictJson, open questions listed',()=>{
 assert.ok(doc.includes('mip/0.7')&&doc.includes('parseStrictJson'));
 assert.ok((doc.match(/^- Q\d+ /gm)??[]).length>=1);
 assert.ok(doc.includes('Q2 Transport'));
});
test('AGE-33 design: common error list covers every tool code; no gate-code clash',()=>{
 const common=/^Common error codes: (.*)$/m.exec(doc)[1];
 for(const c of ['NOT_FOUND','INVALID_PROTOTYPE','PREVIEW_UNAVAILABLE','REVIEW_UNSUPPORTED','NO_SEMANTIC_CONTRACT'])assert.ok(common.includes('`'+c+'`'),c+' not in common list');
 assert.doesNotMatch(doc,/MISSING_DEPENDENCY.*\(no semantic-contract\)/);
 assert.doesNotMatch(doc,/unknown artifact -> `NOT_FOUND`/);
});
test('AGE-33 design: forged-artifact claim corrected and raised as open question',()=>{
 assert.doesNotMatch(doc,/cannot pass `validateGate` without a valid human approval/);
 assert.match(doc,/self-written `intent-profile`/);
 assert.match(doc,/^- Q13 .*non-creative approval/m);
});
test('AGE-33 design: lock refusal returns reviewerUrl; create_prototype input; mip.get_status',()=>{
 const lock=/^### 3\.9 lock_artifact\n([\s\S]*?)(?=^### )/m.exec(doc)[1];
 assert.match(lock,/reviewerUrl/);
 const proto=/^### 3\.6 create_prototype\n([\s\S]*?)(?=^### )/m.exec(doc)[1];
 assert.match(proto,/`fps`/);assert.match(proto,/`storyboard`/);
 assert.match(doc,/^### 3\.1 get_status\n[\s\S]*?`mip\.get_status`/m);
});
