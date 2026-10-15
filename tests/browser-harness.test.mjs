import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launch,sleep,stopProcess} from './browser-harness.mjs';
import {spawn} from 'node:child_process';

const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

async function fakeChrome(dir,body){
 const bin=join(dir,'fake-chrome.sh'),pidFile=join(dir,'pid');
 await writeFile(bin,`#!/bin/sh\necho $$ > ${pidFile}\n${body}\n`);await chmod(bin,0o755);
 return {bin,pid:async()=>Number((await readFile(pidFile,'utf8')).trim())};
}

test('harness: a Chrome that never becomes ready fails fast and is not left running',{timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-fake-'));
 try{
  const fake=await fakeChrome(dir,'exec sleep 120');
  const started=Date.now();
  await assert.rejects(()=>launch({chromeBin:fake.bin,startTimeoutMs:400}),/Timed out waiting for DevToolsActivePort/);
  assert.ok(Date.now()-started<8000,'fails within the configured budget, not minutes later');
  const pid=await fake.pid();
  for(let i=0;i<40&&alive(pid);i++)await sleep(50);
  assert.equal(alive(pid),false,'the failed launch must not leak a Chrome process');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('harness: a Chrome that ignores SIGTERM is still killed',{timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mip-fake-'));
 try{
  const fake=await fakeChrome(dir,"trap '' TERM\nwhile true; do sleep 1; done");
  await assert.rejects(()=>launch({chromeBin:fake.bin,startTimeoutMs:400}),/Timed out/);
  const pid=await fake.pid();
  for(let i=0;i<80&&alive(pid);i++)await sleep(50);
  assert.equal(alive(pid),false,'SIGKILL fallback must end a stubborn process');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('harness: stopProcess is a no-op for a process that already exited',async()=>{
 const p=spawn(process.execPath,['-e','0'],{stdio:'ignore'});await new Promise(r=>p.once('exit',r));
 await stopProcess(p);
});
