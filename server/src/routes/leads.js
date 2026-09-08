import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db.js';
import { adminOnly, authRequired } from '../middleware/auth.js';
import {hasPermission,requirePermission} from '../permissions.js';
import {standardLeadRow} from '../services/leadData.js';
import {notifyLeadAssigned} from '../services/leadNotifications.js';
import {logActivity} from '../services/activityLog.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(authRequired,(req,res,next)=>req.user.role==='ADMIN'||hasPermission(req.user,'PAGE_LEADS')||hasPermission(req.user,'PAGE_FOLLOWUPS')?next():res.status(403).json({message:'You do not have permission to access leads'}));
router.use((req,res,next)=>{if(req.method==='GET'&&req.path==='/actions/export')return requirePermission('ACTION_LEADS_EXPORT')(req,res,next);if(req.method==='POST'&&req.path==='/' )return requirePermission('ACTION_LEADS_CREATE')(req,res,next);if(req.method==='DELETE')return requirePermission('ACTION_LEADS_DELETE')(req,res,next);if(req.method==='PATCH'&&!req.path.endsWith('/assign'))return requirePermission('ACTION_LEADS_EDIT')(req,res,next);if(req.method==='POST'&&req.path.endsWith('/followups'))return requirePermission('ACTION_FOLLOWUPS_MANAGE')(req,res,next);next();});

const statuses = ['NEW_LEAD','CONTACTED','REQUIREMENT_RECEIVED','QUALIFIED','NEED_SAMPLE','SAMPLE_SENT','QUOTATION_SENT','NEGOTIATION','SAMPLE_DESIGN_APPROVAL','ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','NOT_INTERESTED','CLOSED_WON','CLOSED_LOST'];
function masterCodes(category,fallback){const rows=db.prepare('SELECT code FROM masters WHERE category=? AND active=1 ORDER BY sort_order,label').all(category);return rows.length?rows.map(row=>row.code):fallback;}
const progressForLead=db.prepare('SELECT code FROM lead_progress WHERE lead_id=? ORDER BY created_at,code');
function attachProgress(lead){if(lead)lead.progress_codes=progressForLead.all(lead.id).map(row=>row.code);return lead;}

function leadScope(req, alias = 'l') {
  return req.user.role === 'ADMIN'
    ? { sql: '1=1', params: [] }
    : { sql: `${alias}.assigned_to = ?`, params: [req.user.id] };
}

function canAccessLead(req, lead) {
  return req.user.role === 'ADMIN' || lead.assigned_to === req.user.id;
}

function leadFilters(req) {
  const {q='',status='',excludeNotInterested='',followupStatus='',assignedTo='',newAssigned='',followup='',pipeline='',start='',end='',sampleFrom='',sampleTo='',city='',source='',boxSize='',minQuantity='',maxQuantity='',minBudget='',maxBudget='',followupFrom='',followupTo=''}=req.query;
  const scope=leadScope(req); const where=[scope.sql]; const params=[...scope.params];
  if(q){where.push(`(l.contact_name LIKE ? OR l.company_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.requirement LIKE ?)`);const like=`%${q}%`;params.push(like,like,like,like,like);}
  if(excludeNotInterested==='1')where.push("l.status<>'NOT_INTERESTED'");
  if(status){where.push('l.status = ?');params.push(status);}
  if(pipeline==='open')where.push("l.status NOT IN ('CLOSED_WON','CLOSED_LOST')");
  if(sampleFrom){where.push('l.sample_sent=1 AND datetime(l.sample_sent_at)>=datetime(?)');params.push(sampleFrom);}
  if(sampleTo){where.push('l.sample_sent=1 AND datetime(l.sample_sent_at)<datetime(?)');params.push(sampleTo);}
  if(followupStatus){where.push('(SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1)=?');params.push(followupStatus);}
  if(assignedTo&&req.user.role==='ADMIN'){if(assignedTo==='unassigned')where.push('l.assigned_to IS NULL');else{where.push('l.assigned_to = ?');params.push(Number(assignedTo));}}
  if(newAssigned==='1'){where.push('EXISTS(SELECT 1 FROM lead_notifications n WHERE n.lead_id=l.id AND n.user_id=? AND n.read_at IS NULL)');params.push(req.user.id);}
  [['city','l.city',city],['source','l.source',source],['boxSize','l.box_size',boxSize]].forEach(([,column,value])=>{if(value){where.push(`${column} LIKE ?`);params.push(`%${value}%`);}});
  if(minQuantity!==''){where.push('l.quantity >= ?');params.push(Number(minQuantity));} if(maxQuantity!==''){where.push('l.quantity <= ?');params.push(Number(maxQuantity));}
  if(minBudget!==''){where.push('l.per_box_budget >= ?');params.push(Number(minBudget));} if(maxBudget!==''){where.push('l.per_box_budget <= ?');params.push(Number(maxBudget));}
  if(followupFrom){where.push('l.next_followup_at >= ?');params.push(followupFrom);} if(followupTo){where.push('l.next_followup_at < ?');params.push(followupTo);}
  if(followup==='today'&&start&&end){where.push('l.next_followup_at >= ? AND l.next_followup_at < ?');params.push(start,end);}
  if(followup==='overdue'&&start){where.push(`l.next_followup_at IS NOT NULL AND l.next_followup_at < ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')`);params.push(start);}
  if(followup==='upcoming'&&end){where.push(`l.next_followup_at IS NOT NULL AND l.next_followup_at >= ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')`);params.push(end);}
  if(followup==='range'&&start&&end){where.push(`l.next_followup_at IS NOT NULL AND l.next_followup_at >= ? AND l.next_followup_at < ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')`);params.push(start,end);}
  if(followup==='all')where.push(`l.next_followup_at IS NOT NULL AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')`);
  return{where,params};
}

