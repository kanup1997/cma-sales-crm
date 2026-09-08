import {Router} from 'express';
import db from '../db.js';
import {adminOnly,authRequired} from '../middleware/auth.js';

const router=Router();router.use(authRequired,adminOnly);
const count=table=>db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count;
const snapshot=()=>({leads:count('leads'),followups:count('followups'),purchaseOrders:count('purchase_orders'),taxInvoices:count('tax_invoices'),notifications:count('lead_notifications'),sheetRows:count('sheet_imported_rows'),syncLogs:count('sheet_sync_logs'),sheetSyncEnabled:Boolean(db.prepare('SELECT enabled FROM sheet_integrations ORDER BY id LIMIT 1').get()?.enabled)});
const phrases={INVOICES:'RESET INVOICES',ORDERS:'RESET ORDERS',LEADS:'RESET LEADS',ALL:'RESET ALL DATA'};

router.get('/',(req,res)=>res.json({counts:snapshot()}));

router.post('/reset',(req,res)=>{
  const target=String(req.body?.target||'').toUpperCase();if(!phrases[target])return res.status(400).json({message:'Invalid reset target'});
  if(req.body?.confirmation!==phrases[target])return res.status(400).json({message:`Type ${phrases[target]} to confirm`});
  const before=snapshot();
  db.transaction(()=>{
    if(target==='INVOICES'){
      const manualLeadIds=db.prepare('SELECT lead_id FROM purchase_orders WHERE manual_invoice=1').all().map(row=>row.lead_id);
      db.prepare('DELETE FROM tax_invoices').run();db.prepare('DELETE FROM purchase_orders WHERE manual_invoice=1').run();
      if(manualLeadIds.length)db.prepare(`DELETE FROM leads WHERE id IN (${manualLeadIds.map(()=>'?').join(',')})`).run(...manualLeadIds);
      db.prepare("UPDATE purchase_orders SET status='CREATED' WHERE status='INVOICED'").run();
      db.prepare("UPDATE document_sequences SET next_value=10001 WHERE name='invoice'").run();
    }
    if(target==='ORDERS'){
      db.prepare('DELETE FROM tax_invoices').run();db.prepare('DELETE FROM purchase_orders').run();db.prepare("DELETE FROM leads WHERE source IN ('Manual PO','Manual Invoice')").run();
      db.prepare("UPDATE document_sequences SET next_value=10001 WHERE name='invoice'").run();db.prepare("UPDATE document_sequences SET next_value=1 WHERE name='purchase_order'").run();
    }
    if(target==='LEADS'||target==='ALL'){
      db.prepare('DELETE FROM tax_invoices').run();db.prepare('DELETE FROM purchase_orders').run();db.prepare('DELETE FROM leads').run();db.prepare('DELETE FROM activity_events').run();
      db.prepare("UPDATE document_sequences SET next_value=10001 WHERE name='invoice'").run();db.prepare("UPDATE document_sequences SET next_value=1 WHERE name='purchase_order'").run();
    }
    if(target==='ALL'){
      db.prepare('DELETE FROM sheet_imported_rows').run();db.prepare('DELETE FROM sheet_sync_logs').run();
      db.prepare("UPDATE sheet_integrations SET enabled=0,assignment_cursor=0,last_sync_at=NULL,last_success_at=NULL,last_error=NULL,updated_at=datetime('now')").run();
    }
    const sequenceTables=target==='INVOICES'?['tax_invoices']:(target==='ORDERS'?['tax_invoices','purchase_orders']:['leads','followups','purchase_orders','tax_invoices','lead_notifications']);
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${sequenceTables.map(()=>'?').join(',')})`).run(...sequenceTables);
  })();
  res.json({message:`${target==='ALL'?'All transactional test data':target.toLowerCase()} cleared successfully`,before,counts:snapshot()});
});

export default router;
