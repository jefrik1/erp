/**
 * payroll-engine.js
 * Engine perhitungan payroll murni (pure functions, tanpa side-effect, tanpa DB).
 * Referensi regulasi:
 *   - PPh 21: PMK No. 168/PMK.03/2023 (berlaku 2024), PER-2/PJ/2024
 *   - BPJS Ketenagakerjaan: PP 44/2015, PP 45/2015
 *   - BPJS Kesehatan: Perpres 64/2020, iuran berlaku 2024
 */

// ─── Konstanta BPJS TK ──────────────────────────────────────────────────────
/** Batas atas upah untuk perhitungan JP (Jaminan Pensiun) per bulan 2024 */
const JP_SALARY_CAP = 9_559_600; // Rp 9.559.600 (PP 36/2021 & update PerBPJS 2024)

/** Batas atas upah untuk BPJS Kesehatan per bulan */
const BPJS_KES_SALARY_CAP = 12_000_000; // Rp 12.000.000

// ─── Konstanta PPh 21 (PMK 168/2023, berlaku 2024) ──────────────────────────
const PTKP = {
  'TK/0': 54_000_000,
  'TK/1': 58_500_000,
  'TK/2': 63_000_000,
  'TK/3': 67_500_000,
  'K/0':  58_500_000,
  'K/1':  63_000_000,
  'K/2':  67_500_000,
  'K/3':  72_000_000,
};

/** Tarif progresif PPh 21 (Pasal 17 UU HPP) */
const PPH21_BRACKETS = [
  { limit:  60_000_000, rate: 0.05 },
  { limit: 250_000_000, rate: 0.15 },
  { limit: 500_000_000, rate: 0.25 },
  { limit: Infinity,    rate: 0.30 },
];

/** Biaya jabatan: 5% dari bruto, maks Rp 500.000/bulan → Rp 6.000.000/tahun */
const BIAYA_JABATAN_RATE  = 0.05;
const BIAYA_JABATAN_MAX_M = 500_000;   // per bulan
const BIAYA_JABATAN_MAX_Y = 6_000_000; // per tahun

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rp = (v) => Math.round(Number(v) || 0);

/**
 * Hitung pajak progresif dari nilai PKP tahunan.
 * @param {number} pkp - Penghasilan Kena Pajak (annual)
 * @returns {number} total PPh
 */
function hitungProgresif(pkp) {
  if (pkp <= 0) return 0;
  let remaining = pkp;
  let prev = 0;
  let tax = 0;
  for (const { limit, rate } of PPH21_BRACKETS) {
    const layerSize = limit - prev;
    const taxable = Math.min(remaining, layerSize);
    tax += taxable * rate;
    remaining -= taxable;
    prev = limit;
    if (remaining <= 0) break;
  }
  return rp(tax);
}

// ─── BPJS Ketenagakerjaan ─────────────────────────────────────────────────────
/**
 * Hitung iuran BPJS Ketenagakerjaan.
 * @param {{ basicSalary: number, component?: string }} param
 *   component: 'risiko_1' | 'risiko_2' | 'risiko_3' | 'risiko_4' | 'risiko_5'
 *   (default: 'risiko_1' — 0.24%)
 * @returns {{ jht_emp, jht_company, jp_emp, jp_company, jkk, jkm }}
 */
export function hitungBpjsTK({ basicSalary, component = 'risiko_1' }) {
  const salary = rp(basicSalary);

  // JHT
  const jht_emp     = rp(salary * 0.02);
  const jht_company = rp(salary * 0.037);

  // JP — dasar upah dibatasi JP_SALARY_CAP
  const jpBase   = Math.min(salary, JP_SALARY_CAP);
  const jp_emp     = rp(jpBase * 0.01);
  const jp_company = rp(jpBase * 0.02);

  // JKK — tingkat risiko (default: Tingkat I = 0.24%)
  const JKK_RATES = {
    risiko_1: 0.0024,
    risiko_2: 0.0054,
    risiko_3: 0.0089,
    risiko_4: 0.0127,
    risiko_5: 0.0174,
  };
  const jkkRate = JKK_RATES[component] ?? JKK_RATES.risiko_1;
  const jkk = rp(salary * jkkRate);

  // JKM — 0.3% ditanggung perusahaan
  const jkm = rp(salary * 0.003);

  return { jht_emp, jht_company, jp_emp, jp_company, jkk, jkm };
}

// ─── BPJS Kesehatan ───────────────────────────────────────────────────────────
/**
 * Hitung iuran BPJS Kesehatan.
 * @param {{ basicSalary: number }} param
 * @returns {{ bpjs_kes_emp, bpjs_kes_company }}
 */
export function hitungBpjsKesehatan({ basicSalary }) {
  const base = Math.min(rp(basicSalary), BPJS_KES_SALARY_CAP);
  const bpjs_kes_emp     = rp(base * 0.01);
  const bpjs_kes_company = rp(base * 0.04);
  return { bpjs_kes_emp, bpjs_kes_company };
}