router.get('/', (req, res) => {
  const {where,params}=leadFilters(req);

  const leads = db.prepare(`
    SELECT l.*, u.name AS assigned_name, u.email AS assigned_email,
      (SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) AS latest_followup_status,
      (SELECT f.note FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) AS latest_followup_note
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE WHEN l.status='NEW_LEAD' THEN 0 ELSE 1 END,
      CASE WHEN l.status='NEW_LEAD' THEN datetime(l.created_at) END DESC,
      CASE WHEN l.next_followup_at IS NULL THEN 1 ELSE 0 END,
      l.next_followup_at ASC,
      l.updated_at DESC
    LIMIT 1000
  `).all(...params).map(attachProgress);

  res.json({ leads, statuses:masterCodes('LEAD_STATUS',statuses) });
});

router.get('/actions/export', (req,res)=>{
  const {where,params}=leadFilters(req);
  const rows=db.prepare(`SELECT l.*,u.name assigned_name,u.email assigned_email,creator.name created_by_name,
    (SELECT f.type FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_type,
    (SELECT f.followup_status FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_status,
    (SELECT f.outcome FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_outcome,
    (SELECT f.note FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_note,
    (SELECT f.followup_at FROM followups f WHERE f.lead_id=l.id ORDER BY f.followup_at DESC,f.id DESC LIMIT 1) latest_followup_at
    FROM leads l LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN users creator ON creator.id=l.created_by WHERE ${where.join(' AND ')} ORDER BY l.updated_at DESC`).all(...params);
  const leadLabels=new Map(db.prepare("SELECT code,label FROM masters WHERE category='LEAD_STATUS'").all().map(x=>[x.code,x.label]));
  const followupLabels=new Map(db.prepare("SELECT code,label FROM masters WHERE category='FOLLOWUP_STATUS'").all().map(x=>[x.code,x.label]));
  rows.forEach(row=>{row.lead_status_label=leadLabels.get(row.status)||row.status;row.followup_status_label=followupLabels.get(row.latest_followup_status)||row.latest_followup_status;});
  const columns=[['Lead ID','id'],['Contact Name','contact_name'],['Company Name','company_name'],['Phone','phone'],['Email','email'],['Location','city'],['Source','source'],['Requirement','requirement'],['Box Size','box_size'],['Quantity','quantity'],['Quantity Range','quantity_range'],['Per Box Budget','per_box_budget'],['Estimated Value','estimated_value'],['Lead Status','lead_status_label'],['Lead Status Code','status'],['Owner Name','assigned_name'],['Owner Email','assigned_email'],['Next Follow-up','next_followup_at'],['Latest Follow-up Date','latest_followup_at'],['Latest Follow-up Type','latest_followup_type'],['Latest Follow-up Status','followup_status_label'],['Latest Follow-up Status Code','latest_followup_status'],['Latest Follow-up Outcome','latest_followup_outcome'],['Latest Follow-up Note','latest_followup_note'],['Internal Notes','notes'],['Sample Sent','sample_sent'],['Sample Sent At','sample_sent_at'],['Order Confirmed','finalized'],['Order Confirmed At','finalized_at'],['Quotation Sent','order_sent'],['Quotation Sent At','order_sent_at'],['Lead Quote Sent At','quote_sent_at'],['Created By','created_by_name'],['Created At','created_at'],['Updated At','updated_at']];
  const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const csv='\uFEFF'+[columns.map(c=>cell(c[0])).join(','),...rows.map(row=>columns.map(([,key])=>cell(['finalized','sample_sent','order_sent'].includes(key)?(row[key]?'Yes':'No'):row[key])).join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="leads-${new Date().toISOString().slice(0,10)}.csv"`);res.send(csv);
});

router.get('/:id', (req, res) => {
  const lead = attachProgress(db.prepare(`
    SELECT l.*, u.name AS assigned_name, u.email AS assigned_email
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.id = ?
  `).get(Number(req.params.id)));
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) return res.status(403).json({ message: 'You cannot access this lead' });

  const followups = db.prepare(`
    SELECT f.*, u.name AS user_name
    FROM followups f
    JOIN users u ON u.id = f.user_id
    WHERE f.lead_id = ?
    ORDER BY f.followup_at DESC, f.id DESC
  `).all(lead.id);

  res.json({ lead, followups, statuses:masterCodes('LEAD_STATUS',statuses) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.contactName) return res.status(400).json({ message: 'Contact name is required' });

  const assignedTo = req.user.role === 'ADMIN'
    ? (body.assignedTo ? Number(body.assignedTo) : null)
    : req.user.id;

  const activeStatuses=masterCodes('LEAD_STATUS',statuses);const status = activeStatuses.includes(body.status) ? body.status : 'NEW_LEAD';
  const eventTime = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO leads (
      company_name, contact_name, phone, email, city, source, requirement, box_size, quantity, per_box_budget,
      finalized, sample_sent, order_sent, quote_sent_at, finalized_at, sample_sent_at, order_sent_at,
      estimated_value, status, assigned_to, next_followup_at, notes, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    body.companyName || null,
    body.contactName.trim(),
    body.phone || null,
    body.email || null,
    body.city || null,
    body.source || null,
    body.requirement || null,
    body.boxSize || null,
    Math.max(0, Number(body.quantity || 0)),
    Math.max(0, Number(body.perBoxBudget || 0)),
    body.finalized ? 1 : 0,
    body.sampleSent ? 1 : 0,
    body.orderSent ? 1 : 0,
    status === 'QUOTATION_SENT' ? eventTime : null,
    body.finalized ? eventTime : null,
    body.sampleSent ? eventTime : null,
    body.orderSent ? eventTime : null,
    Number(body.estimatedValue || 0),
    status,
    assignedTo,
    body.nextFollowupAt || null,
    body.notes || null,
    req.user.id
  );

  const progressCodes=Array.isArray(body.progressCodes)?body.progressCodes.filter(code=>masterCodes('LEAD_PROGRESS',[]).includes(code)):[...(body.finalized?['ORDER_FINAL']:[]),...(body.sampleSent?['SAMPLE_SENT']:[]),...(body.orderSent?['FINAL_QUOTE_SENT']:[])];
  const addProgress=db.prepare('INSERT OR IGNORE INTO lead_progress(lead_id,code) VALUES(?,?)');progressCodes.forEach(code=>addProgress.run(result.lastInsertRowid,code));
  if(progressCodes.includes('FINAL_QUOTE_SENT'))db.prepare("UPDATE leads SET status='QUOTATION_SENT',quote_sent_at=COALESCE(quote_sent_at,?) WHERE id=?").run(eventTime,result.lastInsertRowid);
  if(status==='SAMPLE_SENT')db.prepare('UPDATE leads SET sample_sent=1,sample_sent_at=COALESCE(sample_sent_at,?) WHERE id=?').run(eventTime,result.lastInsertRowid);
  if(['ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON'].includes(status))db.prepare('UPDATE leads SET finalized=1,finalized_at=COALESCE(finalized_at,?) WHERE id=?').run(eventTime,result.lastInsertRowid);
  if(assignedTo)notifyLeadAssigned(assignedTo,result.lastInsertRowid,`created:${result.lastInsertRowid}:user:${assignedTo}`);
  logActivity(req.user.id,result.lastInsertRowid,'LEAD_CREATED','Lead created',body.contactName);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Lead created' });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) return res.status(403).json({ message: 'You cannot update this lead' });

  const b = req.body || {};
  const fields = [];
  const params = [];
  const map = {
    companyName: 'company_name', contactName: 'contact_name', phone: 'phone', email: 'email', city: 'city',
    source: 'source', requirement: 'requirement', boxSize: 'box_size', quantity: 'quantity', perBoxBudget: 'per_box_budget',
    finalized: 'finalized', sampleSent: 'sample_sent', orderSent: 'order_sent', estimatedValue: 'estimated_value', status: 'status',
    nextFollowupAt: 'next_followup_at', notes: 'notes'
  };

  Object.entries(map).forEach(([key, column]) => {
    if (b[key] !== undefined) {
      if (key === 'status' && !masterCodes('LEAD_STATUS',statuses).includes(b[key])) return;
      fields.push(`${column} = ?`);
      if (['estimatedValue','quantity','perBoxBudget'].includes(key)) params.push(Math.max(0, Number(b[key] || 0)));
      else if (['finalized','sampleSent','orderSent'].includes(key)) params.push(b[key] ? 1 : 0);
      else params.push(b[key] || null);
    }
  });

  const eventTime = new Date().toISOString();
  if (b.status === 'QUOTATION_SENT') { fields.push('quote_sent_at = COALESCE(quote_sent_at, ?)'); params.push(eventTime); }
  [['finalized','finalized_at'],['sampleSent','sample_sent_at'],['orderSent','order_sent_at']].forEach(([key,column]) => {
    if (b[key] !== undefined) { fields.push(`${column} = CASE WHEN ? = 1 THEN COALESCE(${column}, ?) ELSE NULL END`); params.push(b[key] ? 1 : 0, eventTime); }
  });

  if (!fields.length && !Array.isArray(b.progressCodes)) return res.status(400).json({ message: 'Nothing to update' });
  fields.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  if(b.status==='SAMPLE_SENT')db.prepare('UPDATE leads SET sample_sent=1,sample_sent_at=COALESCE(sample_sent_at,?) WHERE id=?').run(eventTime,id);
  if(['ORDER_CONFIRMED','PAYMENT_PENDING','PAYMENT_RECEIVED','IN_PRODUCTION','READY_FOR_DISPATCH','DISPATCHED','DELIVERED','CLOSED_WON'].includes(b.status))db.prepare('UPDATE leads SET finalized=1,finalized_at=COALESCE(finalized_at,?) WHERE id=?').run(eventTime,id);
  if(Array.isArray(b.progressCodes)){const valid=new Set(masterCodes('LEAD_PROGRESS',[]));const codes=[...new Set(b.progressCodes.filter(code=>valid.has(code)))];const setProgress=db.transaction(()=>{db.prepare('DELETE FROM lead_progress WHERE lead_id=?').run(id);const insert=db.prepare('INSERT INTO lead_progress(lead_id,code) VALUES(?,?)');codes.forEach(code=>insert.run(id,code));const system={ORDER_FINAL:['finalized','finalized_at'],SAMPLE_SENT:['sample_sent','sample_sent_at'],FINAL_QUOTE_SENT:['order_sent','order_sent_at']};Object.entries(system).forEach(([code,[column,dateColumn]])=>db.prepare(`UPDATE leads SET ${column}=?,${dateColumn}=CASE WHEN ?=1 THEN COALESCE(${dateColumn},?) ELSE NULL END WHERE id=?`).run(codes.includes(code)?1:0,codes.includes(code)?1:0,eventTime,id));if(codes.includes('FINAL_QUOTE_SENT'))db.prepare("UPDATE leads SET status='QUOTATION_SENT',quote_sent_at=COALESCE(quote_sent_at,?) WHERE id=?").run(eventTime,id);});setProgress();}
  const activityType=b.status==='SAMPLE_SENT'?'SAMPLE_SENT':b.status==='QUOTATION_SENT'?'QUOTATION_SENT':b.status==='ORDER_CONFIRMED'?'ORDER_CONFIRMED':'LEAD_UPDATED';logActivity(req.user.id,id,activityType,b.status?`Status changed to ${String(b.status).replaceAll('_',' ')}`:'Lead details updated',lead.contact_name,Number(b.estimatedValue??lead.estimated_value));
  res.json({ message: 'Lead updated' });
});

router.delete('/:id',(req,res)=>{
  const id=Number(req.params.id);const lead=db.prepare('SELECT id,assigned_to FROM leads WHERE id=?').get(id);
  if(!lead)return res.status(404).json({message:'Lead not found'});
  if(!canAccessLead(req,lead))return res.status(403).json({message:'You cannot delete this lead'});
  db.prepare('DELETE FROM leads WHERE id=?').run(id);res.json({message:'Lead deleted successfully'});
});

router.post('/:id/followups', (req, res) => {
  const id = Number(req.params.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  if (!canAccessLead(req, lead)) return res.status(403).json({ message: 'You cannot update this lead' });

  const { type = 'CALL', followupStatus = '', outcome = '', note = '', nextFollowupAt = null, status = lead.status } = req.body || {};
  if (!note && !outcome) return res.status(400).json({ message: 'Add an outcome or follow-up note' });
  if (!masterCodes('LEAD_STATUS',statuses).includes(status)) return res.status(400).json({ message: 'Invalid status' });
  if (!masterCodes('FOLLOWUP_TYPE',['CALL','WHATSAPP','EMAIL','MEETING']).includes(type)) return res.status(400).json({ message: 'Invalid follow-up type' });
  if (followupStatus && !masterCodes('FOLLOWUP_STATUS',[]).includes(followupStatus)) return res.status(400).json({ message: 'Invalid follow-up status' });
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO followups (lead_id, user_id, type, followup_status, outcome, note, followup_at, next_followup_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, type, followupStatus||null, outcome, note, now, nextFollowupAt || null);

    db.prepare(`
      UPDATE leads
      SET status = ?, last_followup_at = ?, next_followup_at = ?,
          quote_sent_at = CASE WHEN ? = 'QUOTATION_SENT' THEN COALESCE(quote_sent_at, ?) ELSE quote_sent_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, now, nextFollowupAt || null, status, now, id);
  });
  tx();
  logActivity(req.user.id,id,'FOLLOW_UP','Follow-up completed',`${type}${followupStatus?` · ${followupStatus.replaceAll('_',' ')}`:''}: ${note||outcome}`);

  res.status(201).json({ message: 'Follow-up saved' });
});

