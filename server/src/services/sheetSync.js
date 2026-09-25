import crypto from 'crypto';
import * as XLSX from 'xlsx';
import {db,queryAll,run} from '../db.js';
import {normalizeEmail,normalizeHeader,normalizePhone,normalizeQuantityRange,parseAmount,parseQuantity} from './leadData.js';
import {notifyLeadAssigned} from './leadNotifications.js';
import {phoneKey,isDuplicatePhoneError} from '../utils/leadPhone.js';

export const fields=[
  {key:'contactName',label:'Contact Name',required:true,aliases:['name','full name','customer name','contact name','lead name']},
  {key:'email',label:'Email',aliases:['email','email address','e-mail']},
  {key:'phone',label:'Phone',aliases:['phone','phone number','mobile','mobile number','contact','contact number']},
  {key:'companyName',label:'Company',aliases:['company','company name','business','business name']},
  {key:'quantity',label:'Quantity',aliases:['quantity','qty','required quantity']},
  {key:'boxSize',label:'Box Size',aliases:['box size','box','size','pack size']},
  {key:'requirement',label:'Message / Requirement',aliases:['message','requirement','requirements','query','notes','description']},
  {key:'date',label:'Lead Date',aliases:['date','created time','created at','timestamp','lead date','submission time']},
  {key:'city',label:'City',aliases:['city','location']},
  {key:'perBoxBudget',label:'Per Box Budget',aliases:['budget','per box budget','price','target price']}
];

const normalize=normalizeHeader;
const canonicalHeaders={contactName:'Name',email:'Email',phone:'Phone',companyName:'Company',quantity:'Quantity',boxSize:'Box Size',requirement:'Message',date:'Date',city:'City',perBoxBudget:'Budget'};
export function cleanDetectedHeader(value){
  const raw=String(value??'').split(/\r?\n/)[0].trim();
  if(!raw)return'';
  const normalized=normalize(raw);
  for(const field of fields){
    const aliases=[...field.aliases].sort((a,b)=>normalize(b).length-normalize(a).length);
    if(aliases.some(alias=>normalized===normalize(alias)||normalized.startsWith(`${normalize(alias)} `)))return canonicalHeaders[field.key]||field.label;
  }
  return raw;
}
export function parseSheetUrl(value){const url=String(value||'').trim();const id=url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];if(!id)throw new Error('Valid Google Sheet URL required');const gid=url.match(/[?#&]gid=(\d+)/)?.[1]||'0';return{url,id,gid};}
export function exportUrl(row){const base=`https://docs.google.com/spreadsheets/d/${row.sheet_id}/gviz/tq?tqx=out:csv&headers=1`;return row.gid&&row.gid!=='0'?`${base}&gid=${encodeURIComponent(row.gid)}`:base;}
export async function readSheet(row){
  const response=await fetch(exportUrl(row),{redirect:'follow',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'CMA-Sales-CRM/1.0'}});
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Sheet is not publicly accessible. Set General access to Anyone with the link – Viewer.':`Google Sheet returned HTTP ${response.status}`);
  const buffer=Buffer.from(await response.arrayBuffer());
  const book=XLSX.read(buffer,{type:'buffer',raw:false});
  const sheet=book.Sheets[book.SheetNames[0]];
  if(!sheet)throw new Error('No readable sheet tab found');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:false});
  if(!matrix.length)throw new Error('Sheet is empty');
  const knownHeaders=new Set(Object.values(canonicalHeaders).map(normalize));
  const headerScore=cells=>cells.reduce((score,cell)=>score+(knownHeaders.has(normalize(cleanDetectedHeader(cell)))?1:0),0);
  const headerRowIndex=matrix.slice(0,10).reduce((best,_cells,index)=>headerScore(matrix[index])>headerScore(matrix[best])?index:best,0);
  const usedNames=new Set();
  const headerCells=matrix[headerRowIndex].map((cell,index)=>{
    const label=cleanDetectedHeader(cell);
    if(!label)return null;
    let unique=label;let suffix=2;
    while(usedNames.has(normalize(unique)))unique=`${label} (${suffix++})`;
    usedNames.add(normalize(unique));
    return{index,name:unique};
  }).filter(Boolean);
  if(!headerCells.length)throw new Error('No column headers found in the sheet');
  const headers=headerCells.map(header=>header.name);
  const rows=matrix.slice(headerRowIndex+1).map((cells,index)=>({rowNumber:headerRowIndex+index+2,values:Object.fromEntries(headerCells.map(header=>[header.name,String(cells[header.index]??'').trim()]))})).filter(row=>Object.values(row.values).some(Boolean));
  return{headers,rows};
}
export function resolveMapping(headers,saved={}){const byNormalized=new Map(headers.map(h=>[normalize(h),h]));return Object.fromEntries(fields.map(field=>{const detected=field.aliases.map(normalize).map(alias=>byNormalized.get(alias)).find(Boolean);if(detected)return[field.key,detected];const configured=saved[field.key];return[field.key,configured&&headers.includes(configured)?configured:''];}));}
const valueFor=(row,mapping,key)=>mapping[key]?String(row.values[mapping[key]]??'').trim():'';
const rowKey=data=>crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const leadDate=value=>{if(!value)return new Date().toISOString();const input=/\b\d{4}\b/.test(value)?value:`${value}, ${new Date().getFullYear()}`;const time=Date.parse(input);return Number.isFinite(time)?new Date(time).toISOString():new Date().toISOString();};

