/**
 * Lightweight input validation middleware for production-grade API safety.
 * Validates request payload against declarative rules without extra runtime dependencies.
 */
export function validate(rules = {}) {
  return (req, res, next) => {
    const errors = [];
    const target = req.body || {};

    for (const [field, rule] of Object.entries(rules)) {
      const val = target[field];
      const isMissing = val === undefined || val === null || val === '';

      if (rule.required && isMissing) {
        errors.push({ field, message: rule.message || `${field} wajib diisi` });
        continue;
      }

      if (isMissing) continue;

      if (rule.type) {
        if (rule.type === 'number' && (isNaN(Number(val)) || typeof val === 'boolean')) {
          errors.push({ field, message: `${field} harus berupa angka` });
        } else if (rule.type === 'string' && typeof val !== 'string') {
          errors.push({ field, message: `${field} harus berupa teks` });
        } else if (rule.type === 'array' && !Array.isArray(val)) {
          errors.push({ field, message: `${field} harus berupa daftar (array)` });
        }
      }

      if (rule.min !== undefined) {
        if (typeof val === 'number' && val < rule.min) {
          errors.push({ field, message: `${field} minimal ${rule.min}` });
        } else if (typeof val === 'string' && val.length < rule.min) {
          errors.push({ field, message: `${field} minimal ${rule.min} karakter` });
        }
      }

      if (rule.pattern && !rule.pattern.test(String(val))) {
        errors.push({ field, message: rule.message || `Format ${field} tidak valid` });
      }

      if (rule.enum && !rule.enum.includes(val)) {
        errors.push({ field, message: `${field} harus salah satu dari: ${rule.enum.join(', ')}` });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validasi data gagal',
        details: errors,
      });
    }

    next();
  };
}
