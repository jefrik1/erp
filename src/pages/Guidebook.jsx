import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Search, Printer, ArrowLeft, CheckCircle2, AlertTriangle, ChevronRight,
  ShoppingCart, ReceiptText, Wallet, Kanban, Calculator, Users, Building2, Truck, Warehouse,
  Package, PackagePlus, BarChart3, ArrowRightLeft, Handshake, Flame, Wrench, PiggyBank,
  Gift, BadgeDollarSign, FileWarning, Clock, CalendarDays, CalendarClock, Megaphone, Settings2,
  ShieldCheck, Workflow, CreditCard, CircleDollarSign, ClipboardList, MapPin, PenLine, FileCheck2,
  ClipboardCheck, Receipt, Send, Link2, TrendingDown, BookMarked, Layers, Info,
  BookOpenCheck, Landmark, Boxes,
} from 'lucide-react';
import { GUIDEBOOK_ROUTES } from '../lib/guidebookData';

function getIconForRoute(path, cat) {
  if (path === '/') return BarChart3;
  if (path.includes('pos') || path.includes('receipt')) return Kanban;
  if (path.includes('order')) return ShoppingCart;
  if (path.includes('invoice')) return Wallet;
  if (path.includes('calculator')) return Calculator;
  if (path.includes('crm')) return Users;
  if (path.includes('credit')) return CreditCard;
  if (path.includes('project')) return Building2;
  if (path.includes('consignment')) return Handshake;
  if (path.includes('pricing')) return BadgeDollarSign;
  if (path.includes('return')) return FileWarning;
  if (path.includes('purchase')) return Truck;
  if (path.includes('landed')) return BadgeDollarSign;
  if (path.includes('opname')) return ClipboardCheck;
  if (path.includes('waste')) return Flame;
  if (path.includes('transfer')) return ArrowRightLeft;
  if (path.includes('stock')) return Warehouse;
  if (path.includes('logistics') || path.includes('surat-jalan')) return Truck;
  if (path.includes('driver')) return MapPin;
  if (path.includes('fleet')) return Wrench;
  if (path.includes('coa')) return Wallet;
  if (path.includes('journal')) return ReceiptText;
  if (path.includes('tax')) return Receipt;
  if (path.includes('period')) return BookOpenCheck;
  if (path.includes('recon')) return Landmark;
  if (path.includes('reports')) return Boxes;
  if (path.includes('budget')) return PiggyBank;
  if (path.includes('asset')) return Building2;
  if (path.includes('hr')) return Users;
  if (path.includes('absen')) return Clock;
  if (path.includes('cuti')) return CalendarDays;
  if (path.includes('izin')) return CalendarClock;
  if (path.includes('notify')) return Send;
  if (path.includes('approval')) return Workflow;
  if (path.includes('audit')) return ShieldCheck;
  if (path.includes('settings')) return Settings2;
  return BookOpen;
}

/* ─────────────────────────────────────────────────────────────────────────────
   GUIDEBOOK ERP — halaman publik (bisa dibuka tanpa login).
   Sumber kebenaran alur = kode di src/modules/*. Kalau alur berubah, ubah di sini
   juga supaya kasir/gudang tidak memakai panduan usang.
   ───────────────────────────────────────────────────────────────────────────── */

