import { Router } from 'express';
import {queryAll} from '../db.js';
import { authRequired } from '../middleware/auth.js';
import {requirePermission} from '../permissions.js';
import {asyncHandler} from '../utils/asyncHandler.js';

const router = Router();
router.use(authRequired,requirePermission('PAGE_REPORTS'));

router.get('/work-activity',asyncHandler(async(req,res)=>{
  const from=req.query.from,to=req.query.to;if(!from||!to)return res.status(400).json({message:'From and to dates are required'});
  const requestedUser=Number(req.query.userId)||null;const userId=req.user.role==='ADMIN'?requestedUser:req.user.id;
  const eventWhere=['datetime(a.created_at)>=datetime(?)','datetime(a.created_at)<datetime(?)'];const eventParams=[from,to];if(userId){eventWhere.push('a.user_id=?');eventParams.push(userId);}
  const events=await queryAll(`SELECT a.*,u.name user_name,l.contact_name,l.company_name,l.phone FROM activity_events a JOIN users u ON u.id=a.user_id LEFT JOIN leads l ON l.id=a.lead_id WHERE ${eventWhere.join(' AND ')} ORDER BY datetime(a.created_at) DESC,a.id DESC`,eventParams);
  const docScope=userId?'p.created_by=?':'1=1',docParams=userId?[userId]:[];
  const orders=await queryAll(`SELECT p.id,p.lead_id,p.po_number,p.total,p.advance_amount,p.pending_amount,p.created_at,p.created_by user_id,u.name user_name,l.contact_name,l.company_name FROM purchase_orders p JOIN users u ON u.id=p.created_by JOIN leads l ON l.id=p.lead_id WHERE ${docScope} AND p.manual_invoice=0 AND p.status<>'CANCELLED' AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?)`,[...docParams,from,to]);
  const invoiceScope=userId?'i.created_by=?':'1=1',invoiceParams=userId?[userId]:[];
  const invoices=await queryAll(`SELECT i.id,i.invoice_number,i.created_at,i.created_by user_id,u.name user_name,p.lead_id,p.total,l.contact_name,l.company_name FROM tax_invoices i JOIN users u ON u.id=i.created_by JOIN purchase_orders p ON p.id=i.purchase_order_id JOIN leads l ON l.id=p.lead_id WHERE ${invoiceScope} AND datetime(i.created_at)>=datetime(?) AND datetime(i.created_at)<datetime(?)`,[...invoiceParams,from,to]);
  const activity=[...events.map(row=>({...row,source:'ACTIVITY'})),...orders.map(row=>({id:`po-${row.id}`,user_id:row.user_id,user_name:row.user_name,lead_id:row.lead_id,contact_name:row.contact_name,company_name:row.company_name,event_type:'PO_CREATED',title:`Purchase order ${row.po_number} created`,details:`Total â‚¹${Number(row.total).toLocaleString('en-IN')} Â· Received â‚¹${Number(row.advance_amount).toLocaleString('en-IN')}`,amount:row.total,created_at:row.created_at,source:'ORDER'})),...invoices.map(row=>({id:`invoice-${row.id}`,user_id:row.user_id,user_name:row.user_name,lead_id:row.lead_id,contact_name:row.contact_name,company_name:row.company_name,event_type:'INVOICE_CREATED',title:`Tax invoice ${row.invoice_number} created`,details:`Invoice value â‚¹${Number(row.total).toLocaleString('en-IN')}`,amount:row.total,created_at:row.created_at,source:'INVOICE'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const leadIds=new Set(activity.map(row=>row.lead_id).filter(Boolean));const metrics={leadsWorked:leadIds.size,activities:events.length,followups:events.filter(row=>row.event_type==='FOLLOW_UP').length,samples:events.filter(row=>row.event_type==='SAMPLE_SENT').length,quotations:events.filter(row=>row.event_type==='QUOTATION_SENT').length,orders:orders.length,orderValue:orders.reduce((sum,row)=>sum+Number(row.total||0),0),paymentReceived:orders.reduce((sum,row)=>sum+Number(row.advance_amount||0),0),pendingPayment:orders.reduce((sum,row)=>sum+Number(row.pending_amount||0),0),invoices:invoices.length};
  const peopleMap=new Map();for(const row of activity){if(!peopleMap.has(row.user_id))peopleMap.set(row.user_id,{userId:row.user_id,name:row.user_name,leadIds:new Set(),activities:0,followups:0,samples:0,quotations:0,orders:0,orderValue:0});const person=peopleMap.get(row.user_id);if(row.lead_id)person.leadIds.add(row.lead_id);if(row.source==='ACTIVITY'){person.activities++;if(row.event_type==='FOLLOW_UP')person.followups++;if(row.event_type==='SAMPLE_SENT')person.samples++;if(row.event_type==='QUOTATION_SENT')person.quotations++;}if(row.event_type==='PO_CREATED'){person.orders++;person.orderValue+=Number(row.amount||0);}}
  const people=[...peopleMap.values()].map(person=>({...person,leadsWorked:person.leadIds.size,leadIds:undefined})).sort((a,b)=>b.activities-a.activities||b.orders-a.orders);
  res.json({metrics,people,activity});
}));

router.get('/', asyncHandler(async(req,res) => {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const owner = req.query.owner || '';
  const where = [];
  const params = [];
  if (req.user.role !== 'ADMIN') { where.push('l.assigned_to = ?'); params.push(req.user.id); }
  else if (owner) {
    if (owner === 'unassigned') where.push('l.assigned_to IS NULL');
    else { where.push('l.assigned_to = ?'); params.push(Number(owner)); }
  }
  const rows = await queryAll(`SELECT l.id,l.contact_name,l.company_name,l.phone,l.box_size,l.quantity,l.per_box_budget,l.estimated_value,l.status,l.assigned_to,u.name assigned_name,l.quote_sent_at,l.finalized_at,l.sample_sent_at,l.order_sent_at FROM leads l LEFT JOIN users u ON u.id=l.assigned_to ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY l.updated_at DESC`,params);
  const inRange = value => { if(!value)return false; const d=new Date(value); return (!from||d>=from)&&(!to||d<to); };
  const metric = row => ({quote:inRange(row.quote_sent_at),sample:inRange(row.sample_sent_at),final:inRange(row.finalized_at),order:inRange(row.order_sent_at)});
  const relevant = rows.map(row=>({...row,events:metric(row)})).filter(row=>Object.values(row.events).some(Boolean));
  const totals = relevant.reduce((a,row)=>{Object.entries(row.events).forEach(([key,value])=>{if(value)a[key]++;});return a;},{quote:0,sample:0,final:0,order:0});
  const peopleMap = new Map();
  relevant.forEach(row=>{const key=row.assigned_to||'unassigned';if(!peopleMap.has(key))peopleMap.set(key,{id:row.assigned_to,name:row.assigned_name||'Unassigned',quote:0,sample:0,final:0,order:0,totalClients:0});const person=peopleMap.get(key);person.totalClients++;Object.entries(row.events).forEach(([event,value])=>{if(value)person[event]++;});});
  res.json({totals,people:[...peopleMap.values()].sort((a,b)=>b.order-a.order||b.final-a.final||a.name.localeCompare(b.name)),leads:relevant});
}));


export default router;
