import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { adminOnly, authRequired } from '../middleware/auth.js';
import {PERMISSIONS,SALES_DEFAULTS} from '../permissions.js';

const router = Router();
router.use(authRequired, adminOnly);

router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.designation, u.city, u.bio, u.role, u.active, u.created_at,
           COUNT(l.id) AS lead_count
    FROM users u
    LEFT JOIN leads l ON l.assigned_to = u.id
    GROUP BY u.id
    ORDER BY u.active DESC, u.name ASC
  `).all();
  const permissionRows=db.prepare('SELECT user_id,permission FROM user_permissions').all();const permissionMap={};permissionRows.forEach(row=>(permissionMap[row.user_id]??=[]).push(row.permission));
  res.json({ users:users.map(user=>({...user,permissions:user.role==='ADMIN'?[...PERMISSIONS]:(permissionMap[user.id]||[])})),availablePermissions:PERMISSIONS });
});

router.post('/', (req, res) => {
  const { name, email, password, role = 'SALES', phone='', designation='', city='', bio='', active=true, permissions } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }
  if (!['ADMIN', 'SALES'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const create=db.transaction(()=>{const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, phone, designation, city, bio, active, permissions_configured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), role, phone.trim()||null, designation.trim()||null, city.trim()||null, bio.trim()||null, active?1:0);const selected=role==='ADMIN'?[]:(Array.isArray(permissions)?permissions:SALES_DEFAULTS).filter(value=>PERMISSIONS.includes(value));const insert=db.prepare('INSERT INTO user_permissions(user_id,permission) VALUES(?,?)');selected.forEach(permission=>insert.run(result.lastInsertRowid,permission));return result;});const result=create();

    const user = db.prepare(`
      SELECT id, name, email, phone, designation, city, bio, role, active, created_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    throw error;
  }
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { name, email, phone, designation, city, bio, role, active, password, permissions } = req.body || {};
  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (email !== undefined) { if(!String(email).trim())return res.status(400).json({message:'Email is required'});updates.push('email = ?');params.push(String(email).trim().toLowerCase()); }
  [['phone',phone],['designation',designation],['city',city],['bio',bio]].forEach(([column,value])=>{if(value!==undefined){updates.push(`${column} = ?`);params.push(String(value).trim()||null);}});
  if (role !== undefined) {
    if (!['ADMIN', 'SALES'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    updates.push('role = ?'); params.push(role);
  }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }

  if (!updates.length && !Array.isArray(permissions)) return res.status(400).json({ message: 'Nothing to update' });
  const save=db.transaction(()=>{if(updates.length){params.push(id);db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);}if(Array.isArray(permissions)){db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(id);const insert=db.prepare('INSERT INTO user_permissions(user_id,permission) VALUES(?,?)');[...new Set(permissions.filter(value=>PERMISSIONS.includes(value)))].forEach(permission=>insert.run(id,permission));db.prepare('UPDATE users SET permissions_configured=1 WHERE id=?').run(id);}});try{save();}catch(error){if(String(error.message).includes('UNIQUE'))return res.status(409).json({message:'A user with this email already exists'});throw error;}
  res.json({ message: 'User updated' });
});

export default router;