const ROLES = [
  {
    role: 'Kasir / POS', tone: 'bg-amber-50 border-amber-200 text-amber-900', chip: 'bg-amber-500',
    steps: [
      'Buka **POS Kasir** → **Buka Shift** (isi kas awal). Transaksi tidak bisa dilakukan sebelum shift dibuka.',
      'Pilih pelanggan (atau isi pelanggan baru), cari/scan barang, atur qty & harga.',
      'Checkout → pilih metode (CASH/TRANSFER/CARD/QRIS). Stok langsung berkurang **tanpa refresh** (optimistic + polling 20 detik).',
      'Akhir hari: **Tutup Shift** → isi kas fisik. Selisih dihitung otomatis; hanya kelebihan kas yang masuk **Kas Tunai**.',
      'Cek order yang pernah Anda buat di **Riwayat Order** (kasir hanya melihat order POS miliknya).',
    ],
  },
  {
    role: 'Sales', tone: 'bg-sky-50 border-sky-200 text-sky-900', chip: 'bg-sky-500',
    steps: [
      '**Sales Order → Buat SO**: pelanggan, barang, termin/DP, alamat kirim. Diskon di luar batas masuk approval.',
      'Pantau status: `PENDING → APPROVED → PICKING → SHIPPED → COMPLETED`.',
      'Gudang membuat **DO** + tanda tangan pengirim; driver klaim dan tanda tangan saat berangkat.',
      'Setelah barang diterima, pastikan **Konfirmasi Gudang/Kantor** selesai → baru **Invoice** bisa dilunasi.',
      'Bagikan **Link Lacak** ke pelanggan (tombol di Detail SO) supaya mereka bisa cek status sendiri tanpa login.',
      'Gunakan **Riwayat Order** untuk melihat metode bayar, DP, dan sisa tagihan tiap order.',
    ],
  },
  {
    role: 'Gudang', tone: 'bg-emerald-50 border-emerald-200 text-emerald-900', chip: 'bg-emerald-500',
    steps: [
      '**Logistik (DO) → Buat DO** dari SO/POS: pilih armada, isi nama petugas + **tanda tangan pengirim** (wajib).',
      'Siapkan barang; cek **Stok per Gudang** dan **Kartu Stok** bila ada selisih.',
      'Terima barang masuk di **Goods Receipt** / **Penambahan Stok**; pindah antar gudang di **Transfer Gudang**.',
      'Barang rusak/pecah dicatat di **Susut & Pecah** agar stok & HPP tetap benar.',
      'Hitung fisik berkala lewat **Stock Opname**: buat sesi → isi hitung → ajukan → posting setelah disetujui.',
    ],
  },
  {
    role: 'Driver', tone: 'bg-indigo-50 border-indigo-200 text-indigo-900', chip: 'bg-indigo-500',
    steps: [
      'Buka **Trip Saya** → pilih DO tersedia → **Klaim** + tanda tangan pengemudi (wajib).',
      'Armada otomatis berstatus IN_TRANSIT; bawa surat jalan yang tercetak dari **Surat Jalan**.',
      'Sampai lokasi: minta **tanda tangan penerima** + foto bukti, centang "invoice diserahkan".',
      'Selesaikan trip → DO menjadi DELIVERED. Konfirmasi kantor dilakukan gudang/kantor, bukan driver.',
    ],
  },
  {
    role: 'Purchasing', tone: 'bg-orange-50 border-orange-200 text-orange-900', chip: 'bg-orange-500',
    steps: [
      '**Purchase Request** (permintaan) → **RFQ** (bandingkan penawaran) → **Purchase Order** ke supplier terpilih.',
      'Barang datang: **Goods Receipt** (cek qty & harga). Selisih membuat status **HOLD** dan memblokir pembayaran.',
      'Biaya angkut/bea masuk dialokasikan di **Landed Cost** agar HPP akurat.',
      'Invoice supplier MATCHED masuk **AR/AP → Hutang Usaha** untuk dibayar Finance.',
    ],
  },
  {
    role: 'Finance', tone: 'bg-violet-50 border-violet-200 text-violet-900', chip: 'bg-violet-500',
    steps: [
      '**AR/AP**: tagih piutang, bayar hutang (potong bank + jurnal Dr Hutang / Cr Kas).',
      '**Kas Tunai**: uang tutup shift masuk kas dulu → **Setor ke Bank** (jurnal Dr Bank / Cr Kas Tunai).',
      '**Kolektibilitas**: blokir pelanggan menunggak, catat janji bayar, kirim surat penagihan (level 1–3).',
      '**Pajak & e-Faktur**: isi nomor faktur 16 digit, cek PPN keluaran vs masukan, catat PPh 21/23/4(2), export CSV.',
      '**COA & Jurnal / Trial Balance**: DEBIT harus = KREDIT sebelum tutup buku.',
    ],
  },
  {
    role: 'HRD', tone: 'bg-rose-50 border-rose-200 text-rose-900', chip: 'bg-rose-500',
    steps: [
      '**Karyawan & HR → Karyawan**: data induk, jabatan, gaji pokok, akun login.',
      '**Absensi**: rekap harian + absen manual (geofence dilewati, tercatat siapa yang mengisi).',
      '**Keterlambatan**: laporan bulanan (batas 08:00 WIB) + detail jarak & catatan.',
      '**Payroll**: generate gaji periode → **Posting Jurnal** (Dr Beban Gaji / Cr PPh21, BPJS, Hutang Gaji).',
    ],
  },
  {
    role: 'Admin / Direktur', tone: 'bg-slate-100 border-slate-300 text-slate-900', chip: 'bg-slate-700',
    steps: [
      '**Dashboard** memantau KPI + lonceng notifikasi yang menandai hal perlu tindakan.',
      '**Approval**: setujui diskon, PO, cuti, dan pengajuan lain.',
      '**Stock Opname**: approve + posting sesi yang diajukan gudang (hanya Direktur/Super Admin/Finance).',
      '**Kolektibilitas**: hanya Direktur/Super Admin yang bisa **membuka blokir** pelanggan.',
      '**Audit & GRC** menelusuri perubahan data; **Pengaturan Sistem** untuk profil & parameter.',
    ],
  },
];

