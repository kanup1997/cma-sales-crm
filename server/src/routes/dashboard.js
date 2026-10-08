import {Router} from 'express';
import {queryAll,queryOne} from '../db.js';
import {authRequired} from '../middleware/auth.js';
import {requirePermission} from '../permissions.js';
import {asyncHandler} from '../utils/asyncHandler.js';

const router=Router();
const terminal="('NOT_INTERESTED','CLOSED_WON','CLOSED_LOST')";
const active=`l.status NOT IN ${terminal}`;
const createdInPeriod=`datetime(l.created_at)>=datetime(?) AND datetime(l.created_at)<datetime(?)`;

router.use(authRequired,requirePermission('PAGE_DASHBOARD'));

router.get('/',asyncHandler(async(req,res)=>{
  const {start,end,leadStart=start,leadEnd=end,analyticsStart=leadStart,analyticsEnd=leadEnd,userId=''}=req.query;
  if(!start||!end||!leadStart||!leadEnd)return res.status(400).json({message:'today and lead period are required'});

  const requestedUserId=req.user.role==='ADMIN'&&Number.isInteger(Number(userId))&&Number(userId)>0?Number(userId):null;
  const scopedUserId=requestedUserId||(req.user.role==='ADMIN'?null:req.user.id);
  const ownScope=scopedUserId?'l.assigned_to=?':'1=1';
  const ownParams=scopedUserId?[scopedUserId]:[];
  const workedBy=scopedUserId?' AND f.user_id=?':'';
  const workedParams=scopedUserId?[scopedUserId]:[];
  const cohortScope=`${ownScope} AND ${createdInPeriod}`;
  const cohortParams=[...ownParams,leadStart,leadEnd];

  const statsRequest=queryOne(`SELECT
    COUNT(*) total,
    COUNT(CASE WHEN ${active} THEN 1 END) active,
    COUNT(CASE WHEN ${active} AND l.status='NEW_LEAD' AND NOT EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id) THEN 1 END) newLeads,
    COUNT(CASE WHEN ${active} AND EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id) THEN 1 END) working,
    COUNT(CASE WHEN ${active} AND l.next_followup_at>=? AND l.next_followup_at<? THEN 1 END) dueToday,
    COUNT(CASE WHEN ${active} AND l.next_followup_at IS NOT NULL AND l.next_followup_at<? THEN 1 END) overdue,
    COUNT(CASE WHEN ${active} AND EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id${workedBy} AND f.followup_at>=? AND f.followup_at<?) THEN 1 END) workedToday,
    COUNT(CASE WHEN l.status='NOT_INTERESTED' THEN 1 END) notInterested,
    COUNT(CASE WHEN l.status='CLOSED_LOST' THEN 1 END) closedLost,
    COUNT(CASE WHEN l.status='CLOSED_WON' THEN 1 END) closedWon,
    COUNT(CASE WHEN ${active} AND l.assigned_to IS NULL THEN 1 END) unassigned,
    COUNT(CASE WHEN l.sample_sent=1 AND datetime(l.sample_sent_at)>=datetime(?) AND datetime(l.sample_sent_at)<datetime(?) THEN 1 END) samplesSent
    FROM leads l WHERE ${cohortScope}`,[start,end,start,...workedParams,start,end,analyticsStart,analyticsEnd,...cohortParams]);

  const scheduleRequest=queryAll(`SELECT l.*,u.name assigned_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ${cohortScope} AND ${active} AND l.next_followup_at>=? AND l.next_followup_at<? ORDER BY l.next_followup_at LIMIT 100`,[...cohortParams,start,end]);
  const ordersRequest=queryOne(`SELECT COUNT(*) final_orders,COALESCE(SUM(p.total),0) order_value,COALESCE(SUM(p.advance_amount),0) payment_received,COALESCE(SUM(p.pending_amount),0) pending_payment,COALESCE(AVG(p.total),0) average_order_value FROM purchase_orders p JOIN leads l ON l.id=p.lead_id WHERE ${cohortScope} AND p.status<>'CANCELLED' AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?)`,[...cohortParams,analyticsStart,analyticsEnd]);
  const invoicesRequest=queryOne(`SELECT COUNT(*) count,COALESCE(SUM(p.total),0) value FROM tax_invoices i JOIN purchase_orders p ON p.id=i.purchase_order_id JOIN leads l ON l.id=p.lead_id WHERE ${cohortScope} AND datetime(i.created_at)>=datetime(?) AND datetime(i.created_at)<datetime(?)`,[...cohortParams,analyticsStart,analyticsEnd]);
  const recentOrdersRequest=queryAll(`SELECT p.id,p.po_number,p.total,p.advance_amount,p.pending_amount,p.created_at,p.status,l.id lead_id,l.contact_name,l.company_name,u.name owner_name,i.invoice_number FROM purchase_orders p JOIN leads l ON l.id=p.lead_id LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN tax_invoices i ON i.purchase_order_id=p.id WHERE ${cohortScope} AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?) ORDER BY datetime(p.created_at) DESC LIMIT 10`,[...cohortParams,analyticsStart,analyticsEnd]);
  const teamRequest=req.user.role==='ADMIN'?queryAll(`SELECT u.id user_id,u.name,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active}) active,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active} AND l.status='NEW_LEAD' AND NOT EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id)) newLeads,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active} AND EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id)) working,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active} AND l.next_followup_at>=? AND l.next_followup_at<?) dueToday,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active} AND l.next_followup_at IS NOT NULL AND l.next_followup_at<?) overdue,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND ${active} AND EXISTS(SELECT 1 FROM followups f WHERE f.lead_id=l.id AND f.user_id=u.id AND f.followup_at>=? AND f.followup_at<?)) workedToday,
    (SELECT COUNT(*) FROM leads l WHERE l.assigned_to=u.id AND ${createdInPeriod} AND l.status='CLOSED_WON') closedWon
    FROM users u WHERE u.active=1${requestedUserId?' AND u.id=?':''} ORDER BY workedToday DESC,active DESC,u.name`,[
      leadStart,leadEnd,leadStart,leadEnd,leadStart,leadEnd,
      leadStart,leadEnd,start,end,leadStart,leadEnd,start,
      leadStart,leadEnd,start,end,leadStart,leadEnd,...(requestedUserId?[requestedUserId]:[])
    ]):Promise.resolve([]);

  const [leadStats,schedule,orderSummary,invoices,recentOrders,team]=await Promise.all([statsRequest,scheduleRequest,ordersRequest,invoicesRequest,recentOrdersRequest,teamRequest]);
  const stats=Object.fromEntries(Object.entries(leadStats||{}).map(([key,value])=>[key,Number(value||0)]));
  const orderValue=Number(orderSummary?.order_value||0),received=Number(orderSummary?.payment_received||0);
  res.json({stats,schedule,team,analytics:{...orderSummary,samples_sent:stats.samplesSent||0,invoices_created:Number(invoices?.count||0),invoiced_value:Number(invoices?.value||0),collection_rate:orderValue?Math.round(received/orderValue*100):0},recentOrders});
}));

export default router;
