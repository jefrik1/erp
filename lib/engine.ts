import type { Customer, Product } from "./types"

// ============================================================
// lib/engine.ts — Business Rules Engine (pure, tanpa side-effect)
// Dipakai oleh store + semua feature untuk pricing & validasi
// ============================================================

// PART: Kalkulator PPN 11% Efektif — PMK terbaru: 12% × DPP Nilai Lain 11/12
// Input: hargaJual (DPP) → Output: {dpp, dppLain=11/12*harga, ppn=12%*dppLain, total, efektif:"11%"}
// Contoh: harga 10jt → dppLain 9.166.667 → ppn 1.100.000 → total 11.100.000
export function calcPpn(hargaJual: number) {
  const dppLain = Math.round((11/12) * hargaJual)
  const ppn = Math.round(0.12 * dppLain)
  return { dpp: hargaJual, dppLain, ppn, total: hargaJual + ppn, efektif: "11%" }
}
// PART: Cek Kredit Pelanggan — dipakai di Penjualan (POS) & Pelanggan
// totalRisk = balance + newTxn + pendingSO
// overLimit  = totalRisk > creditLimit
// overdueBlock = overdueDays > 7
// blocked = (overLimit || overdueBlock) || isBlocked
// Dipakai untuk banner "SYSTEM BLOCKED" & penentuan warna Sisa (rose/amber/emerald)
export function creditCheck(customer: Customer, newTxn: number, pendingSO: number) {
  const totalRisk = customer.balance + newTxn + pendingSO
  const overLimit = totalRisk > customer.creditLimit
  const overdueBlock = customer.overdueDays > 7
  const blocked = (overLimit || overdueBlock) || customer.isBlocked
  return { totalRisk, overLimit, overdueBlock, blocked, remaining: customer.creditLimit - customer.balance }
}
// PART: Harga Jual Otomatis — tier eksak → konversi factor → fallback buyPrice
// Dipakai di POS (Penjualan) & Dashboard preview. Contoh: Besi 12mm Meter Retail 6542
export function getAutoSellPrice(product: Product, unitId: string, tier: string): number {
  const exact = product.prices.find(p=> p.unitId===unitId && p.tier===tier)
  if(exact) return exact.price
  const tierAny = product.prices.find(p=> p.tier===tier)
  if(tierAny){
    const fromUnit = product.units.find(u=>u.id===tierAny.unitId)
    const toUnit = product.units.find(u=>u.id===unitId)
    if(fromUnit && toUnit) return Math.round(tierAny.price * (toUnit.factor / fromUnit.factor))
  }
  const any = product.prices.find(p=> p.unitId===unitId)
  if(any) return any.price
  return product.buyPrice * (product.units.find(u=>u.id===unitId)?.factor ?? 1)
}
export function getBuyPrice(product: Product, unitId: string): number {
  const u = product.units.find(x=>x.id===unitId)
  if(!u) return product.buyPrice
  return Math.round(product.buyPrice * u.factor)
}
