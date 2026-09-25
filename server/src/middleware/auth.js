import jwt from 'jsonwebtoken';
import { queryOne } from '../db.js';

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await queryOne(
      `SELECT u.id,u.name,u.email,u.role,u.active,u.phone,u.designation,u.city,u.bio,u.created_at,
       (SELECT group_concat(permission) FROM user_permissions WHERE user_id=u.id) AS permissions_csv
       FROM users u WHERE u.id = ?`,
      [payload.id]
    );

    if (!user || !user.active) {
      return res.status(401).json({ message: 'User is inactive or does not exist' });
    }

    const {permissions_csv,...profile}=user;
    const permissions=user.role==='ADMIN'?[]:(permissions_csv?permissions_csv.split(','):[]);
    req.user = {
      ...profile,
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
