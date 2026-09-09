import {Router} from 'express';
import {queryAll,queryOne,run} from '../db.js';
import {authRequired} from '../middleware/auth.js';
import {asyncHandler} from '../utils/asyncHandler.js';
const router=Router();router.use(authRequired);
router.get('/',asyncHandler(async(req,res)=>{const notifications=await queryAll(`SELECT n.id,n.lead_id,n.read_at,n.created_at,l.contact_name,l.company_name,l.phone,l.source FROM lead_notifications n JOIN leads l ON l.id=n.lead_id WHERE n.user_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 40`,[req.user.id]);const unreadCount=Number((await queryOne('SELECT COUNT(*) count FROM lead_notifications WHERE user_id=? AND read_at IS NULL',[req.user.id]))?.count||0);res.json({notifications,unreadCount});}));
router.post('/leads/:leadId/read',asyncHandler(async(req,res)=>{await run("UPDATE lead_notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE user_id=? AND lead_id=?",[req.user.id,Number(req.params.leadId)]);res.json({message:'Lead notification marked as read'});}));
router.post('/read-all',asyncHandler(async(req,res)=>{await run("UPDATE lead_notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL",[req.user.id]);res.json({message:'All notifications marked as read'});}));
export default router;
