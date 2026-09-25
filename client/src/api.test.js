import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let instance=0;
async function setup(){
  const source=(await readFile(new URL('./api.js',import.meta.url),'utf8')).replace('import.meta.env.VITE_API_BASE',"'http://test/api'");
  const calls=[],events=[];
  let token='user-a';
  globalThis.localStorage={getItem:()=>token};
  globalThis.window=new EventTarget();
  for(const type of ['api:start','api:end','app:success','masters:changed'])window.addEventListener(type,()=>events.push(type));
  globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve:(data={},ok=true)=>resolve({ok,json:async()=>data}),reject}));
  const {api}=await import(`data:text/javascript;base64,${Buffer.from(source+`\n// instance ${instance++}`).toString('base64')}`);
  return{api,calls,events,setToken:value=>{token=value;}};
}

test('concurrent identical reads share one fetch and one loader lifecycle',async()=>{
  const {api,calls,events}=await setup();
  const first=api('/leads?page=1'),second=api('/leads?page=1');
  assert.equal(first,second);
  assert.equal(calls.length,1);
  calls[0].resolve({leads:[{id:1}]});
  assert.deepEqual(await first,await second);
  assert.deepEqual(events,['api:start','api:end']);
  const refresh=api('/leads?page=1');
  assert.equal(calls.length,2);
  calls[1].resolve({leads:[{id:2}]});
  assert.equal((await refresh).leads[0].id,2);
});

test('different filters, headers and login sessions never share reads',async()=>{
  const {api,calls,setToken}=await setup();
  const requests=[api('/leads?page=1'),api('/leads?page=2'),api('/leads?page=1',{headers:{Accept:'text/plain'}})];
  setToken('user-b');requests.push(api('/leads?page=1'));
  assert.equal(calls.length,4);
  assert.equal(calls[0].options.headers.get('Authorization'),'Bearer user-a');
  assert.equal(calls[3].options.headers.get('Authorization'),'Bearer user-b');
  calls.forEach(call=>call.resolve());await Promise.all(requests);
});

test('failed reads can retry and always release the loader',async()=>{
  const {api,calls,events}=await setup();
  const first=api('/leads'),duplicate=api('/leads');
  const failures=Promise.allSettled([first,duplicate]);
  calls[0].reject(new Error('offline'));
  assert.ok((await failures).every(result=>result.status==='rejected'));
  const retry=api('/leads');calls[1].resolve({message:'Forbidden'},false);
  await assert.rejects(retry,/Forbidden/);
  const recovery=api('/leads');calls[2].resolve();await recovery;
  assert.equal(events.filter(event=>event==='api:start').length,3);
  assert.equal(events.filter(event=>event==='api:end').length,3);
});

test('writes are independent and post-save reads cannot reuse pre-save requests',async()=>{
  const {api,calls}=await setup();
  const before=api('/leads');
  const write=api('/leads',{method:'POST',body:'{}',silent:true});
  const anotherWrite=api('/leads',{method:'POST',body:'{}',silent:true});
  assert.equal(calls.length,3);
  calls[1].resolve();calls[2].resolve();await Promise.all([write,anotherWrite]);
  const after=api('/leads');assert.equal(calls.length,4);
  calls[0].resolve({version:'old'});await before;
  assert.equal(api('/leads'),after,'old request cleanup must not remove the new pending request');
  calls[3].resolve({version:'new'});assert.equal((await after).version,'new');
});

test('individually abortable requests are not shared',async()=>{
  const {api,calls}=await setup();
  const controller=new AbortController();
  const first=api('/leads',{signal:controller.signal}),second=api('/leads');
  assert.equal(calls.length,2);
  const failed=assert.rejects(first,/aborted/);
  calls[0].reject(new Error('aborted'));calls[1].resolve({ok:true});
  await failed;assert.equal((await second).ok,true);
});

test('master change subscribers share a fresh request after a write',async()=>{
  const {api,calls}=await setup();
  const old=api('/masters/options');
  let first,second;
  window.addEventListener('masters:changed',()=>{first=api('/masters/options');});
  window.addEventListener('masters:changed',()=>{second=api('/masters/options');});
  const write=api('/masters/1',{method:'PATCH',body:'{}'});
  calls[1].resolve();await write;
  assert.equal(calls.length,3);assert.equal(first,second);
  assert.equal(api('/masters/options'),first);
  calls[0].resolve();calls[2].resolve();await Promise.all([old,first]);
});