router.patch('/:id/assign', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const previous=db.prepare('SELECT assigned_to FROM leads WHERE id=?').get(id);if(!previous)return res.status(404).json({message:'Lead not found'});
  const userId = req.body?.userId ? Number(req.body.userId) : null;
  if (userId) {
    const user = db.prepare(`SELECT id FROM users WHERE id = ? AND active = 1`).get(userId);
    if (!user) return res.status(400).json({ message: 'Selected user is not active' });
  }
  db.prepare(`UPDATE leads SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`).run(userId, id);
  if(userId&&previous.assigned_to!==userId)notifyLeadAssigned(userId,id,`assigned:${id}:user:${userId}:at:${Date.now()}`);
  res.json({ message: 'Lead assignment updated' });
});

router.post('/actions/bulk-assign', adminOnly, (req, res) => {
  const { leadIds = [], userId } = req.body || {};
  if (!Array.isArray(leadIds) || !leadIds.length) return res.status(400).json({ message: 'Select at least one lead' });
  const targetUser = userId ? Number(userId) : null;
  if (targetUser) {
    const user = db.prepare(`SELECT id FROM users WHERE id = ? AND active = 1`).get(targetUser);
    if (!user) return res.status(400).json({ message: 'Selected user is not active' });
  }
  const placeholders = leadIds.map(() => '?').join(',');
  const numericIds=leadIds.map(Number);const changed=targetUser?db.prepare(`SELECT id FROM leads WHERE id IN (${placeholders}) AND COALESCE(assigned_to,0)<>?`).all(...numericIds,targetUser):[];
  db.prepare(`UPDATE leads SET assigned_to = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(targetUser, ...numericIds);
  if(targetUser)changed.forEach(lead=>notifyLeadAssigned(targetUser,lead.id,`bulk:${lead.id}:user:${targetUser}:at:${Date.now()}`));
  res.json({ message: `${leadIds.length} lead(s) assigned` });
});

router.post('/actions/bulk-delete',adminOnly,(req,res)=>{
  const {leadIds=[]}=req.body||{};if(!Array.isArray(leadIds)||!leadIds.length)return res.status(400).json({message:'Select at least one lead'});
  const ids=leadIds.map(Number).filter(Number.isInteger);const placeholders=ids.map(()=>'?').join(',');
  const result=db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids);
  res.json({message:`${result.changes} lead(s) deleted successfully`});
});

router.post('/actions/import', adminOnly, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Excel/CSV file is required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null;
  const assignmentMode=req.body.assignmentMode==='ROUND_ROBIN'?'ROUND_ROBIN':'FIXED';let requestedUsers=[];try{requestedUsers=JSON.parse(req.body.assignmentUserIds||'[]').map(Number);}catch{return res.status(400).json({message:'Invalid assignment users'});}requestedUsers=[...new Set(requestedUsers.filter(Number.isInteger))];
  const leadsPerUser=Math.min(1000,Math.max(1,Number.parseInt(req.body.leadsPerUser,10)||1));

  if (assignedTo) {
    const user = db.prepare(`SELECT id FROM users WHERE id = ? AND active = 1`).get(assignedTo);
    if (!user) return res.status(400).json({ message: 'Selected assignee is not active' });
  }
  const activeUsers=requestedUsers.length?db.prepare(`SELECT id FROM users WHERE active=1 AND id IN (${requestedUsers.map(()=>'?').join(',')})`).all(...requestedUsers):[];const activeSet=new Set(activeUsers.map(user=>user.id));const rotationUsers=requestedUsers.filter(id=>activeSet.has(id));
  if(assignmentMode==='ROUND_ROBIN'&&!rotationUsers.length)return res.status(400).json({message:'Select at least one active user for automatic rotation'});

  const duplicate = db.prepare(`
    SELECT id FROM leads
    WHERE (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+',''),char(10),'') = REPLACE(?,'+','')) OR (? <> '' AND lower(email) = lower(?))
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO leads (
      company_name, contact_name, phone, email, city, source, requirement,box_size,quantity,quantity_range,per_box_budget,
      estimated_value, status, assigned_to, next_followup_at, notes, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let imported = 0;
  let skipped = 0;
  const assignmentCounts={};
  const errors = [];

  const tx = db.transaction(() => {
    rows.forEach((row, index) => {
      const data=standardLeadRow(row);const {contactName,phone,email}=data;
      if (!contactName || (!phone && !email)) {
        skipped++;
        errors.push(`Row ${index + 2}: contact name and phone/email are required`);
        return;
      }
      if (duplicate.get(phone, phone, email, email)) {
        skipped++;
        return;
      }

      let nextFollowupAt = data.nextFollowup;
      if (nextFollowupAt) {
        const parsed = new Date(nextFollowupAt);
        nextFollowupAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      } else nextFollowupAt = null;

      let status = String(data.status||'NEW_LEAD').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      if (!masterCodes('LEAD_STATUS',statuses).includes(status)) status = 'NEW_LEAD';

      const rowOwner=assignmentMode==='ROUND_ROBIN'?rotationUsers[Math.floor(imported/leadsPerUser)%rotationUsers.length]:assignedTo;
      const importedLead = insert.run(
        data.companyName||null,
        contactName,
        phone || null,
        email || null,
        data.city||null,
        data.source||'Excel Import',
        data.requirement||null,
        data.boxSize||null,
        data.quantity,
        data.quantityRange||null,
        data.perBoxBudget,
        data.estimatedValue,
        status,
        rowOwner,
        nextFollowupAt,
        data.notes||null,
        req.user.id
      );
      if (status === 'QUOTATION_SENT') db.prepare('UPDATE leads SET quote_sent_at = ? WHERE id = ?').run(new Date().toISOString(), importedLead.lastInsertRowid);
      if(rowOwner){notifyLeadAssigned(rowOwner,importedLead.lastInsertRowid,`import:${importedLead.lastInsertRowid}:user:${rowOwner}`);assignmentCounts[rowOwner]=(assignmentCounts[rowOwner]||0)+1;}
      imported++;
    });
  });
  tx();

  const assignedUsers=Object.entries(assignmentCounts).map(([userId,count])=>({userId:Number(userId),name:db.prepare('SELECT name FROM users WHERE id=?').get(Number(userId))?.name||'Unknown User',count}));
  res.json({ imported, skipped, totalRows: rows.length, assignedUsers, errors: errors.slice(0, 20) });
});

export default router;
