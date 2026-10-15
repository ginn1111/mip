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