// ─── PPh 21 ───────────────────────────────────────────────────────────────────
/**
 * Hitung PPh 21 menggunakan metode gross (gaji bruto ditanggung karyawan).
 * Mendukung bonus tahunan (THR/bonus) yang digabung untuk hitung tarif.
 *
 * @param {{
 *   grossSalary: number,       // gaji bruto sebulan (sudah termasuk tunjangan tetap)
 *   ptkpStatus: string,        // 'TK/0' | 'K/0' | dst.
 *   annualBonusIfAny?: number  // bonus/THR yang diterima tahun ini (opsional)
 * }} param
 * @returns {{ pkp_annual, pph21_annual, pph21_monthly }}
 */
export function hitungPph21({ grossSalary, ptkpStatus, annualBonusIfAny = 0 }) {
  const gross_m  = rp(grossSalary);
  const bonus    = rp(annualBonusIfAny);
  const ptkp     = PTKP[ptkpStatus] ?? PTKP['TK/0'];

  // Biaya jabatan (per tahun)
  const biayaJabatan_m = Math.min(rp(gross_m * BIAYA_JABATAN_RATE), BIAYA_JABATAN_MAX_M);
  const biayaJabatan_y = Math.min(biayaJabatan_m * 12, BIAYA_JABATAN_MAX_Y);

  // Penghasilan neto tahunan
  const neto_annual = (gross_m * 12) + bonus - biayaJabatan_y;

  // PKP tahunan
  const pkp_annual = Math.max(0, neto_annual - ptkp);

  // PPh total dengan bonus
  const pph21_annual = hitungProgresif(pkp_annual);

  // PPh bulanan (hanya dari penghasilan reguler, bonus dipisah saat bayar)
  // Hitung PKP tanpa bonus untuk pembagi bulanan
  const pkp_tanpa_bonus = Math.max(0, (gross_m * 12) - biayaJabatan_y - ptkp);
  const pph21_tanpa_bonus = hitungProgresif(pkp_tanpa_bonus);
  const pph21_monthly = rp(pph21_tanpa_bonus / 12);

  return { pkp_annual, pph21_annual, pph21_monthly };
}

// ─── Hitung Gaji Net ──────────────────────────────────────────────────────────
/**
 * Kalkulasi gaji bersih lengkap dengan semua komponen.
 *
 * @param {{
 *   basicSalary: number,
 *   allowances?: number,     // total tunjangan tetap (transport + makan + lain)
 *   overtime?: number,       // total uang lembur
 *   deductions?: number,     // potongan lain (kasbon, dll)
 *   bpjs: {
 *     jht_emp, jht_company, jp_emp, jp_company,
 *     jkk, jkm, bpjs_kes_emp, bpjs_kes_company
 *   },
 *   pph21: { pph21_monthly }
 * }} param
 *
 * @returns {{
 *   grossSalary, totalDeduction, netSalary,
 *   slip: { ... detail semua komponen ... }
 * }}
 */
export function hitungGajiNet({ basicSalary, allowances = 0, overtime = 0, deductions = 0, bpjs, pph21 }) {
  const basic      = rp(basicSalary);
  const allow      = rp(allowances);
  const over       = rp(overtime);
  const ded        = rp(deductions);
  const pph21_m    = rp(pph21?.pph21_monthly ?? 0);

  // Bruto = gaji pokok + tunjangan + lembur
  const grossSalary = basic + allow + over;

  // Potongan karyawan
  const empDeductions =
    rp(bpjs?.jht_emp ?? 0) +
    rp(bpjs?.jp_emp  ?? 0) +
    rp(bpjs?.bpjs_kes_emp ?? 0) +
    pph21_m +
    ded;

  const totalDeduction = empDeductions;
  const netSalary      = grossSalary - totalDeduction;

  // Beban perusahaan (tidak masuk net tapi dicatat untuk jurnal)
  const companyBurden =
    rp(bpjs?.jht_company     ?? 0) +
    rp(bpjs?.jp_company      ?? 0) +
    rp(bpjs?.jkk             ?? 0) +
    rp(bpjs?.jkm             ?? 0) +
    rp(bpjs?.bpjs_kes_company?? 0);

  const slip = {
    // Pendapatan
    basic_salary:   basic,
    allowances:     allow,
    overtime:       over,
    gross_salary:   grossSalary,

    // Potongan karyawan
    bpjs_jht_employee:    rp(bpjs?.jht_emp      ?? 0),
    bpjs_jp_employee:     rp(bpjs?.jp_emp       ?? 0),
    bpjs_kes_employee:    rp(bpjs?.bpjs_kes_emp ?? 0),
    pph21:                pph21_m,
    other_deductions:     ded,
    total_deduction:      totalDeduction,

    // Beban perusahaan
    bpjs_jht_company:     rp(bpjs?.jht_company     ?? 0),
    bpjs_jp_company:      rp(bpjs?.jp_company      ?? 0),
    bpjs_jkk:             rp(bpjs?.jkk             ?? 0),
    bpjs_jkm:             rp(bpjs?.jkm             ?? 0),
    bpjs_kes_company:     rp(bpjs?.bpjs_kes_company?? 0),
    total_company_burden: companyBurden,

    // Take-home
    net_salary: netSalary,
  };

  return { grossSalary, totalDeduction, netSalary, slip };
}
