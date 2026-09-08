import db from '../db.js';

export function notifyLeadAssigned(userId,leadId,eventKey){
  const user=Number(userId),lead=Number(leadId);if(!user||!lead)return;
  db.prepare('INSERT OR IGNORE INTO lead_notifications(user_id,lead_id,event_key) VALUES(?,?,?)').run(user,lead,String(eventKey||`lead:${lead}:user:${user}`));
}
