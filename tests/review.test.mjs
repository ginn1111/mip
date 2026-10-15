import test from 'node:test';import assert from 'node:assert/strict';import {scorpio,scorpioFrame,commentAt} from '../examples/scorpio/review.mjs';
test('storyboard and animation views are synchronized',()=>{const f=scorpioFrame(2200);assert.equal(f.storyboard.caption,'Rotate toward Scorpio');assert.ok(f.animation.globe.rotation>0);assert.equal(f.timeMs,2200);});
test('absolute-time scrub is reproducible',()=>{const a=scorpioFrame(3600);scorpioFrame(4500);assert.deepEqual(a,scorpioFrame(3600));});
test('review comment preserves exact scenario and instant',()=>{const c=commentAt(2200,'Rotation feels abrupt','designer-1');assert.equal(c.timeMs,2200);assert.equal(c.scenarioId,'select-scorpio');assert.throws(()=>commentAt(2200,'', 'designer-1'),/comment required/);});