const FLOWS = [
  {
    title: 'Penjualan → Pengiriman → Uang Masuk',
    icon: ShoppingCart,
    color: 'from-[#0051d5] to-[#3b82f6]',
    steps: [
      ['SO dibuat', 'Sales memilih barang, harga, termin. Status PENDING.'],
      ['Approval', 'Diskon/kredit di luar batas butuh persetujuan.'],
      ['Picking & DO', 'Gudang menyiapkan barang dan membuat DO + TTD pengirim.'],
      ['Pengiriman', 'Driver klaim DO + TTD pengemudi, penerima tanda tangan saat barang diterima.'],
      ['Konfirmasi kantor', 'Gudang/kantor memverifikasi TTD lengkap. Ini gerbang invoice.'],
      ['Invoice & pelunasan', 'Finance menagih; setelah PAID, SO otomatis COMPLETED.'],
    ],
    note: 'Tanda tangan 3 pihak (pengirim, pengemudi, penerima) + konfirmasi kantor = syarat invoice bisa dilunasi.',
  },
  {
    title: 'POS Kasir → Kas Tunai → Bank',
    icon: Kanban,
    color: 'from-[#0f766e] to-[#14b8a6]',
    steps: [
      ['Buka shift', 'Kasir mengisi kas awal (uang kembalian).'],
      ['Transaksi', 'Checkout memotong stok saat itu juga dan mencatat pembayaran.'],
      ['Tutup shift', 'Kas fisik dihitung; selisih (variance) tercatat otomatis.'],
      ['Masuk Kas Tunai', 'Hanya kelebihan kas (penjualan tunai) yang dikreditkan ke Kas Tunai.'],
      ['Setor ke bank', 'Finance memilih rekening tujuan → kas berkurang, bank bertambah + jurnal.'],
    ],
    note: 'Kas awal tidak dikreditkan lagi (uang itu sudah ada di laci). Semua perpindahan punya jurnal.',
  },
  {
    title: 'Pembelian → Hutang → Pembayaran',
    icon: Truck,
    color: 'from-[#7c3aed] to-[#a78bfa]',
    steps: [
      ['Purchase Request', 'Departemen mengajukan kebutuhan barang.'],
      ['RFQ', 'Purchasing meminta penawaran beberapa supplier.'],
      ['Purchase Order', 'PO diterbitkan ke supplier terpilih + approval bila perlu.'],
      ['Goods Receipt', 'Gudang menerima barang; qty/harga dicek (3-way matching).'],
      ['Landed Cost', 'Biaya kirim/bea masuk dialokasikan ke HPP barang.'],
      ['Bayar hutang', 'AP MATCHED dibayar dari rekening bank + jurnal Dr Hutang / Cr Kas.'],
    ],
    note: 'Status HOLD (qty/harga tidak cocok) memblokir pembayaran sampai dibenarkan di Penerimaan.',
  },
];

