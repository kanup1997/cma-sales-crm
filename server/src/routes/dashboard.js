import { Router } from 'express';
import db from '../db.js';
import { authRequired } from '../middleware/auth.js';
import {requirePermission} from '../permissions.js';

const router = Router();
router.use(authRequired,requirePermission('PAGE_DASHBOARD'));

router.get('/', (req, res) => {
  const { start, end, analyticsStart=start, analyticsEnd=end } = req.query;
  if (!start || !end) return res.status(400).json({ message: 'start and end are required' });

  const scopeSql = req.user.role === 'ADMIN' ? '1=1' : 'l.assigned_to = ?';
  const scopeParams = req.user.role === 'ADMIN' ? [] : [req.user.id];
  const activeScopeSql=`(${scopeSql}) AND l.status<>'NOT_INTERESTED'`;

  const total = db.prepare(`SELECT COUNT(*) AS count FROM leads l WHERE ${activeScopeSql}`).get(...scopeParams).count;
  const notInterested = db.prepare(`SELECT COUNT(*) AS count FROM leads l WHERE ${scopeSql} AND l.status='NOT_INTERESTED'`).get(...scopeParams).count;
  const open = db.prepare(`
    SELECT COUNT(*) AS count FROM leads l
    WHERE ${activeScopeSql} AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')
  `).get(...scopeParams).count;
  const today = db.prepare(`
    SELECT COUNT(*) AS count FROM leads l
    WHERE ${activeScopeSql} AND l.next_followup_at >= ? AND l.next_followup_at < ?
  `).get(...scopeParams, start, end).count;
  const overdue = db.prepare(`
    SELECT COUNT(*) AS count FROM leads l
    WHERE ${activeScopeSql} AND l.next_followup_at IS NOT NULL
      AND l.next_followup_at < ? AND l.status NOT IN ('CLOSED_WON','CLOSED_LOST')
  `).get(...scopeParams, start).count;

  let unassigned = 0;
  if (req.user.role === 'ADMIN') {
    unassigned = db.prepare("SELECT COUNT(*) AS count FROM leads WHERE assigned_to IS NULL AND status<>'NOT_INTERESTED'").get().count;
  }

  const schedule = db.prepare(`
    SELECT l.*, u.name AS assigned_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE ${activeScopeSql} AND l.next_followup_at >= ? AND l.next_followup_at < ?
    ORDER BY l.next_followup_at ASC
    LIMIT 100
  `).all(...scopeParams, start, end);

  const orderSummary = db.prepare(`
    SELECT COUNT(*) AS final_orders, COALESCE(SUM(p.total),0) AS order_value,
      COALESCE(SUM(p.advance_amount),0) AS payment_received,
      COALESCE(SUM(p.pending_amount),0) AS pending_payment,
      COALESCE(AVG(p.total),0) AS average_order_value
    FROM purchase_orders p JOIN leads l ON l.id=p.lead_id
    WHERE ${scopeSql} AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?)
  `).get(...scopeParams, analyticsStart, analyticsEnd);
  const samplesSent = db.prepare(`SELECT COUNT(*) AS count FROM leads l WHERE ${activeScopeSql} AND l.sample_sent=1 AND datetime(l.sample_sent_at)>=datetime(?) AND datetime(l.sample_sent_at)<datetime(?)`).get(...scopeParams,analyticsStart,analyticsEnd).count;
  const invoices = db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(p.total),0) AS value FROM tax_invoices i JOIN purchase_orders p ON p.id=i.purchase_order_id JOIN leads l ON l.id=p.lead_id WHERE ${scopeSql} AND datetime(i.created_at)>=datetime(?) AND datetime(i.created_at)<datetime(?)`).get(...scopeParams,analyticsStart,analyticsEnd);
  const recentOrders=db.prepare(`SELECT p.id,p.po_number,p.total,p.advance_amount,p.pending_amount,p.created_at,p.status,l.id lead_id,l.contact_name,l.company_name,u.name owner_name,i.invoice_number FROM purchase_orders p JOIN leads l ON l.id=p.lead_id LEFT JOIN users u ON u.id=l.assigned_to LEFT JOIN tax_invoices i ON i.purchase_order_id=p.id WHERE ${scopeSql} AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?) ORDER BY datetime(p.created_at) DESC LIMIT 10`).all(...scopeParams,analyticsStart,analyticsEnd);
  const received=Number(orderSummary.payment_received||0),orderValue=Number(orderSummary.order_value||0);
  const analytics={...orderSummary,samples_sent:samplesSent,invoices_created:invoices.count,invoiced_value:invoices.value,collection_rate:orderValue?Math.round(received/orderValue*100):0};

  res.json({ stats: { total, open, today, overdue, unassigned, notInterested }, schedule,analytics,recentOrders });
});

export default router;
