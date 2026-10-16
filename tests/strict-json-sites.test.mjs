// Duplicate JSON keys are never allowed (project owner decision 2026-10-15): every read boundary uses parseStrictJson.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('glossary seed is read with duplicate keys rejected',()=>assert.match(src('packages/glossary/index.mjs'),/parseStrictJson\(readFileSync/));
const files=dir=>readdirSync(new URL('../'+dir,import.meta.url),{withFileTypes:true}).flatMap(d=>
 d.isDirectory()?(d.name==='node_modules'?[]:files(dir+'/'+d.name)):/\.(mjs|js)$/.test(d.name)?[dir+'/'+d.name]:[]);
// ponytail: artifacts/index.mjs defines parseStrictJson itself; add a capture-web CDP exception here only if it lands.
const ALLOWED=['packages/artifacts/index.mjs'];
test('no package, example or script parses JSON without the duplicate-key check',()=>{
 const all=['packages','examples','scripts'].flatMap(d=>{try{return files(d);}catch{return [];}});
 assert.ok(all.length>10,'glob found sources');
 for(const p of all.filter(p=>!ALLOWED.includes(p)))assert.doesNotMatch(src(p),/JSON\.parse\(/,p);
});
