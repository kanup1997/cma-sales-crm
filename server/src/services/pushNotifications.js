import webpush from 'web-push';
import {queryAll,queryOne,run} from '../db.js';

let configuration=null;

async function setting(key){return (await queryOne('SELECT value FROM application_settings WHERE key=?',[key]))?.value||null;}
async function saveSetting(key,value){await run("INSERT INTO application_settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[key,value]);}

export async function configurePushNotifications(){
  let publicKey=process.env.VAPID_PUBLIC_KEY||await setting('push_vapid_public_key');
  let privateKey=process.env.VAPID_PRIVATE_KEY||await setting('push_vapid_private_key');
  if(!publicKey||!privateKey){
    const generated=webpush.generateVAPIDKeys();
    publicKey=generated.publicKey;privateKey=generated.privateKey;
    await saveSetting('push_vapid_public_key',publicKey);
    await saveSetting('push_vapid_private_key',privateKey);
  }
  const subject=process.env.VAPID_SUBJECT||'mailto:admin@chocomanualart.com';
  webpush.setVapidDetails(subject,publicKey,privateKey);
  configuration={publicKey};
  console.log('Browser push notifications configured');
}

export function pushPublicKey(){return configuration?.publicKey||null;}

export async function sendLeadAssignmentPush({userId,leadId,contactName,companyName}){
  if(!configuration)return;
  const subscriptions=await queryAll('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?',[Number(userId)]);
  if(!subscriptions.length)return;
  const title='New lead assigned';
  const customer=contactName||'New customer';
  const body=companyName?`${customer} · ${companyName}`:customer;
  const payload=JSON.stringify({type:'lead-assigned',leadId:Number(leadId),title,body,url:`/leads/${Number(leadId)}`,tag:`lead-assigned-${Number(leadId)}`});
  await Promise.all(subscriptions.map(async subscription=>{
    try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:60*60,urgency:'high'});
      await run("UPDATE push_subscriptions SET last_seen_at=datetime('now') WHERE id=?",[subscription.id]);
    }catch(error){
      const status=Number(error?.statusCode);
      if(status===404||status===410)await run('DELETE FROM push_subscriptions WHERE id=?',[subscription.id]);
      else console.error('Push delivery failed:',error?.message||error);
    }
  }));
}
