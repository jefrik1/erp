// ============================================================
// lib/utils.ts — Helper formatting & Tailwind merge
// ============================================================

// PART: cn — gabung class Tailwind aman (clsx + twMerge), dipakai di semua komponen UI
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...c: (string|undefined|false)[]) { return twMerge(clsx(c)) }
// PART: rupiah — format IDR, dipakai di semua tabel/KPI/chart tooltip. Contoh: rupiah(12215000) → "Rp 12.215.000"
export const rupiah = (n:number)=> new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n)
// PART: fmt — format angka biasa dengan pemisah ribuan. Contoh: fmt(2400) → "2.400"
export const fmt = (n:number)=> new Intl.NumberFormat("id-ID").format(n)
