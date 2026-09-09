import {run} from '../db.js';
export async function logActivity(userId,leadId,eventType,title,details='',amount=0){if(!userId)return;await run('INSERT INTO activity_events(user_id,lead_id,event_type,title,details,amount) VALUES(?,?,?,?,?,?)',[Number(userId),leadId?Number(leadId):null,eventType,title,String(details||''),Math.max(0,Number(amount)||0)]);}