// ── 6 modul baru: penjelasan rinci + contoh jurnal ────────────────────────────
const NEW_MODULES = [
  {
    n:'Stock Opname', p:'/inventory/opname', icon:ClipboardCheck, tone:'border-emerald-200',
    what:'Menghitung jumlah fisik barang di gudang, membandingkan dengan stok sistem, lalu mengoreksi stok dengan bukti + jurnal. Ini satu-satunya cara resmi menyetel stok setelah hitung fisik.',
    who:'Gudang (buat & isi), Direktur/Super Admin/Finance (approve & posting)',
    steps:[
      'Buka **Stock Opname** → **Buat Sesi** → pilih gudang. Sistem mengambil snapshot stok saat itu untuk semua barang di gudang tersebut.',
      'Buka sesi → isi kolom **Hitung Fisik** sesuai jumlah nyata. Selisih dihitung otomatis (fisik − sistem) dan dinilai dengan HPP rata-rata.',
      'Klik **Simpan Hitung** (status DRAFT → COUNTING). Bisa dilanjutkan kapan saja.',
      'Klik **Ajukan** bila hitungan selesai (SUBMITTED). Setelah ini angka terkunci.',
      'Atasan/finance klik **Approve** (APPROVED), lalu **Posting Stok** (POSTED): stok disetel ke angka fisik, kartu stok mencatat ADJ, dan jurnal selisih dibuat.',
    ],
    note:'Satu gudang hanya boleh punya satu sesi berjalan. Setelah POSTED tidak bisa diubah/dibatalkan. Selisih lebih: **Dr Persediaan 1-1200 / Cr Selisih Stok Opname 6-1100**; selisih kurang dibalik.',
  },
  {
    n:'Pajak & e-Faktur', p:'/finance/tax', icon:Receipt, tone:'border-sky-200',
    what:'Mencatat nomor faktur pajak (16 digit) untuk setiap invoice penjualan, merekap PPN keluaran vs PPN masukan per masa, mencatat pemotongan PPh 21/23/4(2), dan mengekspor CSV untuk pelaporan.',
    who:'Finance, Auditor, Direktur/Super Admin',
    steps:[
      'Pilih **periode** (bulan) di kanan atas. Semua angka mengikuti periode itu.',
      'Tab **Faktur Keluaran**: tiap invoice menampilkan DPP & PPN. Isi **nomor faktur 16 digit** (format e-Faktur 010.000-26.00000001) → **Simpan**. Nomor bisa diganti atau dihapus.',
      'Tab **PPh Dipotong**: pilih jenis (PPh 21/23/4(2)), isi base & tarif (default 5% / 2% / 10%); nominal dihitung otomatis bila dikosongkan.',
      'Klik **Export CSV** untuk rekap siap impor ke e-Faktur / arsip pajak.',
    ],
    note:'PPN keluaran = SUM(invoices.tax); PPN masukan = SUM(purchase_invoices.tax). DPP = total − PPN. Kurang bayar = keluaran − masukan. Nomor faktur hanya boleh 16 digit angka.',
  },
  {
    n:'Pusat Notifikasi', p:'/notify', icon:Send, tone:'border-amber-200',
    what:'Antrian pesan keluar (WhatsApp/Email/SMS) dengan template. Semua pesan masuk antrian dulu (QUEUED) lalu dikirim, sehingga ada riwayat siapa mengirim apa dan kapan.',
    who:'Finance, HRD, Gudang, Direktur/Super Admin',
    steps:[
      'Klik **Pesan Baru** (atau pakai template) → pilih channel, isi tujuan & isi pesan → **Masukkan Antrian**.',
      'Kirim satu per satu (**Kirim** di baris) atau sekaligus (**Kirim Antrian**, maksimal 20 sekali jalan).',
      'Status: QUEUED (menunggu) → SENT (diproses provider) atau FAILED (bisa **Retry**).',
      'Tab **Template**: ubah isi pesan dengan placeholder `{{customer}}`, `{{invoice}}`, `{{amount}}`, `{{due_date}}`.',
    ],
    note:'PENTING: kalau `WA_GATEWAY_URL` / `SMTP_URL` belum diset, sistem berjalan **mode console** — pesan tercatat SENT tapi TIDAK benar-benar terkirim (ada banner peringatan). Isi env tersebut untuk pengiriman nyata.',
  },
  {
    n:'Link Lacak Pesanan', p:'/lacak/:token', icon:Link2, tone:'border-indigo-200',
    what:'Halaman publik (tanpa login) yang menampilkan status pesanan pelanggan: timeline pesanan, pengiriman, invoice, dan sisa tagihan. Mengurangi telepon "pesanan saya sudah sampai mana?".',
    who:'Sales & gudang membuat link; pelanggan membuka tanpa akun',
    steps:[
      'Buka **Sales Order → Detail** pesanan yang ingin dibagikan.',
      'Klik **Bagikan Link Lacak**. Sistem membuat token acak 32 karakter dan menyalin URL `/lacak/<token>`.',
      'Kirim URL tersebut ke pelanggan (WA/email). Mereka melihat status tanpa perlu login.',
      'Klik tombol yang sama lagi untuk menyalin ulang; akses bisa dicabut kapan saja.',
    ],
    note:'Yang tampil hanya status & tanggal — tidak ada harga modal, TTD, catatan internal, atau data pelanggan lain. Order POS tanpa DO otomatis tidak menampilkan tahap kirim/terima.',
  },
  {
    n:'Termin Proyek → Invoice', p:'/projects', icon:Building2, tone:'border-violet-200',
    what:'Memecah nilai kontrak proyek menjadi termin (DP, termin 1..n, retensi) dan menagih tiap termin menjadi invoice AR tanpa membuat Sales Order manual.',
    who:'Sales, Project Manager, Finance, Direktur/Super Admin',
    steps:[
      'Buka **Proyek & Tender** → klik kartu proyek untuk membuka detail.',
      'Klik **Generate 30/40/30** untuk membuat termin standar (bisa juga tambah manual), atau sesuaikan persentase dengan kontrak.',
      'Pada termin yang masih PENDING klik **Tagih** → invoice terbit otomatis (PPN 11%, jatuh tempo 14 hari) dan termin berubah INVOICED.',
      'Invoice masuk ke **AR/AP**, aging, dan **Kolektibilitas** seperti invoice biasa.',
    ],
    note:'Total persentase termin harus 100%. Termin yang sudah ditagih tidak bisa dihapus. Jurnal saat invoice: **Dr Piutang 1-1100 / Cr Penjualan 4-1000 / Cr Hutang Pajak 2-1100**.',
  },
  {
    n:'Payroll → Jurnal & Penyusutan Aset', p:'/hr • /assets', icon:TrendingDown, tone:'border-rose-200',
    what:'Dua otomatisasi akuntansi: (1) posting gaji bulanan menjadi jurnal, (2) penyusutan aset tetap bulanan menjadi jurnal — supaya laba-rugi tidak hanya berisi penjualan.',
    who:'HRD (payroll), Finance (penyusutan & jurnal), Direktur/Super Admin',
    steps:[
      '**Payroll**: buka **Karyawan & HR → Payroll** → pilih periode → **Posting Jurnal**. Payroll yang sudah diposting otomatis dilewati (idempotent).',
      '**Aset**: buka **Aset Tetap** → **Penyusutan Bulan Ini**. Sistem menghitung garis lurus per aset aktif: (perolehan − residu) ÷ (umur × 12), maksimal sampai nilai buku habis.',
      'Cek hasilnya di **COA & Jurnal / Jurnal Umum** dan pastikan **Trial Balance** tetap seimbang.',
    ],
    note:'Payroll: **Dr Beban Gaji 6-1000** (gaji bruto + BPJS perusahaan) / **Cr Hutang PPh21 2-1100**, **Cr Hutang BPJS 2-1200**, **Cr Hutang Gaji 2-1300**. Penyusutan: **Dr Beban Penyusutan 6-2000 / Cr Akumulasi Penyusutan 1-3000**. Satu aset hanya disusutkan sekali per bulan.',
  },
];

const MODULES = GUIDEBOOK_ROUTES.map(r => ({
  g: r.category,
  n: r.title,
  p: r.path,
  r: r.roles.join(', '),
  d: r.goal,
  prerequisites: r.prerequisites,
  steps: r.steps,
  impact: r.impact,
  troubleshooting: r.troubleshooting,
  icon: getIconForRoute(r.path, r.category)
}));

