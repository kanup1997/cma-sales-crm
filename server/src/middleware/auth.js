import jwt from 'jsonwebtoken';
import db from '../db.js';
import {permissionsFor} from '../permissions.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = db.prepare(`
      SELECT id, name, email, role, active, phone, designation, city, bio, created_at
      FROM users
      WHERE id = ?
    `).get(payload.id);

    if (!user || !user.active) {
      return res.status(401).json({ message: 'User is inactive or does not exist' });
    }

    req.user = {...user,permissions:permissionsFor(user)};
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}
