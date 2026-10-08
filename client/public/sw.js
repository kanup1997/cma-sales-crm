const CACHE_VERSION='cma-crm-push-v2';

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{data={title:'New lead assigned',body:event.data?.text()||''};}
  const title=data.title||'New lead assigned';
  const options={body:data.body||'A new lead has been assigned to you.',icon:'/favicon.ico',badge:'/favicon.ico',tag:data.tag||CACHE_VERSION,renotify:true,data:{url:data.url||'/',leadId:data.leadId}};
  event.waitUntil(Promise.all([
    self.registration.showNotification(title,options),
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>clients.forEach(client=>client.postMessage({type:'lead-assigned',...data})))
  ]));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{const existing=clients.find(client=>client.url.startsWith(self.location.origin));if(existing){existing.focus();existing.postMessage({type:'lead-assigned',url:event.notification.data?.url,leadId:event.notification.data?.leadId});return existing.navigate(url);}return self.clients.openWindow(url);}));
});
