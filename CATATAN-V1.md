# Catatan v1 - Batasan yang Diketahui & Rencana Lanjutan

Ditulis 17 Oktober 2026, setelah paket v1 (absensi, profil, pengumuman, kuota cuti, notifikasi role-aware, audit trail, shift POS) selesai dan terverifikasi.

Dokumen ini mencatat bagian yang **sudah jalan tetapi belum lengkap**, supaya tidak hilang dan jelas apa yang perlu diputuskan sebelum dikerjakan.

---

## 1. Shift POS: masih satu register web (register 1)

**Kondisi sekarang**
- `src/modules/pos/shift-routes.js` memakai konstanta `REGISTER_WEB = 1`. Semua kasir yang membuka shift dari halaman POS tercatat di register yang sama.
- Tabel `pos_cashier_shifts` punya `UNIQUE(cashier_id, register_id, shift_date)`, jadi satu kasir hanya punya satu baris shift per hari per register. Kalau shift ditutup lalu dibuka lagi di hari yang sama, baris yang sama dibuka ulang (bukan baris baru).
- Perhitungan kas: kas awal + penjualan `payments.method = 'CASH'` milik kasir tersebut sejak `login_time`. Selisih (variance) dihitung saat tutup shift.

**Dampak**
- Belum bisa membedakan kas per perangkat/meja kasir. Kalau satu kasir memakai dua perangkat, kasnya tetap tergabung.
- Modul POS extended (`src/modules/pos/auth-routes.js`) sebenarnya sudah punya konsep `register_id` + `device_id` saat cashier-login; halaman POS React belum memakainya.

**Rencana**
- Tambah daftar register (tabel `pos_registers` atau cukup enum/konstanta per outlet), lalu pilih register saat buka shift.
- Alternatif: auto-deteksi perangkat (`device_id` disimpan di localStorage) seperti alur cashier-login modul POS extended.
- Setelah itu, rekap shift per register bisa ditampilkan untuk supervisor/manager.

---

## 2. Pengumuman: belum ada lampiran file

**Kondisi sekarang**
- Tabel `announcements` (migrasi 018) hanya menyimpan `title`, `body`, `category`, `expires_at`, `is_active`, `created_by`.
- Halaman `/pengumuman` menampilkan teks saja; belum ada upload, unduh, atau pratinjau lampiran.

**Dampak**
- Pengumuman yang butuh dokumen (SK, memo PDF, foto kegiatan) harus dikirim lewat jalur lain.

**Rencana**
- Tambah kolom `attachment_path` (dan `attachment_name`) di `announcements`.
- Endpoint upload di modul announcements (multer), simpan ke folder `uploads/announcements` yang di-bind-mount, batasi tipe (pdf/jpg/png) dan ukuran (mis. 5 MB).
- Tombol unduh di kartu pengumuman + hapus file saat pengumuman dinonaktifkan.
- Keputusan yang perlu diambil: simpan file di disk (rekomendasi) vs base64 di DB.

---

## 3. Absensi: kolom `overtime_hours` belum dihitung

**Kondisi sekarang**
- Tabel `attendances` punya kolom `overtime_hours` (default 0.00) tetapi tidak pernah diisi.
- Yang dihitung baru `jam_kerja = check_out - check_in` (ditampilkan di `/absen` dan rekap HR). Belum ada pemisahan jam normal vs lembur.

**Dampak**
- Belum bisa membayar lembur berdasarkan data absensi; payroll masih memakai gaji pokok + potongan yang ada.

**Yang perlu diputuskan dulu (aturan lembur)**
- Jam kerja normal: mis. 08:00-17:00 dengan istirahat 1 jam (8 jam efektif), atau 8 jam sejak check-in.
- Tarif lembur: 1.5x untuk jam pertama, 2x untuk jam berikutnya, atau flat per jam.
- Apakah lembur harus disetujui atasan sebelum dihitung.
- Apakah nilai lembur otomatis masuk ke generate payroll (`/hr/payrolls`) atau hanya rekap.

**Rencana setelah aturan disepakati**
- Hitung `overtime_hours` saat check-out (atau job harian untuk shift malam).
- Tampilkan kolom lembur di `/absen` dan tab Absensi halaman SDM.
- Sertakan komponen lembur di payroll beserta rinciannya.

---

## Status v1 (sudah jalan, untuk konteks)

- Self-service: `/absen`, `/profil` (+ ganti password), `/cuti`, `/pengumuman`, `/driver` (Trip Saya).
- Admin/HRD: tulis pengumuman, atur kuota cuti per karyawan (`employees.leave_quota`), approve/tolak cuti, rekap absensi.
- Notifikasi lonceng per role (`/api/dashboard/my-notifications`).
- Audit trail otomatis untuk semua POST/PUT/PATCH/DELETE sukses + login (`audit_logs`, tampil di Audit & GRC).
- Shift POS: buka/tutup + hitung kas dan selisih (`/api/pos/shift/*`).

Verifikasi terakhir: build 9,68 dtk, bundle utama 287,9 kB (96,1 kB gzip), SSR probe 44/44 halaman, E2E shift (kas awal 300.000 + penjualan cash 72.150 = expected 372.150, selisih 0).