const RULES = [
  { t:'Absensi: radius 200 m & batas 08:00', d:'Titik pusat = Gudang Pusat (-6.8392646, 111.9838451). Di luar 200 m ditolak. Lewat 08:00 tetap bisa absen tetapi tercatat terlambat dan masuk notifikasi HR.', i:MapPin },
  { t:'Tanda tangan 3 pihak wajib', d:'Pengirim/gudang (saat buat DO), pengemudi (saat klaim), penerima (saat selesai trip). Tanpa itu DO tidak sah dan invoice terkunci.', i:PenLine },
  { t:'Konfirmasi kantor = gerbang invoice', d:'Invoice tidak bisa dilunasi sebelum konfirmasi gudang/kantor. Tombolnya ada di Logistik, Surat Jalan, dan Detail Sales Order.', i:CheckCircle2 },
  { t:'Stok POS tidak dipotong dua kali', d:'Order POS memotong stok saat checkout. DO dari order POS tidak memotong stok lagi, dan pembatalan trip POS tidak mengembalikan stok.', i:Package },
  { t:'Kas tunai dulu, baru bank', d:'Tutup shift mengkredit Kas Tunai (hanya kelebihan kas). Setor ke bank memindahkan kas → bank dengan jurnal Dr Bank / Cr Kas Tunai.', i:CircleDollarSign },
  { t:'Satu sumber hak akses', d:'Menu, route guard, dan API memakai src/config/access.js. Kalau menu tidak muncul, minta admin menambah role — jangan menembak URL.', i:ShieldCheck },
  { t:'HOLD memblokir pembayaran & order', d:'Selisih qty/harga pada 3-way matching membuat AP HOLD. Pelanggan menunggak bisa di-HOLD sehingga order baru diblokir; hanya Direktur yang bisa membuka.', i:AlertTriangle },
  { t:'Tanggal & jam = WIB', d:'Semua tanggal bisnis memakai WIB (UTC+7). Laporan harian mengikuti tanggal WIB, bukan UTC server.', i:Clock },
  { t:'Jurnal harus balance', d:'Setiap aksi keuangan (bayar, setor kas, opname, payroll, penyusutan) membuat jurnal double-entry. Trial Balance DEBIT = KREDIT adalah syarat tutup buku.', i:BookMarked },
];

const FAQ = [
  { q:'Kenapa tombol "Validasi & Tandai Selesai" tidak bisa ditekan?', a:'Masih ada DO yang belum dikonfirmasi gudang/kantor. Buka Logistik, Surat Jalan, atau Detail Sales Order → klik "Konfirmasi Gudang", lalu tombol validasi aktif dan invoice bisa dilunasi.' },
  { q:'Invoice sudah dibayar tapi status SO belum COMPLETED?', a:'SO selesai hanya jika semua DO sudah dikonfirmasi kantor DAN semua invoice PAID. Cek panel pengiriman di Detail Sales Order.' },
  { q:'Kenapa stok tidak berkurang setelah buat DO?', a:'Untuk order POS stok sudah dipotong saat checkout (by design). Untuk SO non-POS, stok dipotong saat DO dibuat — cek Kartu Stok untuk memastikan.' },
  { q:'Shift tidak bisa ditutup / tombol tutup tidak muncul?', a:'Pastikan shift memang OPEN milik akun Anda (satu kasir satu shift). Kalau kasir sebelumnya lupa menutup, admin perlu menutup paksa shift tersebut.' },
  { q:'Uang tutup shift tidak muncul di Kas Tunai?', a:'Yang dikreditkan hanya kelebihan kas (kas fisik − kas awal). Kalau kas fisik sama dengan kas awal, tidak ada penjualan tunai → tidak ada kredit. Cek mutasi kas di kartu Cash & Bank.' },
  { q:'Stock opname tidak bisa diposting / tombol Posting hilang?', a:'Posting hanya untuk sesi berstatus APPROVED dan hanya oleh Direktur/Super Admin/Finance. Urutannya: Ajukan → Approve → Posting. Setelah POSTED, sesi terkunci.' },
  { q:'Nomor faktur pajak ditolak?', a:'Harus tepat 16 digit angka. Format tampilan boleh 010.000-26.00000001, tetapi sistem menyimpan 16 digit. Nomor bisa diganti dengan menyimpan ulang.' },
  { q:'Pesan di Pusat Notifikasi berstatus SENT tapi pelanggan tidak menerima?', a:'Cek banner "Mode console" di atas halaman. Kalau muncul, gateway WA/Email belum diset (WA_GATEWAY_URL/SMTP_URL) — pesan hanya dicatat, tidak dikirim. Isi env tersebut di container backend.' },
  { q:'Link lacak pelanggan tidak bisa dibuka?', a:'Pastikan link belum dicabut dan order masih punya token aktif. Buat ulang dari Detail Sales Order → "Bagikan Link Lacak". Token lama tetap berlaku sampai dicabut.' },
  { q:'Termin proyek tidak bisa ditagih?', a:'Cek tiga hal: total persentase termin = 100%, proyek sudah punya pelanggan, dan termin masih PENDING (belum punya invoice).' },
  { q:'Payroll sudah dibayar tapi belum ada jurnal?', a:'Buka tab Payroll → pilih periode → "Posting Jurnal". Payroll yang sudah diposting akan dilewati, jadi aman ditekan berulang.' },
  { q:'Penyusutan aset dijalankan dua kali, apakah dobel?', a:'Tidak. Setiap aset hanya punya satu baris per periode (unique asset_id + period). Menjalankan ulang hanya memproses aset yang belum disusutkan bulan itu.' },
  { q:'Absen ditolak "di luar radius"?', a:'Anda lebih dari 200 m dari Gudang Pusat. Aktifkan GPS presisi tinggi, atau minta HRD mengisi absen manual (geofence dilewati, tercatat siapa yang mengisi).' },
  { q:'Menu yang saya butuhkan tidak muncul di sidebar?', a:'Menu mengikuti role. Minta admin menambah role di akun. Jangan bookmark URL modul lain — guard akan menolak.' },
  { q:'Pembayaran AP gagal / tombol bayar tidak ada?', a:'Status harus MATCHED/APPROVED/RECEIVED. HOLD berarti ada selisih qty/harga — benarkan dulu di Goods Receipt atau approve selisih.' },
  { q:'Pelanggan tidak bisa order baru?', a:'Pelanggan berstatus HOLD (menunggak) atau melebihi limit kredit. Finance menandai HOLD; hanya Direktur yang bisa membuka blokir.' },
  { q:'Cetak surat jalan tidak ada tanda tangannya?', a:'Surat jalan menampilkan TTD yang tersimpan. Pastikan gudang menandatangani saat Buat DO dan driver saat Klaim — TTD penerima muncul setelah trip diselesaikan.' },
];