export async function syncIntegration(integration,triggerType='MANUAL'){
  const started=new Date().toISOString();let found=0,imported=0,updated=0,duplicates=0,skipped=0;
  try{
    const sheet=await readSheet(integration);found=sheet.rows.length;const saved=JSON.parse(integration.mapping_json||'{}');const mapping=resolveMapping(sheet.headers,saved);
    if(!mapping.contactName&&!mapping.phone&&!mapping.email)throw new Error('Map at least Name, Phone or Email before syncing');
    const insertLead=await db.prepare(`INSERT INTO leads(company_name,contact_name,phone,email,city,source,requirement,box_size,quantity,quantity_range,per_box_budget,estimated_value,status,assigned_to,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let assignmentCursor=Math.max(0,Number(integration.assignment_cursor)||0);let rotationIds=[];
    if(integration.assignment_mode==='ROUND_ROBIN'){let selected=[];try{selected=JSON.parse(integration.assignment_user_ids_json||'[]').map(Number);}catch{}const active=new Set((await queryAll('SELECT id FROM users WHERE active=1')).map(user=>Number(user.id)));rotationIds=selected.filter(id=>active.has(id));}
    const leadsPerUser=Math.max(1,Number(integration.leads_per_user)||1);
    const nextOwner=()=>rotationIds.length?rotationIds[Math.floor(assignmentCursor/leadsPerUser)%rotationIds.length]:(integration.assigned_to||null);
    const advanceAssignment=await db.prepare('UPDATE sheet_integrations SET assignment_cursor=assignment_cursor+1 WHERE id=?');
    const hasRow=await db.prepare('SELECT * FROM sheet_imported_rows WHERE integration_id=? AND row_key=? ORDER BY id LIMIT 1');
    const trackedByPosition=await db.prepare('SELECT r.*,l.contact_name,l.company_name FROM sheet_imported_rows r LEFT JOIN leads l ON l.id=r.lead_id WHERE r.integration_id=? AND r.row_number=? AND r.lead_id IS NOT NULL ORDER BY r.id DESC LIMIT 1');
    const trackedByLead=await db.prepare('SELECT * FROM sheet_imported_rows WHERE integration_id=? AND lead_id=? ORDER BY id DESC LIMIT 1');
    const existingLead=await db.prepare("SELECT id FROM leads WHERE (?<>'' AND lower(email)=lower(?)) OR (?<>'' AND phone_key=?) OR (?<>'' AND lower(contact_name)=lower(?) AND (?='' OR lower(COALESCE(company_name,''))=lower(?))) ORDER BY id LIMIT 1");
    const remember=await db.prepare('INSERT INTO sheet_imported_rows(integration_id,row_key,row_number,lead_id) VALUES(?,?,?,?)');
    const updateLead=await db.prepare(`UPDATE leads SET company_name=?,contact_name=?,phone=?,email=?,city=?,source=?,requirement=?,box_size=?,quantity=?,quantity_range=?,per_box_budget=?,estimated_value=?,updated_at=datetime('now') WHERE id=?`);
    const updateTracking=await db.prepare('UPDATE sheet_imported_rows SET row_key=?,row_number=?,lead_id=COALESCE(?,lead_id) WHERE id=?');
    const moveTracking=await db.prepare('UPDATE sheet_imported_rows SET row_number=? WHERE id=?');
    const importRow=async row=>{
      const quantityValue=valueFor(row,mapping,'quantity');
      const data={contactName:valueFor(row,mapping,'contactName'),email:normalizeEmail(valueFor(row,mapping,'email')),phone:normalizePhone(valueFor(row,mapping,'phone')),companyName:valueFor(row,mapping,'companyName'),quantity:parseQuantity(quantityValue),quantityRange:normalizeQuantityRange(quantityValue),boxSize:valueFor(row,mapping,'boxSize'),requirement:valueFor(row,mapping,'requirement'),date:valueFor(row,mapping,'date'),city:valueFor(row,mapping,'city'),perBoxBudget:parseAmount(valueFor(row,mapping,'perBoxBudget'))};
      if(!data.contactName&&!data.phone&&!data.email)return'SKIPPED';
      const key=rowKey(data);const exact=await hasRow.get([integration.id,key]);if(exact){await moveTracking.run([row.rowNumber,exact.id]);return'DUPLICATE';}
      const matched=await existingLead.get([data.email,data.email,phoneKey(data.phone),phoneKey(data.phone),data.contactName,data.contactName,data.companyName,data.companyName]);
      if(matched){const tracking=await trackedByLead.get([integration.id,matched.id]);if(tracking){await updateLead.run([data.companyName||null,data.contactName||data.phone||data.email,data.phone||null,data.email||null,data.city||null,integration.default_source||'Google Ads',data.requirement||null,data.boxSize||null,data.quantity,data.quantityRange||null,data.perBoxBudget,data.quantity*data.perBoxBudget,matched.id]);await updateTracking.run([key,row.rowNumber,matched.id,tracking.id]);return'UPDATED';}await remember.run([integration.id,key,row.rowNumber,matched.id]);return'DUPLICATE';}
      const positioned=await trackedByPosition.get([integration.id,row.rowNumber]);const sameIdentity=positioned&&((data.contactName&&normalize(positioned.contact_name)===normalize(data.contactName))||(data.companyName&&normalize(positioned.company_name)===normalize(data.companyName)));
      if(sameIdentity){await updateLead.run([data.companyName||null,data.contactName||data.phone||data.email,data.phone||null,data.email||null,data.city||null,integration.default_source||'Google Ads',data.requirement||null,data.boxSize||null,data.quantity,data.quantityRange||null,data.perBoxBudget,data.quantity*data.perBoxBudget,positioned.lead_id]);await updateTracking.run([key,row.rowNumber,positioned.lead_id,positioned.id]);return'UPDATED';}
      const createdAt=leadDate(data.date);const owner=nextOwner();
      const result=await insertLead.run([data.companyName||null,data.contactName||data.phone||data.email,data.phone||null,data.email||null,data.city||null,integration.default_source||'Google Ads',data.requirement||null,data.boxSize||null,data.quantity,data.quantityRange||null,data.perBoxBudget,data.quantity*data.perBoxBudget,'NEW_LEAD',owner,data.date?`Google Sheet lead date: ${data.date}`:null,null,createdAt,createdAt]);
      await remember.run([integration.id,key,row.rowNumber,result.lastInsertRowid]);if(owner)await notifyLeadAssigned(owner,result.lastInsertRowid,`sheet:${integration.id}:row:${row.rowNumber}:lead:${result.lastInsertRowid}:user:${owner}`);if(rotationIds.length){await advanceAssignment.run([integration.id]);assignmentCursor++;}return'IMPORTED';
    };
    for(const row of sheet.rows){let result;try{result=await importRow(row);}catch(error){if(!isDuplicatePhoneError(error))throw error;result='DUPLICATE';}if(result==='IMPORTED')imported++;else if(result==='UPDATED')updated++;else if(result==='DUPLICATE')duplicates++;else skipped++;}
    await run("UPDATE sheet_integrations SET mapping_json=?,last_sync_at=?,last_success_at=?,last_error=NULL,updated_at=datetime('now') WHERE id=?",[JSON.stringify(mapping),started,started,integration.id]);await run('INSERT INTO sheet_sync_logs(integration_id,trigger_type,status,rows_found,imported_count,updated_count,duplicate_count,skipped_count) VALUES(?,?,?,?,?,?,?,?)',[integration.id,triggerType,'SUCCESS',found,imported,updated,duplicates,skipped]);
    return{status:'SUCCESS',rowsFound:found,imported,updated,duplicates,skipped,mapping,headers:sheet.headers};
  }catch(error){const message=String(error.message||error).slice(0,500);await run("UPDATE sheet_integrations SET last_sync_at=?,last_error=?,updated_at=datetime('now') WHERE id=?",[started,message,integration.id]);await run('INSERT INTO sheet_sync_logs(integration_id,trigger_type,status,rows_found,imported_count,updated_count,duplicate_count,skipped_count,error_message) VALUES(?,?,?,?,?,?,?,?,?)',[integration.id,triggerType,'FAILED',found,imported,updated,duplicates,skipped,message]);throw error;}
}

let running=false;
export function startSheetScheduler(){setInterval(async()=>{if(running)return;running=true;try{const due=await queryAll("SELECT * FROM sheet_integrations WHERE enabled=1 AND (last_sync_at IS NULL OR datetime(last_sync_at, '+' || interval_minutes || ' minutes') <= datetime('now'))");for(const integration of due){try{await syncIntegration(integration,'AUTO');}catch(error){console.error(`Sheet sync ${integration.id} failed:`,error.message);}}}catch(error){console.error('Sheet scheduler check failed:',error.message);}finally{running=false;}},60_000).unref();}
