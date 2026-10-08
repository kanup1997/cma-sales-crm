import {io} from 'socket.io-client';
import {API_BASE} from './api';

const socketUrl=API_BASE.replace(/\/api\/?$/,'');

export function openNotificationSocket(onLeadAssigned){
  const socket=io(socketUrl,{auth:callback=>callback({token:localStorage.getItem('cma_crm_token')||''}),transports:['websocket','polling'],reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:10000});
  socket.on('lead-assigned',onLeadAssigned);
  return socket;
}
