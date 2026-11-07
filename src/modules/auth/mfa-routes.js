import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { pool } from '../../config/db.js';
import { auth, getJwtSecret, getJwtRefreshSecret } from '../../middleware/auth.js';
import { generateSecret, verifyTotp, otpauthURL, backupCodes } from '../../lib/totp.js';

const router = express.Router();
const SECRET = () => getJwtSecret();

/**
 * Derives a 32-byte key for AES-256-GCM encryption from process.env.MFA_ENCRYPTION_KEY (or fallback to JWT secret).
 */
function getMfaKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY || getJwtSecret();
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encryptMfaSecret(plainSecret) {
  if (!plainSecret) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMfaKey(), iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptMfaSecret(ciphertext) {
  if (!ciphertext) return null;
  const parts = String(ciphertext).split(':');
  if (parts.length !== 3) {
    // Legacy plaintext secret
    return ciphertext;
  }
  try {
    const [ivHex, tagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMfaKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, return raw (could be legacy string containing colon)
    return ciphertext;
  }
}

/** Ambil user + roles lengkap (dipakai saat menerbitkan token setelah MFA). */
export async function loadUserWithRoles(id) {
  const r = await pool.query(`SELECT u.*, b.name AS branch_name, array_agg(ro.name) AS roles
    FROM users u
    LEFT JOIN branches b ON b.id=u.branch_id
    LEFT JOIN user_roles ur ON ur.user_id=u.id
    LEFT JOIN roles ro ON ro.id=ur.role_id
    WHERE u.id=$1 GROUP BY u.id, b.name`, [id]);
  return r.rows[0] || null;
}

export function tokenPayloadFor(user, jti = null) {
  return {
    id: user.id, username: user.username, email: user.email,
    branch_id: user.branch_id, branch_name: user.branch_name,
    employee_id: user.employee_id, roles: (user.roles || []).filter(Boolean),
    jti: jti || crypto.randomUUID(),
  };
}

// GET /auth/mfa/status
router.get('/status', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT mfa_enabled, mfa_backup_codes FROM users WHERE id=$1', [req.user.id]);
    const codes = String(r.rows[0]?.mfa_backup_codes || '').split(',').filter(Boolean);
    res.json({ enabled: !!r.rows[0]?.mfa_enabled, backup_left: codes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/mfa/setup → secret baru (belum aktif sampai kode diverifikasi)
router.post('/setup', auth, async (req, res) => {
  try {
    const rawSecret = generateSecret();
    const encSecret = encryptMfaSecret(rawSecret);
    await pool.query('UPDATE users SET mfa_secret=$1, mfa_enabled=false WHERE id=$2', [encSecret, req.user.id]);
    const account = req.user.email || req.user.username;
    res.json({ secret: rawSecret, otpauth: otpauthURL({ secret: rawSecret, account }), account });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/mfa/enable { code }
router.post('/enable', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT mfa_secret FROM users WHERE id=$1', [req.user.id]);
    const rawStored = r.rows[0]?.mfa_secret;
    if (!rawStored) return res.status(400).json({ error: 'Jalankan setup MFA dulu' });
    const secret = decryptMfaSecret(rawStored);
    if (!verifyTotp(secret, req.body?.code)) return res.status(400).json({ error: 'Kode salah atau kedaluwarsa. Pastikan jam perangkat akurat.' });
    const codes = backupCodes(8);
    await pool.query('UPDATE users SET mfa_enabled=true, mfa_backup_codes=$1 WHERE id=$2', [codes.join(','), req.user.id]);
    await pool.query("INSERT INTO audit_logs (user_id, action, entity_type) VALUES ($1,'MFA_ENABLED','AUTH')", [req.user.id]).catch(() => {});
    res.json({ ok: true, backup_codes: codes, message: 'MFA aktif. Simpan kode cadangan di tempat aman.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/mfa/disable { password }
router.post('/disable', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(String(req.body?.password || ''), r.rows[0]?.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Password salah' });
    await pool.query('UPDATE users SET mfa_enabled=false, mfa_secret=NULL, mfa_backup_codes=NULL WHERE id=$1', [req.user.id]);
    await pool.query("INSERT INTO audit_logs (user_id, action, entity_type) VALUES ($1,'MFA_DISABLED','AUTH')", [req.user.id]).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/mfa/verify-login { mfa_token, code }  (publik — langkah kedua login)
router.post('/verify-login', async (req, res) => {
  const { mfa_token, code } = req.body || {};
  if (!mfa_token) return res.status(400).json({ error: 'mfa_token wajib' });
  let decoded;
  try {
    decoded = jwt.verify(mfa_token, SECRET());
  } catch {
    return res.status(401).json({ error: 'Sesi MFA kedaluwarsa, ulangi login' });
  }
  if (decoded.scope !== 'mfa') return res.status(400).json({ error: 'Token bukan untuk MFA' });
  try {
    const user = await loadUserWithRoles(decoded.id);
    if (!user || !user.mfa_enabled) return res.status(401).json({ error: 'MFA tidak aktif untuk akun ini' });
    const input = String(code || '').replace(/\s/g, '').toUpperCase();
    const secret = decryptMfaSecret(user.mfa_secret);
    let ok = verifyTotp(secret, input);
    let usedBackup = false;
    if (!ok) {
      const codes = String(user.mfa_backup_codes || '').split(',').filter(Boolean);
      if (codes.includes(input)) {
        ok = true;
        usedBackup = true;
        await pool.query('UPDATE users SET mfa_backup_codes=$1 WHERE id=$2', [codes.filter(c => c !== input).join(','), user.id]);
      }
    }
    if (!ok) return res.status(401).json({ error: 'Kode MFA salah' });
    const newJti = crypto.randomUUID();
    const payload = tokenPayloadFor(user, newJti);
    const token = jwt.sign(payload, SECRET(), { expiresIn: '8h' });
    const refreshJti = crypto.randomUUID();
    const refresh = jwt.sign({ id: user.id, jti: refreshJti }, getJwtRefreshSecret(), { expiresIn: '7d' });
    await pool.query("INSERT INTO audit_logs (user_id, action, entity_type) VALUES ($1,$2,'AUTH')", [user.id, usedBackup ? 'LOGIN_MFA_BACKUP' : 'LOGIN_MFA']).catch(() => {});
    res.json({ token, refresh, user: payload, backup_used: usedBackup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
