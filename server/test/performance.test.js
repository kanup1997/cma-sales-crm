import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let instance=0;
async function load(relative,replacements){
  let source=await readFile(new URL(relative,import.meta.url),'utf8');
  for(const [before,after] of replacements){assert.ok(source.includes(before));source=source.replace(before,after);}
  return import(`data:text/javascript;base64,${Buffer.from(source+`\n// ${instance++}`).toString('base64')}`);
}
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}});

test('auth fetches user and permissions once, with no cross-request permission cache',async()=>{
  let queries=0,allowed='PAGE_LEADS',active=1;
  globalThis.performanceTest={jwt:{verify:()=>({id:7})},queryOne:async(sql,args)=>{
    queries++;assert.ok(sql.includes('group_concat(permission)'));assert.deepEqual(args,[7]);
    return{id:7,role:'SALES',active,permissions_csv:allowed};
  }};
  const {authRequired}=await load('../src/middleware/auth.js',[
    ["import jwt from 'jsonwebtoken';",'const {jwt}=globalThis.performanceTest;'],
    ["import { queryOne } from '../db.js';",'const {queryOne}=globalThis.performanceTest;']
  ]);
  const req={headers:{authorization:'Bearer test'}};let next=0;
  await authRequired(req,response(),error=>{assert.ifError(error);next++;});
  assert.equal(queries,1);assert.deepEqual(req.user.permissions,['PAGE_LEADS']);
  assert.equal(req.user.permissions_csv,undefined);
  allowed=null;await authRequired(req,response(),error=>assert.ifError(error));
  assert.deepEqual(req.user.permissions,[]);assert.equal(queries,2);
  active=0;const denied=response();await authRequired(req,denied,()=>next++);
  assert.equal(denied.statusCode,401);assert.equal(next,1);
});

test('repeated permission checks reuse only the current request permissions',async()=>{
  let queries=0;
  globalThis.performanceTest={queryAll:async()=>{queries++;return[{permission:'PAGE_LEADS'}];}};
  const {hasPermission,requireAnyPermission}=await load('../src/permissions.js',[
    ["import {queryAll} from './db.js';",'const {queryAll}=globalThis.performanceTest;']
  ]);
  const user={id:7,role:'SALES',permissions:['PAGE_LEADS']};
  assert.equal(await hasPermission(user,'PAGE_LEADS'),true);
  assert.equal(await hasPermission(user,'PAGE_IMPORT'),false);
  let next=0;await requireAnyPermission('PAGE_IMPORT','PAGE_LEADS')({user},response(),()=>next++);
  assert.equal(next,1);assert.equal(queries,0);
  const denied=response();await requireAnyPermission('PAGE_LEADS')({user:{...user,permissions:[]}},denied,()=>next++);
  assert.equal(denied.statusCode,403);assert.equal(queries,0);
  await requireAnyPermission('PAGE_IMPORT','PAGE_LEADS')({user:{id:7,role:'SALES'}},response(),()=>next++);
  assert.equal(queries,1,'fallback checks fetch permissions only once');
});

test('dashboard starts five independent queries and preserves user scope and response shape',async()=>{
  const calls=[];let handler;
  const query=(sql,args)=>new Promise(resolve=>calls.push({sql,args,resolve}));
  globalThis.performanceTest={Router:()=>({use(){},get(path,fn){handler=fn;}}),queryAll:query,queryOne:query,authRequired(){},requirePermission:()=>()=>{},asyncHandler:fn=>fn};
  const source=await readFile(new URL('../src/routes/dashboard.js',import.meta.url),'utf8');
  await load('../src/routes/dashboard.js',[[source.split('\n')[0], 'const {Router,queryAll,queryOne,authRequired,requirePermission,asyncHandler}=globalThis.performanceTest;']]);
  const res=response(),req={query:{start:'2026-09-25',end:'2026-09-26'},user:{id:7,role:'SALES'}};
  const done=handler(req,res);
  assert.equal(calls.length,5,'all queries must start without waiting for one another');
  assert.deepEqual(calls[0].args,['2026-09-25','2026-09-26','2026-09-25','2026-09-25','2026-09-26',7]);
  for(const call of calls)assert.ok(call.sql.includes('l.assigned_to=?'));
  calls[0].resolve({total:4,notInterested:1,open:3,today:2,overdue:1,unassigned:0,samplesSent:1});
  calls[1].resolve([]);calls[2].resolve({order_value:100,payment_received:25});calls[3].resolve({count:1,value:100});calls[4].resolve([]);
  await done;
  assert.deepEqual(res.body.stats,{total:4,open:3,today:2,overdue:1,unassigned:0,notInterested:1});
  assert.equal(res.body.analytics.collection_rate,25);assert.equal(res.body.analytics.samples_sent,1);
});