const GLOSSARY = [
  ['SO', 'Sales Order — pesanan penjualan dari pelanggan.'],
  ['DO', 'Delivery Order — surat jalan/pengiriman barang.'],
  ['POD', 'Proof of Delivery — bukti barang diterima (TTD penerima + foto).'],
  ['AR / AP', 'Piutang (uang masuk) / Hutang (uang keluar).'],
  ['DPP', 'Dasar Pengenaan Pajak — nilai sebelum PPN.'],
  ['PPN Keluaran / Masukan', 'PPN yang dipungut dari penjualan / PPN yang dibayar ke supplier.'],
  ['PPh 21 / 23 / 4(2)', 'Pajak penghasilan atas gaji, jasa, dan sewa/bangunan.'],
  ['HPP', 'Harga Pokok Penjualan — nilai modal barang terjual (rata-rata/avg cost).'],
  ['Variance', 'Selisih antara kas/stok fisik dan catatan sistem.'],
  ['Opname', 'Hitung fisik stok gudang untuk mencocokkan sistem dengan kenyataan.'],
  ['Dunning', 'Surat/tagihan penagihan berjenjang untuk piutang jatuh tempo.'],
  ['HOLD', 'Blokir sementara: pelanggan menunggak atau invoice supplier bermasalah.'],
  ['RBAC', 'Role Based Access Control — hak akses per jabatan.'],
  ['Idempotent', 'Aman dijalankan berulang tanpa menggandakan data (mis. posting payroll).'],
];

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-9 w-9 rounded-xl bg-surface-3 text-brand grid place-items-center shrink-0"><Icon size={17} /></span>
      <h2 className="text-lg font-bold text-ink tracking-tight">{children}</h2>
    </div>
  );
}

function RichText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((p, i) => {
    if(p.startsWith('**') && p.endsWith('**')) return <b key={i} className="font-bold text-ink">{p.slice(2, -2)}</b>;
    if(p.startsWith('`') && p.endsWith('`')) return <code key={i} className="font-mono text-[10px] bg-surface-2 border border-line rounded px-1 py-0.5">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  })}</>;
}

