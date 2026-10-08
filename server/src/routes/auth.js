import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne,run } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {permissionsFor} from '../permissions.js';
import {clearRefreshCookie,createSession,readRefreshToken,refreshCookieOptions,refreshSession,revokeAllUserSessions,revokeRefreshToken} from '../services/sessions.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email.trim()]);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const userId = Number(user.id);
  const session=await createSession({id:userId,role:user.role});
  res.cookie('cma_crm_refresh',session.token,refreshCookieOptions());

  res.json({
    token:session.accessToken,
    user: { id:userId,name:user.name,email:user.email,role:user.role,active:user.active,phone:user.phone||'',designation:user.designation||'',city:user.city||'',bio:user.bio||'',created_at:user.created_at,permissions:await permissionsFor(user) }
  });
}));

router.post('/refresh',asyncHandler(async(req,res)=>{
  const renewed=await refreshSession(readRefreshToken(req));
  if(!renewed){clearRefreshCookie(res);return res.status(401).json({message:'Your session has ended. Please log in again.'});}
  res.cookie('cma_crm_refresh',renewed.token,refreshCookieOptions());
  const user=renewed.user;
  res.json({token:renewed.accessToken,user:{id:Number(user.id),name:user.name,email:user.email,role:user.role,active:user.active,phone:user.phone||'',designation:user.designation||'',city:user.city||'',bio:user.bio||'',created_at:user.created_at,permissions:await permissionsFor(user)}});
}));

router.post('/logout',asyncHandler(async(req,res)=>{
  await revokeRefreshToken(readRefreshToken(req));
  clearRefreshCookie(res);
  res.json({message:'Logged out successfully'});
}));

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/profile',authRequired,asyncHandler(async(req,res)=>{const {name,email,phone,designation,city,bio,currentPassword,newPassword}=req.body||{};if(!name?.trim()||!email?.trim())return res.status(400).json({message:'Name and email are required'});const current=await queryOne('SELECT * FROM users WHERE id=?',[req.user.id]);if(newPassword){if(String(newPassword).length<6)return res.status(400).json({message:'New password must be at least 6 characters'});if(!currentPassword||!bcrypt.compareSync(currentPassword,current.password_hash))return res.status(400).json({message:'Current password is incorrect'});}try{await run(`UPDATE users SET name=?,email=?,phone=?,designation=?,city=?,bio=?,password_hash=? WHERE id=?`,[name.trim(),email.trim().toLowerCase(),phone?.trim()||null,designation?.trim()||null,city?.trim()||null,bio?.trim()||null,newPassword?bcrypt.hashSync(newPassword,10):current.password_hash,req.user.id]);if(newPassword){await revokeAllUserSessions(req.user.id);clearRefreshCookie(res);}const updated=await queryOne('SELECT * FROM users WHERE id=?',[req.user.id]);res.json({message:'Profile updated successfully',user:{id:Number(updated.id),name:updated.name,email:updated.email,role:updated.role,active:updated.active,phone:updated.phone||'',designation:updated.designation||'',city:updated.city||'',bio:updated.bio||'',created_at:updated.created_at,permissions:await permissionsFor(updated)}});}catch(error){if(String(error.message).includes('UNIQUE'))return res.status(409).json({message:'This email is already in use'});throw error;}}));

export default router;
