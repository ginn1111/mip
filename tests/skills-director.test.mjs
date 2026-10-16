// AGE-28: mip-director and mip-glossary skills (docs/specs/AGE-28.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(fileURLToPath(new URL(p,root)),'utf8');
const skills=['mip-director','mip-glossary'];

function frontmatter(text){
 const m=/^---\n([\s\S]*?)\n---\n/.exec(text);
 assert.ok(m,'frontmatter at byte 0');
 return Object.fromEntries(m[1].split('\n').map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
}

for(const name of skills){
 test(`${name}: valid frontmatter (B1)`,()=>{
  const fm=frontmatter(read(`skills/${name}/SKILL.md`));
  assert.equal(fm.name,name);
  assert.ok(fm.description.length>0);
 });
 test(`${name}: no-self-approval rule (B5)`,()=>{
  const t=read(`skills/${name}/SKILL.md`);
  assert.match(t,/never approve/i);
  assert.match(t,/never[^.\n]*\block/i);
  assert.match(t,/web reviewer/i);
 });
}

test('mip-director: gate-check instruction before consuming artifacts (B2)',()=>{
 const t=read('skills/mip-director/SKILL.md');
 assert.match(t,/mip validate --phase <phase>/);
 assert.match(t,/BLOCKED/);
 for(const phase of ['intent','semantic','prototype','implementation','verification'])assert.match(t,new RegExp(phase,'i'));
});

test('mip-glossary: gate-check instruction and statuses (B2, B4)',()=>{
 const t=read('skills/mip-glossary/SKILL.md');
 assert.match(t,/mip validate --phase <phase>/);
 for(const s of ['resolved','ambiguous','unknown'])assert.match(t,new RegExp('`'+s+'`'));
 assert.match(t,/GOVERNANCE\.md/);
 assert.match(t,/never guess/i);
});

test('mip-director maps every violation code emitted by the gate engine (B3)',()=>{
 const src=read('packages/gates/index.mjs');
 const codes=[...new Set([...src.matchAll(/\bcode\s*:\s*['"`]([A-Z_]+)/g)].map(m=>m[1]))];
 assert.ok(codes.length>=19,'extraction found the codes');
 const rows=new Map(read('skills/mip-director/SKILL.md').split('\n')
  .map(l=>/^\|\s*`([A-Z_]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(l)).filter(Boolean).map(m=>[m[1],m[2]]));
 const missing=codes.filter(c=>!rows.get(c));
 assert.deepEqual(missing,[],'unmapped gate codes: '+missing.join(', '));
});

test('mip-director: gate phases, exit codes, no intent gate',()=>{
 const t=read('skills/mip-director/SKILL.md');
 assert.match(t,/semantic\|prototype\|implementation\|verification\|complete/);
 assert.match(t,/no `intent` gate/i);
 assert.match(t,/\| complete \|/);
 assert.match(t,/Exit 1 is usage/i);
 assert.doesNotMatch(read('skills/mip-director/SKILL.md').split('\n')[2],/phases intent,/);
});

test('mip-director: recovery nits',()=>{
 const t=read('skills/mip-director/SKILL.md');
 assert.match(t,/`DIGEST_MISMATCH` \| [^\n]*if `NOT_LOCKED` is also listed, handle that first/i);
 assert.doesNotMatch(t,/mip preview(?! --scene)/);
 assert.match(t,/no reviewer yet[^\n]*stop and ask the human/i);
});

test('walkthrough owner is gintary',()=>{
 assert.equal(frontmatter(read('docs/walkthroughs/AGE-28.md')).owner,'gintary');
});
