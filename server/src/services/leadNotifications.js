import {queryOne,run} from '../db.js';
import {sendLeadAssignmentPush} from './pushNotifications.js';

export async function notifyLeadAssigned(userId,leadId,eventKey){
  const user=Number(userId),lead=Number(leadId);if(!user||!lead)return;
  const result=await run('INSERT OR IGNORE INTO lead_notifications(user_id,lead_id,event_key) VALUES(?,?,?)',[user,lead,String(eventKey||`lead:${lead}:user:${user}`)]);
  if(!Number(result?.rowsAffected))return;
  const leadDetails=await queryOne('SELECT contact_name,company_name FROM leads WHERE id=?',[lead]);
  try{await sendLeadAssignmentPush({userId:user,leadId:lead,contactName:leadDetails?.contact_name,companyName:leadDetails?.company_name});}
  catch(error){console.error('Lead assignment push could not be sent:',error?.message||error);}
}
