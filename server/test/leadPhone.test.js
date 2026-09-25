import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phoneKey,isDuplicatePhoneError} from '../src/utils/leadPhone.js';

test('Indian local and country-code formats have the same key',()=>{
  for(const phone of ['9876543210','+91 98765-43210','(09876543210)','0091 9876543210',9876543210])assert.equal(phoneKey(phone),'9876543210');
});
test('empty numbers are optional; different international numbers stay distinct',()=>{
  for(const phone of [null,undefined,'','  '])assert.equal(phoneKey(phone),'');
  assert.equal(phoneKey('+1 (202) 555-0123'),phoneKey('0012025550123'));
  assert.notEqual(phoneKey('+44 9876543210'),phoneKey('9876543210'));
});
test('only duplicate phone constraints become duplicate-lead errors',()=>{
  assert.ok(isDuplicatePhoneError(new Error('SQLITE_CONSTRAINT: DUPLICATE_LEAD_PHONE')));
  assert.equal(isDuplicatePhoneError(new Error('network unavailable')),false);
});
