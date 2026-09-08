import {Router} from 'express';
import db from '../db.js';
import {authRequired} from '../middleware/auth.js';

const router=Router();router.use(authRequired);

router.get('/',(req,res)=>{
  const notifications=db.prepare(`SELECT n.id,n.lead_id,n.read_at,n.created_at,l.contact_name,l.company_name,l.phone,l.source
    FROM lead_notifications n JOIN leads l ON l.id=n.lead_id
    WHERE n.user_id=? ORDER BY n.read_at IS NULL DESC,datetime(n.created_at) DESC,n.id DESC LIMIT 20`).all(req.user.id);
  const unreadCount=db.prepare('SELECT COUNT(*) count FROM lead_notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).count;
  res.json({unreadCount,notifications});
});

router.post('/leads/:leadId/read',(req,res)=>{db.prepare("UPDATE lead_notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE user_id=? AND lead_id=?").run(req.user.id,Number(req.params.leadId));res.json({message:'Lead notification marked as read'});});
router.post('/read-all',(req,res)=>{db.prepare("UPDATE lead_notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL").run(req.user.id);res.json({message:'All notifications marked as read'});});

export default router;
