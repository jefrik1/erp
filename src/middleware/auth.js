import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { isTokenRevoked } from '../lib/redis.js';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'erp_jwt_super_secret_2024') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[FATAL] JWT_SECRET tidak aman atau tidak di-set di environment produksi');
    }
    return 'erp_jwt_super_secret_2024';
  }
  return secret;
}

export function getJwtRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret === 'erp_refresh_secret_2024') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[FATAL] JWT_REFRESH_SECRET tidak aman atau tidak di-set di environment produksi');
    }
    return 'erp_refresh_secret_2024';
  }
  return secret;
}

export async function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  const token = h.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.jti && await isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    if (payload.id) {
      const activeChk = await pool.query('SELECT is_active FROM users WHERE id=$1', [payload.id]);
      if (!activeChk.rows[0] || !activeChk.rows[0].is_active) {
        return res.status(401).json({ error: 'User account is deactivated' });
      }
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function rbac(...allowed) {
  const allow = allowed.map(r => String(r).toLowerCase());
  return (req, res, next) => {
    const roles = (req.user?.roles || []).map(r => String(r).toLowerCase());
    if (roles.includes('direktur') || roles.includes('super_admin')) return next();
    const ok = roles.some(r => allow.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
