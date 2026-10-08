import {Server} from 'socket.io';
import jwt from 'jsonwebtoken';
import {queryOne} from '../db.js';
import {sessionIsActive} from './sessions.js';

let io=null;

export function startRealtime(httpServer,allowedOrigins){
  io=new Server(httpServer,{cors:{origin:allowedOrigins,credentials:true,methods:['GET','POST']}});
  io.use(async(socket,next)=>{
    try{
      const token=String(socket.handshake.auth?.token||'');
      const payload=jwt.verify(token,process.env.JWT_SECRET||'dev-secret-change-me');
      if(!await sessionIsActive(payload.sid,payload.id))return next(new Error('Session expired'));
      const user=await queryOne('SELECT id FROM users WHERE id=? AND active=1',[Number(payload.id)]);
      if(!user)return next(new Error('User is inactive'));
      socket.data.userId=Number(user.id);
      next();
    }catch{next(new Error('Authentication failed'));}
  });
  io.on('connection',socket=>socket.join(`user:${socket.data.userId}`));
  return io;
}

export function emitLeadAssignment(userId,notification){
  if(!io||!notification)return;
  io.to(`user:${Number(userId)}`).emit('lead-assigned',notification);
}
