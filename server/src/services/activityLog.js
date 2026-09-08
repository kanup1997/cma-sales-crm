import db from '../db.js';
export function logActivity(userId,leadId,eventType,title,details='',amount=0){if(!userId)return;db.prepare('INSERT INTO activity_events(user_id,lead_id,event_type,title,details,amount) VALUES(?,?,?,?,?,?)').run(Number(userId),leadId?Number(leadId):null,eventType,title,String(details||''),Math.max(0,Number(amount)||0));}
