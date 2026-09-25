import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestTiming,timeDatabase,databaseLabel} from '../src/utils/requestTiming.js';

function response(){return{headers:{},setHeader(key,value){this.headers[key]=value;},end(value){return value;}};}

test('query timing keeps concurrent requests isolated and preserves the response',async()=>{
  const first=response(),second=response();
  const one=new Promise(resolve=>requestTiming({},first,()=>resolve(timeDatabase('lead-list',async()=>{await new Promise(done=>setTimeout(done,15));return 1;}))));
  const two=new Promise(resolve=>requestTiming({},second,()=>resolve(timeDatabase('auth-users',async()=>2))));
  assert.deepEqual(await Promise.all([one,two]),[1,2]);
  assert.equal(first.end('ok'),'ok');second.end();
  assert.match(first.headers['Server-Timing'],/desc="lead-list"/);
  assert.doesNotMatch(first.headers['Server-Timing'],/auth-users/);
  assert.match(second.headers['Server-Timing'],/desc="auth-users"/);
  assert.doesNotMatch(second.headers['Server-Timing'],/lead-list/);
});
test('errors propagate and background work still runs without a request',async()=>{
  assert.equal(await timeDatabase('database',async()=>7),7);
  const res=response();
  const work=new Promise((resolve,reject)=>requestTiming({},res,()=>timeDatabase('database',async()=>{throw new Error('failed');}).then(resolve,reject)));
  await assert.rejects(work,/failed/);res.end();
  assert.match(res.headers['Server-Timing'],/desc="database"/);
  assert.equal(databaseLabel("SELECT * FROM leads WHERE phone='private'"),'lead-list');
});
