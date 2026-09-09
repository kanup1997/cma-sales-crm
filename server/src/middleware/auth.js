import jwt from 'jsonwebtoken';
import { queryAll,queryOne } from '../db.js';

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await queryOne(
      `SELECT id, name, email, role, active, phone, designation, city, bio, created_at
       FROM users
       WHERE id = ?`,
      [payload.id]
    );

    if (!user || !user.active) {
      return res.status(401).json({ message: 'User is inactive or does not exist' });
    }

    const permissions=user.role==='ADMIN'?[]:(await queryAll('SELECT permission FROM user_permissions WHERE user_id=?',[user.id])).map(row=>row.permission);
    req.user = {
      ...user,
      id: Number(user.id),permissions
    };
    next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired session' });
    }
    next(error);
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}
