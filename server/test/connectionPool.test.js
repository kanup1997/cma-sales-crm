import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionPool} from '../src/utils/connectionPool.js';

test('uses an idle connection while another is busy',async()=>{
  let id=0;const pool=createConnectionPool(()=>({id:++id}),2);
  const busy=await pool.acquire(),other=await pool.acquire();
  other.release();
  const next=await pool.acquire();
  assert.equal(next.connection.id,other.connection.id);
  assert.notEqual(next.connection.id,busy.connection.id);
  busy.release();next.release();
});
test('bounded pool serves waiting work in order without double release',async()=>{
  const pool=createConnectionPool(()=>({}),1),first=await pool.acquire();
  let thirdReady=false;
  const secondRequest=pool.acquire(),thirdRequest=pool.acquire().then(lease=>{thirdReady=true;return lease;});
  first.release();first.release();
  const second=await secondRequest;assert.equal(thirdReady,false);
  second.release();const third=await thirdRequest;third.release();
});
test('failed connection replacement does not change another active connection',async()=>{
  let id=0;const pool=createConnectionPool(()=>({id:++id}),2);
  const first=await pool.acquire(),second=await pool.acquire();
  first.reset();assert.equal(first.connection.id,3);assert.equal(second.connection.id,2);
  first.release();second.release();
});