export default function Guidebook() {
  const [q, setQ] = useState('');
  const [openFaq, setOpenFaq] = useState(0);

  const query = q.trim().toLowerCase();
  const match = (...fields) => !query || fields.join(' ').toLowerCase().includes(query);

  const modules = useMemo(() => MODULES.filter(m => match(
    m.n, m.g, m.d, m.r, m.p,
    (m.steps||[]).join(' '),
    m.prerequisites||'',
    m.impact||'',
    (m.troubleshooting||[]).join(' ')
  )), [query]);
  const roles = useMemo(() => ROLES.filter(r => match(r.role, r.steps.join(' '))), [query]);
  const faqs = useMemo(() => FAQ.filter(f => match(f.q, f.a)), [query]);
  const rules = useMemo(() => RULES.filter(r => match(r.t, r.d)), [query]);
  const newModules = useMemo(() => NEW_MODULES.filter(m => match(m.n, m.what, m.who, m.steps.join(' '), m.note)), [query]);
  const glossary = useMemo(() => GLOSSARY.filter(([k,v]) => match(k, v)), [query]);
  const grouped = useMemo(() => {
    const out = [];
    for (const m of modules) {
      let g = out.find(x => x.g === m.g);
      if (!g) { g = { g: m.g, items: [] }; out.push(g); }
      g.items.push(m);
    }
    return out;
  }, [modules]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-line print:hidden">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-navy text-white grid place-items-center font-bold text-sm">SM</div>
          <div className="font-bold text-sm">Guidebook ERP</div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-3 text-brand font-bold">v2.0</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-line bg-surface text-xs font-bold text-ink-2 hover:bg-surface-2 inline-flex items-center gap-1.5">
              <Printer size={14} /> Cetak / PDF
            </button>
            <Link to="/login" className="h-9 px-3 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-strong inline-flex items-center gap-1.5">
              <ArrowLeft size={14} /> Kembali ke Login
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <section className="rounded-2xl bg-gradient-to-br from-[#0b1c30] via-[#12305c] to-[#0051d5] text-white p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase bg-white/15 px-2.5 py-1 rounded-full">
            <BookOpen size={13} /> Panduan Penggunaan
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">ERP Sumber Material Jaya</h1>
          <p className="mt-2 text-sm text-white/80 max-w-3xl leading-relaxed">
            Panduan lengkap: alur kerja, langkah per modul, aturan bisnis, dan solusi masalah umum.
            Setiap modul dijelaskan <b>fungsinya</b>, <b>siapa yang memakai</b>, <b>langkah kerjanya</b>, dan <b>jurnal yang terbentuk</b>.
            Bisa dibuka tanpa login — bagikan tautannya ke tim baru.
          </p>
          <div className="mt-5 relative max-w-xl">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari modul, role, atau masalah (mis. opname, faktur, payroll, lacak)..."
              className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/10 border border-white/20 text-sm placeholder:text-white/50 outline-none focus:bg-white/15 focus:border-white/40" />
          </div>
          {query && <div className="mt-2 text-[11px] text-white/70">{modules.length} modul • {newModules.length} modul baru • {roles.length} role • {faqs.length} tanya-jawab cocok dengan "{q}"</div>}
        </section>

        {newModules.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={Layers}>Modul Baru — Penjelasan Rinci</SectionTitle>
            <div className="grid lg:grid-cols-2 gap-4">
              {newModules.map(m => (
                <div key={m.n} className={`bg-surface rounded-2xl border ${m.tone} overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-surface-2 border border-line text-brand grid place-items-center shrink-0"><m.icon size={15}/></span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight">{m.n}</div>
                      <div className="text-[10px] font-mono text-ink-3">{m.p}</div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-[12px] text-ink-2 leading-relaxed">{m.what}</p>
                    <div className="text-[11px]"><span className="font-bold text-ink">Untuk: </span><span className="text-ink-2">{m.who}</span></div>
                    <ol className="space-y-2">
                      {m.steps.map((s,i)=>(
                        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-ink/90">
                          <span className="h-5 w-5 shrink-0 rounded-full bg-surface-3 text-brand text-[10px] font-bold grid place-items-center mt-0.5">{i+1}</span>
                          <span><RichText text={s}/></span>
                        </li>
                      ))}
                    </ol>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 leading-relaxed flex gap-2">
                      <Info size={13} className="shrink-0 mt-0.5"/><span><RichText text={m.note}/></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(!query || FLOWS.some(f => match(f.title, f.note))) && (
          <section className="space-y-4">
            <SectionTitle icon={Workflow}>Alur Besar Sistem</SectionTitle>
            <div className="grid lg:grid-cols-3 gap-4">
              {FLOWS.map(f => (
                <div key={f.title} className="bg-surface rounded-2xl border border-line overflow-hidden">
                  <div className={`px-4 py-3 bg-gradient-to-r ${f.color} text-white flex items-center gap-2`}>
                    <f.icon size={16} />
                    <div className="font-bold text-sm">{f.title}</div>
                  </div>
                  <ol className="p-4 space-y-3">
                    {f.steps.map(([t, d], i) => (
                      <li key={t} className="flex gap-2.5">
                        <span className="h-5 w-5 shrink-0 rounded-full bg-surface-3 text-brand text-[10px] font-bold grid place-items-center mt-0.5">{i + 1}</span>
                        <div className="text-xs leading-relaxed">
                          <div className="font-bold text-ink">{t}</div>
                          <div className="text-ink-2">{d}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="px-4 pb-4 text-[11px] text-ink-2 bg-bg border-t border-line pt-3">{f.note}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {roles.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={Users}>Mulai Cepat per Role</SectionTitle>
            <div className="grid md:grid-cols-2 gap-4">
              {roles.map(r => (
                <div key={r.role} className={`rounded-2xl border p-4 ${r.tone}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${r.chip}`} />
                    <div className="font-bold text-sm">{r.role}</div>
                  </div>
                  <ol className="mt-2.5 space-y-2">
                    {r.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink/90">
                        <span className="font-bold opacity-50 tabular-nums">{i + 1}.</span>
                        <span><RichText text={s} /></span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {grouped.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={ClipboardList}>Daftar Modul &amp; Langkahnya</SectionTitle>
            <p className="text-xs text-ink-2 -mt-2">Klik nama modul untuk melihat langkah kerjanya.</p>
            <div className="space-y-5">
              {grouped.map(g => (
                <div key={g.g}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-2">{g.g}</div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {g.items.map(m => (
                      <details key={m.p} className="bg-surface rounded-xl border border-line overflow-hidden group shadow-sm transition-all hover:border-brand/30">
                        <summary className="cursor-pointer p-3.5 flex items-start gap-2.5 list-none [&::-webkit-details-marker]:hidden bg-surface hover:bg-surface-2 transition-colors">
                          <span className="h-8 w-8 rounded-lg bg-surface-2 border border-line text-brand grid place-items-center shrink-0">
                            <m.icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[13px] text-ink leading-tight">{m.n}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-3 font-semibold">{m.g}</span>
                            </div>
                            <div className="text-[11px] font-mono text-ink-3 mt-0.5">{m.p}</div>
                          </div>
                          <ChevronRight size={14} className="text-ink-3 group-open:rotate-90 transition-transform mt-1.5 shrink-0"/>
                        </summary>
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-line/60 bg-surface">
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Tujuan Halaman</div>
                            <p className="text-xs text-ink-2 leading-relaxed">{m.d}</p>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                            <Users size={12} className="shrink-0 text-brand"/>
                            <span><b className="text-ink">Role:</b> {m.r}</span>
                          </div>

                          {m.prerequisites && (
                            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-2.5 text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed flex items-start gap-1.5">
                              <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                              <div><b className="font-bold">Prasyarat:</b> {m.prerequisites}</div>
                            </div>
                          )}

                          {m.steps && m.steps.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Langkah Kerja (SOP)</div>
                              <ol className="space-y-1.5">
                                {m.steps.map((s, i) => (
                                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-2">
                                    <span className="h-4 w-4 shrink-0 rounded-full bg-surface-3 text-brand text-[10px] font-bold grid place-items-center mt-0.5">{i+1}</span>
                                    <span className="flex-1"><RichText text={s}/></span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {m.impact && (
                            <div className="rounded-lg bg-brand-soft/40 border border-brand/20 p-2.5 text-[11px] text-ink-2 leading-relaxed">
                              <div className="font-bold text-brand uppercase text-[10px] tracking-wider mb-0.5">Dampak Stok & Akuntansi GL</div>
                              <RichText text={m.impact}/>
                            </div>
                          )}

                          {m.troubleshooting && m.troubleshooting.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-line/60">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Troubleshooting</div>
                              <ul className="space-y-1">
                                {m.troubleshooting.map((t, i) => (
                                  <li key={i} className="text-[11px] text-ink-3 leading-relaxed">
                                    💡 {t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="pt-2 flex justify-end">
                            <Link to={m.p.includes(':') ? '/' : m.p} className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1">
                              Buka Halaman Ini <ChevronRight size={12}/>
                            </Link>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {rules.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={ShieldCheck}>Aturan Penting (jangan dilanggar)</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-3">
              {rules.map(r => (
                <div key={r.t} className="bg-surface rounded-xl border border-line p-3.5 flex gap-2.5">
                  <span className="h-7 w-7 rounded-lg bg-amber-50 text-amber-700 grid place-items-center shrink-0"><r.i size={14} /></span>
                  <div>
                    <div className="font-bold text-xs">{r.t}</div>
                    <div className="text-[11px] text-ink-2 mt-1 leading-relaxed">{r.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={AlertTriangle}>Troubleshooting &amp; FAQ</SectionTitle>
            <div className="bg-surface rounded-2xl border border-line divide-y divide-line overflow-hidden">
              {faqs.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q}>
                    <button onClick={() => setOpenFaq(open ? -1 : i)} className="w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-bg">
                      <ChevronRight size={14} className={'text-brand transition-transform ' + (open ? 'rotate-90' : '')} />
                      <span className="text-xs font-bold text-ink flex-1">{f.q}</span>
                    </button>
                    {open && <div className="px-10 pb-3 text-[11px] text-ink-2 leading-relaxed">{f.a}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {glossary.length > 0 && (
          <section className="space-y-4">
            <SectionTitle icon={BookMarked}>Istilah &amp; Singkatan</SectionTitle>
            <div className="bg-surface rounded-2xl border border-line divide-y divide-line overflow-hidden">
              {glossary.map(([k,v]) => (
                <div key={k} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                  <div className="text-xs font-bold text-ink sm:w-[190px] shrink-0">{k}</div>
                  <div className="text-[11px] text-ink-2 leading-relaxed">{v}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!modules.length && !roles.length && !faqs.length && !newModules.length && (
          <div className="bg-surface rounded-2xl border border-dashed border-brand/20 p-10 text-center">
            <div className="font-bold text-sm">Tidak ada hasil untuk "{q}"</div>
            <div className="text-xs text-ink-3 mt-1">Coba kata kunci lain: stok, opname, invoice, absen, kas, pajak, payroll, lacak.</div>
          </div>
        )}

        <footer className="text-center text-[11px] text-ink-3 py-6 border-t border-line">
          Guidebook ERP v2.0 • PT Sumber Material Jaya • diperbarui 30 Oktober 2026
          <div className="mt-1">Ada alur yang belum tercakup? Kirim ke IT support / admin sistem.</div>
        </footer>
      </main>
    </div>
  );
}
