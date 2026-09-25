import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db, queryAll, queryOne, queryBatch, run, withTransaction } from '../db.js';
import { adminOnly, authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {hasPermission,requirePermission} from '../permissions.js';
import {standardLeadRow} from '../services/leadData.js';
import {notifyLeadAssigned} from '../services/leadNotifications.js';
import {logActivity} from '../services/activityLog.js';
import {getPagination,paginationMeta} from '../utils/pagination.js';
import {leadOrderBy} from '../utils/leadSort.js';
import {phoneKey,isDuplicatePhoneError,duplicatePhoneMessage} from '../utils/leadPhone.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(authRequired,async(req,res,next)=>{try{if(req.user.role==='ADMIN'||await hasPermission(req.user,'PAGE_LEADS')||await hasPermission(req.user,'PAGE_FOLLOWUPS')||await hasPermission(req.user,'PAGE_IMPORT'))return next();res.status(403).json({message:'You do not have permission to access leads'});}catch(error){next(error);}});

const statuses=['NEW_LEAD','CONTACTED','REQUIREMENT_RECEIVED','QUALIFIED','NEED_SAMPLE','SAMPLE_SENT','QUOTATION_SENT','NEGOTIATION','SAMPLE_DESIGN_APPROVAL','ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','NOT_INTERESTED','CLOSED_WON','CLOSED_LOST'];
async function masterCodes(category,fallback){const rows=await queryAll('SELECT code FROM masters WHERE category=? AND active=1 ORDER BY sort_order,label',[category]);return rows.length?rows.map(x=>x.code):fallback;}

function leadScope(req, alias = 'l') {
  return req.user.role === 'ADMIN'
    ? { sql: '1=1', params: [] }
    : { sql: `${alias}.assigned_to = ?`, params: [req.user.id] };
}

function canAccessLead(req, lead) {
  return req.user.role === 'ADMIN' || Number(lead.assigned_to) === Number(req.user.id);
}

router.get('/', asyncHandler(async (req, res) => {
  const {page,pageSize,offset}=getPagination(req.query,{maxPageSize:1000});
  const {q='',status='',excludeNotInterested='',followupStatus='',assignedTo='',newAssigned='',followup='',pipeline='',start='',end='',sampleFrom='',sampleTo='',city='',source='',boxSize='',minQuantity='',maxQuantity='',minBudget='',maxBudget='',followupFrom='',followupTo=''}=req.query;
  const scope = leadScope(req);
  const where = [scope.sql];
  const params = [...scope.params];

  if (q) {
    where.push('(l.contact_name LIKE ? OR l.company_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.requirement LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (status) {
    where.push('l.status = ?');
    params.push(status);
  }
  if(excludeNotInterested==='1')where.push("l.status<>'NOT_INTERESTED'");
  if(pipeline==='open')where.push("l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");
  if(sampleFrom){where.push('l.sample_sent=1 AND datetime(l.sample_sent_at)>=datetime(?)');params.push(sampleFrom);}if(sampleTo){where.push('l.sample_sent=1 AND datetime(l.sample_sent_at)<datetime(?)');params.push(sampleTo);}
  if(followupStatus){where.push('(SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1)=?');params.push(followupStatus);}
  if(newAssigned==='1'){where.push('EXISTS(SELECT 1 FROM lead_notifications n WHERE n.lead_id=l.id AND n.user_id=? AND n.read_at IS NULL)');params.push(req.user.id);}
  for(const [column,value] of [['l.city',city],['l.source',source],['l.box_size',boxSize]])if(value){where.push(`${column} LIKE ?`);params.push(`%${value}%`);}if(minQuantity!==''){where.push('l.quantity>=?');params.push(Number(minQuantity));}if(maxQuantity!==''){where.push('l.quantity<=?');params.push(Number(maxQuantity));}if(minBudget!==''){where.push('l.per_box_budget>=?');params.push(Number(minBudget));}if(maxBudget!==''){where.push('l.per_box_budget<=?');params.push(Number(maxBudget));}if(followupFrom){where.push('l.next_followup_at>=?');params.push(followupFrom);}if(followupTo){where.push('l.next_followup_at<?');params.push(followupTo);}
  if (assignedTo && req.user.role === 'ADMIN') {
    if (assignedTo === 'unassigned') {
      where.push('l.assigned_to IS NULL');
    } else {
      where.push('l.assigned_to = ?');
      params.push(Number(assignedTo));
    }
  }
  if (followup === 'today' && start && end) {
    where.push('l.next_followup_at >= ? AND l.next_followup_at < ?');
    params.push(start, end);
  }
  if (followup === 'overdue' && start) {
    where.push("l.next_followup_at IS NOT NULL AND l.next_followup_at < ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");
    params.push(start);
  }
  if (followup === 'upcoming' && end) {
    where.push("l.next_followup_at IS NOT NULL AND l.next_followup_at >= ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");
    params.push(end);
  }
  if(followup==='range'&&start&&end){where.push("l.next_followup_at IS NOT NULL AND l.next_followup_at>=? AND l.next_followup_at<? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");params.push(start,end);}if(followup==='all')where.push("l.next_followup_at IS NOT NULL AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");

  const [countRows,statusRows,leads]=await queryBatch([
    {sql:`SELECT COUNT(*) count FROM leads l WHERE ${where.join(' AND ')}`,args:params},
    {sql:'SELECT code FROM masters WHERE category=? AND active=1 ORDER BY sort_order,label',args:['LEAD_STATUS']},
    {sql:`SELECT l.*, u.name AS assigned_name, u.email AS assigned_email,(SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_status,(SELECT f.note FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_note,
     (SELECT json_group_array(code) FROM (SELECT code FROM lead_progress WHERE lead_id=l.id ORDER BY created_at)) progress_codes_json
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE ${where.join(' AND ')}
     ORDER BY ${leadOrderBy(req.query)}
     LIMIT ? OFFSET ?`,args:[...params,pageSize,offset]}
  ]);
  const total=Number(countRows[0]?.count||0);
  const leadStatuses=statusRows.length?statusRows.map(row=>row.code):statuses;

  leads.forEach(lead=>{lead.progress_codes=JSON.parse(lead.progress_codes_json||'[]');delete lead.progress_codes_json;});
  res.json({ leads, statuses:leadStatuses,pagination:paginationMeta(total,page,pageSize) });
}));

router.get('/actions/export',asyncHandler(async(req,res)=>{const scope=leadScope(req),rows=await queryAll(`SELECT l.*,u.name assigned_name,u.email assigned_email,(SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_status,(SELECT f.note FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_note FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ${scope.sql} ORDER BY l.updated_at DESC`,scope.params),columns=[['Lead ID','id'],['Contact Name','contact_name'],['Company Name','company_name'],['Phone','phone'],['Email','email'],['Location','city'],['Source','source'],['Requirement','requirement'],['Box Size','box_size'],['Quantity','quantity'],['Quantity Range','quantity_range'],['Per Box Budget','per_box_budget'],['Estimated Value','estimated_value'],['Lead Status','status'],['Owner','assigned_name'],['Next Follow-up','next_followup_at'],['Follow-up Status','latest_followup_status'],['Follow-up Note','latest_followup_note'],['Notes','notes'],['Created At','created_at'],['Updated At','updated_at']],cell=value=>`"${String(value??'').replaceAll('"','""')}"`,csv='\uFEFF'+[columns.map(x=>cell(x[0])).join(','),...rows.map(row=>columns.map(([,key])=>cell(row[key])).join(','))].join('\r\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="leads-${new Date().toISOString().slice(0,10)}.csv"`);res.send(csv);}));

router.post('/actions/bulk-delete',adminOnly,asyncHandler(async(req,res)=>{const ids=(req.body?.leadIds||[]).map(Number).filter(Number.isInteger);if(!ids.length)return res.status(400).json({message:'Select at least one lead'});await run(`DELETE FROM leads WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);res.json({message:`${ids.length} lead(s) deleted`});}));

router.get('/:id', asyncHandler(async (req, res) => {
  const lead = await queryOne(
    `SELECT l.*, u.name AS assigned_name, u.email AS assigned_email
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE l.id = ?`,
    [Number(req.params.id)]
  );

  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) {
    return res.status(403).json({ message: 'You cannot access this lead' });
  }

  const [followups,progress,leadStatuses]=await Promise.all([queryAll(
    `SELECT f.*, u.name AS user_name
     FROM followups f
     JOIN users u ON u.id = f.user_id
     WHERE f.lead_id = ?
     ORDER BY f.followup_at DESC, f.id DESC`,
    [Number(lead.id)]
  ),queryAll('SELECT code FROM lead_progress WHERE lead_id=? ORDER BY created_at,code',[lead.id]),masterCodes('LEAD_STATUS',statuses)]);
  lead.progress_codes=progress.map(x=>x.code);
  res.json({ lead, followups, statuses:leadStatuses });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body.contactName) {
    return res.status(400).json({ message: 'Contact name is required' });
  }

  const assignedTo = req.user.role === 'ADMIN'
    ? (body.assignedTo ? Number(body.assignedTo) : null)
    : req.user.id;

  const activeStatuses=await masterCodes('LEAD_STATUS',statuses),status=activeStatuses.includes(body.status)?body.status:'NEW_LEAD',eventTime=new Date().toISOString();

  const created = await queryOne(
    `INSERT INTO leads (
       company_name,contact_name,phone,email,city,source,requirement,box_size,quantity,per_box_budget,finalized,sample_sent,order_sent,quote_sent_at,finalized_at,sample_sent_at,order_sent_at,estimated_value,status,assigned_to,next_followup_at,notes,created_by,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     RETURNING id`,
    [
      body.companyName || null,
      body.contactName.trim(),
      body.phone || null,
      body.email || null,
      body.city || null,
      body.source || null,
      body.requirement || null,
      body.boxSize||null,Math.max(0,Number(body.quantity||0)),Math.max(0,Number(body.perBoxBudget||0)),body.finalized?1:0,body.sampleSent?1:0,body.orderSent?1:0,status==='QUOTATION_SENT'?eventTime:null,body.finalized?eventTime:null,body.sampleSent?eventTime:null,body.orderSent?eventTime:null,
      Number(body.estimatedValue || 0),
      status,
      assignedTo,
      body.nextFollowupAt || null,
      body.notes || null,
      req.user.id
    ]
  );
  const progressCodes=Array.isArray(body.progressCodes)?body.progressCodes:[];if(progressCodes.length)await db.batch(progressCodes.map(code=>({sql:'INSERT OR IGNORE INTO lead_progress(lead_id,code) VALUES(?,?)',args:[created.id,code]})),'immediate');if(assignedTo)await notifyLeadAssigned(assignedTo,created.id,`created:${created.id}:user:${assignedTo}`);await logActivity(req.user.id,created.id,'LEAD_CREATED','Lead created',body.contactName);
  res.status(201).json({ id: Number(created.id), message: 'Lead created' });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [id]);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) {
    return res.status(403).json({ message: 'You cannot update this lead' });
  }

  const b = req.body || {};
  if (b.status !== undefined && !(await masterCodes('LEAD_STATUS',statuses)).includes(b.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const fields = [];
  const params = [];
  const map = {
    companyName: 'company_name',
    contactName: 'contact_name',
    phone: 'phone',
    email: 'email',
    city: 'city',
    source: 'source',
    requirement: 'requirement',
    boxSize:'box_size',quantity:'quantity',perBoxBudget:'per_box_budget',finalized:'finalized',sampleSent:'sample_sent',orderSent:'order_sent',
    estimatedValue: 'estimated_value',
    status: 'status',
    nextFollowupAt: 'next_followup_at',
    notes: 'notes'
  };

  Object.entries(map).forEach(([key, column]) => {
    if (b[key] !== undefined) {
      fields.push(`${column} = ?`);
      if(['estimatedValue','quantity','perBoxBudget'].includes(key))params.push(Math.max(0,Number(b[key]||0)));else if(['finalized','sampleSent','orderSent'].includes(key))params.push(b[key]?1:0);else params.push(b[key]||null);
    }
  });

  if (!fields.length) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);
  await run(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`, params);
  const now=new Date().toISOString();if(b.status==='SAMPLE_SENT'||b.sampleSent)await run('UPDATE leads SET sample_sent=1,sample_sent_at=COALESCE(sample_sent_at,?) WHERE id=?',[now,id]);if(b.status==='QUOTATION_SENT'||b.orderSent)await run('UPDATE leads SET order_sent=1,quote_sent_at=COALESCE(quote_sent_at,?),order_sent_at=COALESCE(order_sent_at,?) WHERE id=?',[now,now,id]);if(['ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON'].includes(b.status)||b.finalized)await run('UPDATE leads SET finalized=1,finalized_at=COALESCE(finalized_at,?) WHERE id=?',[now,id]);
  res.json({ message: 'Lead updated' });
}));

router.post('/:id/followups', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [id]);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) {
    return res.status(403).json({ message: 'You cannot update this lead' });
  }

  const {
    type = 'CALL',
    outcome = '',
    note = '',
    followupStatus = null,
    nextFollowupAt = null,
    status = lead.status
  } = req.body || {};

  if (!note && !outcome) {
    return res.status(400).json({ message: 'Add an outcome or follow-up note' });
  }
  if (!(await masterCodes('LEAD_STATUS',statuses)).includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const now = new Date().toISOString();

  await withTransaction(async tx => {
    await tx.run(
      `INSERT INTO followups (lead_id,user_id,type,followup_status,outcome,note,followup_at,next_followup_at) VALUES(?,?,?,?,?,?,?,?)`,
      [id,req.user.id,type,followupStatus||null,outcome,note,now,nextFollowupAt||null]
    );

    await tx.run(
      `UPDATE leads
       SET status = ?, last_followup_at = ?, next_followup_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [status, now, nextFollowupAt || null, id]
    );
  });
  await logActivity(req.user.id,id,'FOLLOW_UP','Follow-up saved',[type,followupStatus,outcome,note].filter(Boolean).join(' · '));
  res.status(201).json({ message: 'Follow-up saved' });
}));

router.patch('/:id/assign', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existingLead=await queryOne('SELECT assigned_to FROM leads WHERE id=?',[id]);if(!existingLead)return res.status(404).json({message:'Lead not found'});
  const userId = req.body?.userId ? Number(req.body.userId) : null;

  if (userId) {
    const user = await queryOne('SELECT id FROM users WHERE id = ? AND active = 1', [userId]);
    if (!user) {
      return res.status(400).json({ message: 'Selected user is not active' });
    }
  }

  await run(
    "UPDATE leads SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?",
    [userId, id]
  );
  if(userId&&Number(existingLead.assigned_to)!==userId)await notifyLeadAssigned(userId,id,`assigned:${id}:user:${userId}:${Date.now()}`);
  res.json({ message: 'Lead assignment updated' });
}));

router.post('/actions/bulk-assign', adminOnly, asyncHandler(async (req, res) => {
  const { leadIds = [], userId } = req.body || {};
  if (!Array.isArray(leadIds) || !leadIds.length) {
    return res.status(400).json({ message: 'Select at least one lead' });
  }

  const targetUser = userId ? Number(userId) : null;
  if (targetUser) {
    const user = await queryOne('SELECT id FROM users WHERE id = ? AND active = 1', [targetUser]);
    if (!user) {
      return res.status(400).json({ message: 'Selected user is not active' });
    }
  }

  const numericLeadIds = leadIds.map(Number);
  const placeholders = numericLeadIds.map(() => '?').join(',');
  const previousAssignments=await queryAll(`SELECT id,assigned_to FROM leads WHERE id IN (${placeholders})`,numericLeadIds);
  await run(
    `UPDATE leads SET assigned_to = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`,
    [targetUser, ...numericLeadIds]
  );

  if(targetUser){
    const newlyAssigned=previousAssignments.filter(lead=>Number(lead.assigned_to)!==targetUser);
    await Promise.all(newlyAssigned.map(lead=>notifyLeadAssigned(targetUser,lead.id,`bulk-assigned:${lead.id}:user:${targetUser}:${Date.now()}`)));
  }

  res.json({ message: `${numericLeadIds.length} lead(s) assigned` });
}));

function normKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(row, names) {
  const map = Object.fromEntries(Object.entries(row).map(([k, v]) => [normKey(k), v]));
  for (const name of names) {
    const value = map[normKey(name)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

router.post('/actions/import', requirePermission('PAGE_IMPORT'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Excel/CSV file is required' });
  }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null;
  const assignmentMode=req.body.assignmentMode==='ROUND_ROBIN'?'ROUND_ROBIN':'FIXED';let requestedUsers=[];try{requestedUsers=JSON.parse(req.body.assignmentUserIds||'[]').map(Number);}catch{return res.status(400).json({message:'Invalid assignment users'});}const activeIds=new Set((await queryAll('SELECT id FROM users WHERE active=1')).map(x=>Number(x.id))),rotationUsers=[...new Set(requestedUsers)].filter(id=>activeIds.has(id)),leadsPerUser=Math.min(1000,Math.max(1,Number.parseInt(req.body.leadsPerUser,10)||1));if(assignmentMode==='ROUND_ROBIN'&&!rotationUsers.length)return res.status(400).json({message:'Select at least one active user for automatic rotation'});

  if (assignedTo) {
    const user = await queryOne('SELECT id FROM users WHERE id = ? AND active = 1', [assignedTo]);
    if (!user) {
      return res.status(400).json({ message: 'Selected assignee is not active' });
    }
  }

  const duplicateStmt = await db.prepare(`
    SELECT id FROM leads
    WHERE (? <> '' AND phone_key = ?) OR (? <> '' AND lower(email) = lower(?))
    LIMIT 1
  `);
  const insertStmt = await db.prepare(`
    INSERT INTO leads (
      company_name,contact_name,phone,email,city,source,requirement,box_size,quantity,quantity_range,per_box_budget,estimated_value,status,assigned_to,next_followup_at,notes,created_by,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `);

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const data=standardLeadRow(row),contactName=data.contactName,phone=data.phone,email=data.email;

    if (!contactName || (!phone && !email)) {
      skipped += 1;
      errors.push(`Row ${index + 2}: contact name and phone/email are required`);
      continue;
    }

    const duplicate = await duplicateStmt.get([phoneKey(phone), phoneKey(phone), email, email]);
    if (duplicate) {
      skipped += 1;
      continue;
    }

    let nextFollowupAt = String(
      pick(row, ['Next Follow Up','Next Followup','Follow Up Date','Followup Date']) || ''
    ).trim();
    if (nextFollowupAt) {
      const parsed = new Date(nextFollowupAt);
      nextFollowupAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    } else {
      nextFollowupAt = null;
    }

    let status = String(data.status || 'NEW_LEAD')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (!statuses.includes(status)) status = 'NEW_LEAD';
    const rowOwner=assignmentMode==='ROUND_ROBIN'?rotationUsers[Math.floor(imported/leadsPerUser)%rotationUsers.length]:assignedTo;

    let insertResult;
    try{insertResult=await insertStmt.run([
      data.companyName||null,
      contactName,
      phone || null,
      email || null,
      data.city||null,data.source||'Excel Import',data.requirement||null,data.boxSize||null,data.quantity,data.quantityRange||null,data.perBoxBudget,data.estimatedValue,
      status,
      rowOwner,
      nextFollowupAt,
      data.notes||null,
      req.user.id
    ]);}catch(error){if(!isDuplicatePhoneError(error))throw error;skipped++;errors.push(`Row ${index+2}: ${duplicatePhoneMessage}`);continue;}
    if(rowOwner)await notifyLeadAssigned(rowOwner,Number(insertResult.lastInsertRowid),`import:${Date.now()}:${index}:user:${rowOwner}`);
    imported += 1;
  }

  res.json({ imported, skipped, totalRows: rows.length, errors: errors.slice(0, 20) });
}));

router.delete('/:id',adminOnly,asyncHandler(async(req,res)=>{const id=Number(req.params.id);if(!await queryOne('SELECT id FROM leads WHERE id=?',[id]))return res.status(404).json({message:'Lead not found'});try{await run('DELETE FROM leads WHERE id=?',[id]);res.json({message:'Lead deleted'});}catch(error){if(String(error.message).includes('FOREIGN KEY'))return res.status(409).json({message:'This lead has a purchase order and cannot be deleted'});throw error;}}));

export default router;
