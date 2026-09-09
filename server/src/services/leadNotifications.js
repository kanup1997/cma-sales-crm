import {run} from '../db.js';

export async function notifyLeadAssigned(userId,leadId,eventKey){
  const user=Number(userId),lead=Number(leadId);if(!user||!lead)return;
  await run('INSERT OR IGNORE INTO lead_notifications(user_id,lead_id,event_key) VALUES(?,?,?)',[user,lead,String(eventKey||`lead:${lead}:user:${user}`)]);
}
