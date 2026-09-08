import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { authRequired } from '../middleware/auth.js';
import {permissionsFor} from '../permissions.js';

const router = Router();
const publicUser = user => ({id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,phone:user.phone||'',designation:user.designation||'',city:user.city||'',bio:user.bio||'',created_at:user.created_at,permissions:user.permissions||permissionsFor(user)});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: publicUser(user)
  });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/profile', authRequired, (req,res) => {
  const {name,email,phone,designation,city,bio,currentPassword,newPassword}=req.body||{};
  if(!name?.trim()||!email?.trim()) return res.status(400).json({message:'Name and email are required'});
  const current=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if(newPassword){
    if(String(newPassword).length<6) return res.status(400).json({message:'New password must be at least 6 characters'});
    if(!currentPassword||!bcrypt.compareSync(currentPassword,current.password_hash)) return res.status(400).json({message:'Current password is incorrect'});
  }
  try{
    db.prepare(`UPDATE users SET name=?,email=?,phone=?,designation=?,city=?,bio=?,password_hash=? WHERE id=?`).run(name.trim(),email.trim().toLowerCase(),phone?.trim()||null,designation?.trim()||null,city?.trim()||null,bio?.trim()||null,newPassword?bcrypt.hashSync(newPassword,10):current.password_hash,req.user.id);
    const updated=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    res.json({message:'Profile updated successfully',user:publicUser(updated)});
  }catch(error){
    if(String(error.message).includes('UNIQUE')) return res.status(409).json({message:'This email is already in use'});
    throw error;
  }
});

export default router;
