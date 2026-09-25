import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {leadOrderBy} from '../src/utils/leadSort.js';
import {getPagination,paginationMeta} from '../src/utils/pagination.js';

test('lead list uses one parameterized batch and retains filters, sorting and progress',async()=>{
  let handler,statements;
  const noop=()=>{};
  const multer=()=>({single:()=>noop});multer.memoryStorage=noop;
  globalThis.leadBatchTest={Router:()=>({use:noop,get(path,fn){if(path==='/')handler=fn;},post:noop,patch:noop,delete:noop}),multer,
    authRequired:noop,adminOnly:noop,requirePermission:()=>noop,asyncHandler:fn=>fn,
    getPagination,paginationMeta,leadOrderBy,
    queryBatch:async input=>{statements=input;return[[{count:1}],[{code:'NEW_LEAD'}],[{id:7,progress_codes_json:'["SAMPLE_SENT","ORDER_FINAL"]'}]];}};
  let source=await readFile(new URL('../src/routes/leads.js',import.meta.url),'utf8');
  source=source.replace(/^import .*;\r?\n/gm,'');
  source='const {Router,multer,authRequired,adminOnly,requirePermission,asyncHandler,getPagination,paginationMeta,leadOrderBy,queryBatch}=globalThis.leadBatchTest;\n'+source;
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const req={user:{id:42,role:'SALES'},query:{q:'test',status:'CONTACTED',sortBy:'created_at',sortDirection:'desc',page:'2',pageSize:'20'}};
  const res={json(data){this.body=data;}};
  await handler(req,res);
  assert.equal(statements.length,3);
  assert.equal(statements[0].args[0],42);
  assert.match(statements[0].sql,/l.assigned_to = \?/);
  assert.ok(statements[0].args.includes('%test%'));assert.ok(statements[0].args.includes('CONTACTED'));
  assert.deepEqual(statements[2].args.slice(-2),[20,20]);
  assert.match(statements[2].sql,/julianday\(l.created_at\) DESC/);
  assert.deepEqual(res.body.leads[0].progress_codes,['SAMPLE_SENT','ORDER_FINAL']);
  assert.equal(res.body.leads[0].progress_codes_json,undefined);
  assert.equal(res.body.pagination.page,2);assert.deepEqual(res.body.statuses,['NEW_LEAD']);
});
