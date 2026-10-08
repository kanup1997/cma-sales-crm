import {api} from './api';

function urlBase64ToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const binary=window.atob(base64);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function supported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}

async function saveSubscription(subscription){await api('/notifications/push/subscribe',{method:'POST',body:JSON.stringify(subscription),silent:true});}

export async function syncPushSubscription(){
  if(!supported())return {state:'unsupported'};
  const registration=await navigator.serviceWorker.register('/sw.js');
  const subscription=await registration.pushManager.getSubscription();
  if(subscription){await saveSubscription(subscription.toJSON());return {state:'enabled'};}
  return {state:Notification.permission==='denied'?'blocked':'ready'};
}

export async function enablePushNotifications(){
  if(!supported())return {state:'unsupported'};
  const registration=await navigator.serviceWorker.register('/sw.js');
  let permission=Notification.permission;
  if(permission==='default')permission=await Notification.requestPermission();
  if(permission!=='granted')return {state:'blocked'};
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    const {publicKey}=await api('/notifications/push/public-key',{silent:true});
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
  }
  await saveSubscription(subscription.toJSON());
  return {state:'enabled'};
}
