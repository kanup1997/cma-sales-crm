import {queryOne,run} from '../db.js';
import {sendLeadAssignmentPush} from './pushNotifications.js';
import {emitLeadAssignment} from './realtime.js';

export async function notifyLeadAssigned(userId,leadId,eventKey){
  const user=Number(userId),lead=Number(leadId);if(!user||!lead)return;
  const result=await run('INSERT OR IGNORE INTO lead_notifications(user_id,lead_id,event_key) VALUES(?,?,?)',[user,lead,String(eventKey||`lead:${lead}:user:${user}`)]);
  // LibSQL returns rowsAffected for normal writes. Treat only an explicit zero as
  // a duplicate event; some compatible drivers omit the field altogether.
  if(Number(result?.rowsAffected)===0)return;
  const leadDetails=await queryOne('SELECT contact_name,company_name,phone FROM leads WHERE id=?',[lead]);
  const notification=await queryOne(`SELECT n.id,n.lead_id,n.read_at,n.created_at,l.contact_name,l.company_name,l.phone,l.source FROM lead_notifications n JOIN leads l ON l.id=n.lead_id WHERE n.event_key=?`,[String(eventKey||`lead:${lead}:user:${user}`)]);
  emitLeadAssignment(user,notification);
  try{await sendLeadAssignmentPush({userId:user,leadId:lead,contactName:leadDetails?.contact_name,companyName:leadDetails?.company_name,phone:leadDetails?.phone});}
  catch(error){console.error('Lead assignment push could not be sent:',error?.message||error);}
}
