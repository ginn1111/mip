// Duplicate JSON keys are never allowed (project owner decision 2026-10-15): every read boundary uses parseStrictJson.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('glossary seed is read with duplicate keys rejected',()=>assert.match(src('packages/glossary/index.mjs'),/parseStrictJson\(readFileSync/));
test('no package, example or script parses JSON without the duplicate-key check',()=>{
 for(const p of ['packages/glossary/index.mjs','packages/prototype/review-evidence.mjs','packages/import-figma/index.mjs','packages/artifacts/approval.mjs','examples/scorpio/serve.mjs'])
  assert.doesNotMatch(src(p),/JSON\.parse\(/,p);
});
