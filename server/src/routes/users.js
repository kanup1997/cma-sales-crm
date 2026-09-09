import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, queryAll, queryOne } from '../db.js';
import { adminOnly, authRequired } from '../middleware/auth.js';
import { PERMISSIONS, SALES_DEFAULTS } from '../permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authRequired);

function cleanPermissions(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(item => PERMISSIONS.includes(item)))];
}

async function getUsers() {
  const users = await queryAll(`SELECT u.id,u.name,u.email,u.phone,u.designation,u.city,u.bio,u.role,u.active,u.created_at,COUNT(l.id) lead_count FROM users u LEFT JOIN leads l ON l.assigned_to=u.id GROUP BY u.id ORDER BY u.active DESC,u.name`);
  const rows = await queryAll('SELECT user_id,permission FROM user_permissions ORDER BY permission');
  const map = {};
  for (const row of rows) (map[row.user_id] ??= []).push(row.permission);
  return users.map(user => ({ ...user, id:Number(user.id), lead_count:Number(user.lead_count||0), permissions:user.role==='ADMIN'?[...PERMISSIONS]:(map[user.id]||[]) }));
}

router.get('/', asyncHandler(async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    const users = await queryAll("SELECT id,name,role,active FROM users WHERE active=1 ORDER BY name");
    return res.json({users:users.map(user=>({...user,id:Number(user.id)}))});
  }
  res.json({ users:await getUsers(), availablePermissions:PERMISSIONS });
}));

router.post('/', adminOnly, asyncHandler(async (req, res) => {
  const {name,email,password,role='SALES',phone='',designation='',city='',bio='',active=true,permissions}=req.body||{};
  if (!name || !email || !password) return res.status(400).json({message:'Name, email and password are required'});
  if (!['ADMIN','SALES'].includes(role)) return res.status(400).json({message:'Invalid role'});
  try {
    const created = await queryOne(`INSERT INTO users(name,email,password_hash,role,phone,designation,city,bio,active,permissions_configured) VALUES(?,?,?,?,?,?,?,?,?,1) RETURNING id`,[name.trim(),email.trim().toLowerCase(),bcrypt.hashSync(password,10),role,phone.trim()||null,designation.trim()||null,city.trim()||null,bio.trim()||null,active?1:0]);
    const selected = role==='ADMIN' ? [] : (Array.isArray(permissions) ? cleanPermissions(permissions) : SALES_DEFAULTS);
    if (selected.length) await db.batch(selected.map(permission => ({sql:'INSERT INTO user_permissions(user_id,permission) VALUES(?,?)',args:[created.id,permission]})),'immediate');
    res.status(201).json({message:'User created',permissions:selected});
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({message:'A user with this email already exists'});
    throw error;
  }
}));

router.patch('/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await queryOne('SELECT id,role FROM users WHERE id=?',[id]);
  if (!existing) return res.status(404).json({message:'User not found'});
  const {name,email,phone,designation,city,bio,role,active,password,permissions}=req.body||{};
  const updates=[];
  const params=[];
  if (name!==undefined) { updates.push('name=?'); params.push(String(name).trim()); }
  if (email!==undefined) {
    if (!String(email).trim()) return res.status(400).json({message:'Email is required'});
    updates.push('email=?'); params.push(String(email).trim().toLowerCase());
  }
  for (const [column,value] of [['phone',phone],['designation',designation],['city',city],['bio',bio]]) {
    if (value!==undefined) { updates.push(`${column}=?`); params.push(String(value).trim()||null); }
  }
  if (role!==undefined) {
    if (!['ADMIN','SALES'].includes(role)) return res.status(400).json({message:'Invalid role'});
    updates.push('role=?'); params.push(role);
  }
  if (active!==undefined) { updates.push('active=?'); params.push(active?1:0); }
  if (password) { updates.push('password_hash=?'); params.push(bcrypt.hashSync(password,10)); }
  const selected = cleanPermissions(permissions);
  const finalRole = role || existing.role;
  try {
    const batch=[];
    if (updates.length) batch.push({sql:`UPDATE users SET ${updates.join(',')} WHERE id=?`,args:[...params,id]});
    if (Array.isArray(permissions)) {
      batch.push({sql:'DELETE FROM user_permissions WHERE user_id=?',args:[id]});
      if (finalRole!=='ADMIN') {
        for (const permission of selected) batch.push({sql:'INSERT INTO user_permissions(user_id,permission) VALUES(?,?)',args:[id,permission]});
      }
      batch.push({sql:'UPDATE users SET permissions_configured=1 WHERE id=?',args:[id]});
    }
    if (!batch.length) return res.status(400).json({message:'Nothing to update'});
    await db.batch(batch,'immediate');
    const saved=(await queryAll('SELECT permission FROM user_permissions WHERE user_id=? ORDER BY permission',[id])).map(row=>row.permission);
    if (finalRole!=='ADMIN' && Array.isArray(permissions) && saved.length!==selected.length) throw new Error('Permission verification failed after save');
    res.json({message:'User and access permissions updated',permissions:finalRole==='ADMIN'?[...PERMISSIONS]:saved});
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({message:'A user with this email already exists'});
    throw error;
  }
}));

export default router;
