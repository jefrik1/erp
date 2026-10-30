/**
 * TOTP (RFC 6238) tanpa dependency — kompatibel Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password (SHA1 / 6 digit / 30 detik).
 */
import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf){
  let bits = 0, value = 0, out = '';
  for(const byte of buf){
    value = (value << 8) | byte;
    bits += 8;
    while(bits >= 5){
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if(bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str){
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for(const ch of clean){
    const idx = ALPHABET.indexOf(ch);
    if(idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if(bits >= 8){
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(bytes = 20){
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secret, counter){
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/** Verifikasi kode 6 digit; window=1 berarti toleran ±30 detik. */
export function verifyTotp(secret, token, window = 1){
  const code = String(token || '').replace(/\s/g, '');
  if(!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for(let i = -window; i <= window; i++){
    const candidate = hotp(secret, counter + i);
    if(crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) return true;
  }
  return false;
}

export function otpauthURL({ secret, account, issuer = 'ERP Sumber Material Jaya' }){
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm:'SHA1', digits:'6', period:'30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Kode cadangan sekali pakai (8 karakter). */
export function backupCodes(n = 8){
  const out = [];
  for(let i = 0; i < n; i++){
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    out.push(raw.slice(0, 4) + '-' + raw.slice(4, 8));
  }
  return out;
}
