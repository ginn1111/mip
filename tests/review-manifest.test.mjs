import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedEvidence,reviewInstants,reviewManifest,FRAME_MANIFEST_MEDIA_TYPE} from '../packages/prototype/review-manifest.mjs';

const prototype=(over={})=>({id:'proto',revision:2,payload:{durationMs:3000,fps:30,actors:[{id:'globe',initialProperties:{rotation:0}}],states:[{id:'idle'}],transitions:[],
 tracks:[{actorId:'globe',property:'rotation',keyframes:[{timeMs:0,value:0},{timeMs:3000,value:90,easing:'ease-in-out'}]}],
 storyboard:[{timeMs:500,label:'a'},{timeMs:9000,label:'outside'}],
 scenarios:[{id:'a',initialState:'idle',events:[]},{id:'b',initialState:'idle',events:[]}],
 reviewSegments:[{id:'s1',startMs:0,endMs:1000,scenarioIds:['a']},{id:'s2',startMs:1000,endMs:3000,scenarioIds:['a','b']}],...over}});
const reviews=(t=1500)=>[{scenarioId:'a',accepted:true,segmentReviews:[{segmentId:'s2',accepted:true,comments:[{timeMs:t,text:'x'},{timeMs:1000,text:'dup'}]}]},
 {scenarioId:'b',accepted:true,segmentReviews:[{segmentId:'s2',accepted:true,comments:[{timeMs:2222,text:'y'}]}]}];

test('instants: bounds, in-range storyboard, own segments and comments, sorted and unique',()=>{
 const spec=prototype().payload;
 assert.deepEqual(reviewInstants(spec,'a',reviews()),[0,500,1000,1500,3000]);
 assert.deepEqual(reviewInstants(spec,'b',reviews()),[0,500,1000,2222,3000]);
 assert.deepEqual(reviewInstants(spec,'b',[]),[0,500,1000,3000]);
});

test('manifest frames are rounded to 6 decimals',()=>{
 const m=reviewManifest(prototype().payload,'a',[1500]);
 assert.equal(m.frames[0].animation.globe.rotation,Math.round(m.frames[0].animation.globe.rotation*1e6)/1e6);
});

test('evidence is deterministic, key-order invariant, one entry per scenario in order',()=>{
 const p=prototype(),e=expectedEvidence(p,reviews());
 assert.deepEqual(e,expectedEvidence(prototype(),reviews()));
 const reordered={revision:2,id:'proto',payload:Object.fromEntries(Object.entries(p.payload).reverse())};
 assert.deepEqual(expectedEvidence(reordered,reviews()),e);
 assert.deepEqual(e.map(x=>x.uri),['mip:frame-manifest/proto@2/a','mip:frame-manifest/proto@2/b']);
 assert.ok(e.every(x=>x.mediaType===FRAME_MANIFEST_MEDIA_TYPE&&/^sha256:[0-9a-f]{64}$/.test(x.digest)));
});

test('comment instant and animation parameter change the digest',()=>{
 const base=expectedEvidence(prototype(),reviews());
 const moved=expectedEvidence(prototype(),reviews(1600));
 assert.notEqual(moved[0].digest,base[0].digest);
 assert.equal(moved[1].digest,base[1].digest);
 const tracks=[{actorId:'globe',property:'rotation',keyframes:[{timeMs:0,value:0},{timeMs:3000,value:91,easing:'ease-in-out'}]}];
 assert.notEqual(expectedEvidence(prototype({tracks}),reviews())[0].digest,base[0].digest);
});
