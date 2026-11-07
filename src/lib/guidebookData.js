/* ─────────────────────────────────────────────────────────────────────────────
   PANDUAN OPERASIONAL ERP PT SUMBER MATERIAL JAYA
   Direktori dokumentasi terpusat untuk semua 44+ rute/halaman ERP.
   Digunakan oleh halaman /panduan dan Slide-Over Drawer "Panduan Halaman Ini".
   ───────────────────────────────────────────────────────────────────────────── */

export const GUIDEBOOK_ROUTES = [
  {
    path: '/',
    title: 'Dashboard & Executive KPI',
    category: 'Utama',
    roles: ['direktur', 'super_admin', 'finance', 'auditor', 'manager'],
    goal: 'Memantau performa bisnis real-time, omset penjualan, status kas, piutang jatuh tempo, dan peringatan kritis stok/absensi.',
    prerequisites: 'Koneksi ke backend dan hak akses dashboard operasional.',
    steps: [
      'Buka halaman utama untuk melihat ringkasan omset harian, piutang berjalan, dan saldo kas/bank.',
      'Periksa badge notifikasi pada kartu ringkasan untuk mengidentifikasi stok menipis atau approval menggantung.',
      'Gunakan grafik tren penjualan dan perputaran kas untuk mengevaluasi kesehatan finansial PT Sumber Material Jaya.',
      'Klik tombol aksi cepat untuk langsung menuju modul operasional terkait.'
    ],
    impact: 'Halaman analitik read-only; tidak mengubah saldo stok atau jurnal akuntansi secara langsung.',
    troubleshooting: [
      'Angka omset tampak belum terupdate: Klik tombol refresh atau pastikan kasir telah melakukan checkout POS/SO berstatus APPROVED.',
      'Lonceng notifikasi merah: Buka menu Approval atau Notifikasi untuk memproses tindakan yang tertunda.'
    ]
  },
  {
    path: '/sales/pos',
    title: 'POS Counter Kasir',
    category: 'Penjualan',
    roles: ['kasir', 'supervisor', 'admin', 'direktur'],
    goal: 'Melayani penjualan kasir langsung di toko dalam tempo < 30 detik dengan pemotongan stok otomatis dan dukungan cetak struk thermal.',
    prerequisites: 'Kasir wajib melakukan Buka Shift dan menginput nominal modal kas awal sebelum transaksi pertama.',
    steps: [
      'Klik Buka Shift di bar bagian atas, masukkan jumlah kas awal di laci (contoh: Rp 500.000).',
      'Pilih pelanggan terdaftar atau masukkan nama & nomor kontak pelanggan baru.',
      'Scan barcode barang atau ketik nama pada kolom pencarian (F2). Klik item untuk masuk ke keranjang.',
      'Sesuaikan kuantitas menggunakan kontrol stepper. Sistem akan mencegah qty melebihi batas stok tersedia.',
      'Pilih metode pembayaran (CASH, TRANSFER, CARD, QRIS) dan nominal DP bila bertahap.',
      'Klik BAYAR. Setelah berhasil, struk transaksi otomatis dapat dicetak atau diarahkan ke printer thermal 80mm.',
      'Pada akhir hari operasional, klik Tutup Shift dan hitung fisik kas tunai di laci untuk merekonsiliasi selisih kas.'
    ],
    impact: 'Stok barang langsung berkurang di gudang outlet aktif. Jurnal otomatis: Dr Kas/Bank / Dr Piutang (jika bertahap) / Cr Penjualan / Cr PPN Keluaran / Dr HPP / Cr Persediaan.',
    troubleshooting: [
      'Tombol Bayar dinonaktifkan: Pastikan keranjang berisi minimal 1 item dan shift kasir telah berstatus dibuka.',
      'Offline/Koneksi internet toko terputus: Transaksi tetap tersimpan aman di local storage perangkat kasir. Klik Kirim Sekarang setelah koneksi normal kembali.'
    ]
  },
  {
    path: '/sales/orders',
    title: 'Sales Order & Quotation',
    category: 'Penjualan',
    roles: ['sales', 'sales_trading', 'finance', 'admin', 'direktur'],
    goal: 'Mencatat pesanan penjualan partai besar, proyek, dan pelanggan grosir dengan alur approval bertingkat dan penjadwalan kirim.',
    prerequisites: 'Master pelanggan dan katalog produk aktif telah tersedia.',
    steps: [
      'Klik Buat Sales Order di kanan atas.',
      'Pilih pelanggan, tentukan tanggal kirim, gudang asal pengeluaran barang, serta termin pembayaran (Cash/Kredit).',
      'Tambahkan daftar barang beserta kuantitas dan harga negosiasi.',
      'Jika diskon melampaui batas wewenang sales, pesanan otomatis masuk status PENDING APPROVAL untuk disetujui Direktur/Finance.',
      'Setelah disetujui (APPROVED), pesanan diteruskan ke bagian Gudang untuk proses penyiapan (PICKING) dan pembuatan Delivery Order (DO).'
    ],
    impact: 'Mereservasi alokasi stok. Setelah DO terbit dan dikonfirmasi, memotong stok fisik dan membentuk piutang usaha (AR) serta jurnal penjualan.',
    troubleshooting: [
      'SO tertahan di status PENDING: Hubungi approver (Direktur/Manager) untuk menyetujui pengajuan diskon atau batas plafon kredit.',
      'Gagal memilih barang: Pastikan status produk AKTIF di Master Produk.'
    ]
  },
  {
    path: '/sales/order-history',
    title: 'Riwayat Transaksi Penjualan',
    category: 'Penjualan',
    roles: ['kasir', 'sales', 'finance', 'gudang', 'admin', 'direktur'],
    goal: 'Menelusuri seluruh riwayat penjualan baik dari counter POS maupun Sales Order beserta status pembayaran dan detail DO.',
    prerequisites: 'Telah ada transaksi penjualan yang tersimpan.',
    steps: [
      'Filter daftar berdasarkan rentang tanggal, status invoice (LUNAS, DP, BELUM BAYAR), atau metode bayar.',
      'Klik baris pesanan untuk melihat detail rincian barang, total diskon, PPN, dan riwayat mutasi pembayaran.',
      'Gunakan tombol Cetak Struk untuk mencetak ulang struk 80mm bagi pelanggan counter POS.'
    ],
    impact: 'Halaman pemantauan histori transaksi; tidak mengubah saldo buku besar.',
    troubleshooting: [
      'Kasir tidak melihat order sales lain: Akun role kasir secara default hanya dibatasi menampilkan riwayat shift dan transaksi miliknya demi keamanan data.'
    ]
  },
  {
    path: '/sales/invoices',
    title: 'Faktur Penjualan & Pelunasan AR',
    category: 'Keuangan',
    roles: ['finance', 'kasir', 'admin', 'direktur'],
    goal: 'Menerbitkan faktur komersial, mencatat pembayaran bertahap/pelunasan dari pelanggan, dan memantau umur piutang.',
    prerequisites: 'Sales Order berstatus APPROVED atau telah selesai dikirim dengan tanda tangan penerima.',
    steps: [
      'Pilih invoice penjualan yang akan dilunasi.',
      'Klik Catat Pembayaran, masukkan tanggal penerimaan, nominal dana masuk, dan rekening bank penampung.',
      'Jika terdapat potongan administrasi atau retur, sesuaikan nilai penyesuaian.',
      'Simpan pembayaran; status invoice otomatis diperbarui menjadi PAID jika lunas atau PARTIAL jika masih tersisa tagihan.'
    ],
    impact: 'Mendebit Rekening Bank/Kas dan Mengkredit Piutang Usaha (Akun 1-1100). Saat lunas penuh, mengubah status pesanan terkait menjadi COMPLETED.',
    troubleshooting: [
      'Tombol bayar terkunci: Pastikan konfirmasi kantor/tanda tangan surat jalan pengiriman telah diverifikasi bila pesanan menggunakan kurir gudang.'
    ]
  },
  {
    path: '/calculator',
    title: 'Kalkulator Kebutuhan Material',
    category: 'Penjualan',
    roles: ['sales', 'kasir', 'admin'],
    goal: 'Membantu pelanggan menghitung estimasi kebutuhan semen, bata merah, batako, dan besi beton berdasarkan luas bangunan (m²).',
    prerequisites: 'Data dimensi bidang pekerjaan fisik dari pelanggan.',
    steps: [
      'Pilih jenis konstruksi (Dinding Bata Merah, Batako, Plesteran, Cor Beton, atau Rangka Besi).',
      'Ketik panjang, tinggi, atau luasan bidang dalam satuan meter.',
      'Pilih ketebalan adukan atau perbandingan campuran semen:pasir.',
      'Sistem menghitung jumlah sak semen, kubikasi pasir, dan jumlah unit bata secara presisi.',
      'Klik Masukkan ke POS/SO untuk langsung mentransfer daftar material yang dihitung ke keranjang belanja kasir.'
    ],
    impact: 'Fitur kalkulasi teknis tanpa mutasi GL atau persediaan langsung.',
    troubleshooting: [
      'Hasil hitungan tidak sesuai standar kontraktor: Sesuaikan persentase waste (susut/pecah proyek) antara 5% hingga 10% di formulir.'
    ]
  },
  {
    path: '/crm',
    title: 'CRM & Pipeline Prospek',
    category: 'Penjualan',
    roles: ['sales', 'admin', 'direktur'],
    goal: 'Mengelola basis data calon pembeli potensial, proyek tender arsitek/kontraktor, dan riwayat penawaran harga.',
    prerequisites: 'Daftar kontak prospek baru.',
    steps: [
      'Klik Tambah Prospek, masukkan nama perusahaan kontraktor, narahubung, nomor telepon, dan estimasi nilai proyek.',
      'Geser kartu prospek di papan Kanban dari tahap LEAD -> KONTAK -> NEGOSIASI -> DEAL / LOST.',
      'Catat log komunikasi (telepon, meeting lapangan, visit proyek).',
      'Saat prospek berstatus DEAL, klik Konversi ke Pelanggan untuk otomatis mendaftarkan ke Master Pelanggan.'
    ],
    impact: 'Pengelolaan hubungan pelanggan; tidak berdampak finansial langsung.',
    troubleshooting: [
      'Prospek hilang dari daftar: Periksa tab filter aktif atau cari berdasarkan nama narahubung.'
    ]
  },
  {
    path: '/credit',
    title: 'Kontrol Kredit & Kolektibilitas',
    category: 'Keuangan',
    roles: ['finance', 'admin', 'direktur'],
    goal: 'Memantau klasifikasi piutang menunggak (Lancar, Dalam Perhatian, Kurang Lancar, Diragukan, Macet), memblokir transaksi pelanggan bermasalah, dan menerbitkan surat penagihan.',
    prerequisites: 'Transaksi piutang yang telah melewati masa jatuh tempo invoice.',
    steps: [
      'Pantau tabel aging piutang berdasarkan kategori umur tunggakan (1-30 hari, 31-60 hari, >90 hari).',
      'Untuk pelanggan bermasalah, klik Blokir Kredit guna mencegah sales menerbitkan SO baru kepada pelanggan tersebut.',
      'Klik Cetak Surat Tagihan (Somasi 1, 2, atau 3) untuk dilampirkan bersama invoice.',
      'Hanya Direktur atau Super Admin yang berwenang membuka kembali status blokir kredit pelanggan.'
    ],
    impact: 'Penegakan kebijakan penagihan AR; pembekuan hak kredit penjualan.',
    troubleshooting: [
      'Sales tidak bisa membuat pesanan untuk pelanggan tertentu: Periksa status blokir pelanggan pada modul ini.'
    ]
  },
  {
    path: '/projects',
    title: 'Proyek, RAB & Termin Kontrak',
    category: 'Proyek',
    roles: ['project_manager', 'sales', 'finance', 'admin', 'direktur'],
    goal: 'Mengelola kontrak suplai material jangka panjang, monitoring realisasi RAB vs aktual, dan penagihan termin berkala.',
    prerequisites: 'Surat perjanjian kontrak suplai material atau penunjukan tender.',
    steps: [
      'Buat data proyek baru, masukkan nama kontraktor, nomor kontrak, tanggal mulai-selesai, dan total pagu nilai kontrak.',
      'Pecah nilai kontrak menjadi beberapa tahapan pembayaran (contoh: Generate 30% DP, 40% Progres Lapangan, 30% Retensi).',
      'Ketika fisik proyek mencapai tahapan tertentu, klik Tagih Termin. Sistem otomatis menerbitkan Faktur Penjualan AR tanpa perlu SO manual.',
      'Pantau dokumen BAST (Berita Acara Serah Terima) dan dokumen pendukung proyek.'
    ],
    impact: 'Menerbitkan piutang termin (Dr Piutang Usaha / Cr Pendapatan Proyek / Cr PPN Keluaran).',
    troubleshooting: [
      'Total persentase termin tidak valid: Jumlah seluruh termin wajib tepat 100% dari nilai kontrak.'
    ]
  },
  {
    path: '/consignments',
    title: 'Konsinyasi Titip Jual & Titip Beli',
    category: 'Persediaan',
    roles: ['gudang', 'purchasing', 'finance', 'admin'],
    goal: 'Mencatat barang konsinyasi masuk dari produsen bata/semen khusus atau barang konsinyasi keluar ke mitra sub-agen.',
    prerequisites: 'Perjanjian konsinyasi dan pembagian komisi bagi hasil.',
    steps: [
      'Pilih jenis konsinyasi (Konsinyasi Masuk atau Konsinyasi Keluar).',
      'Catat tanda terima fisik barang titipan ke gudang konsinyasi khusus.',
      'Saat barang laku terjual di POS/SO, lakukan Rekonsiliasi Konsinyasi untuk menetapkan porsi hak supplier.',
      'Terbitkan PO Settlement konsinyasi untuk membayarkan barang yang telah laku.'
    ],
    impact: 'Barang titipan tidak diakui sebagai aset sebelum terjual. Saat settlement laku, membentuk pengakuan hutang dagang supplier.',
    troubleshooting: [
      'Stok konsinyasi tercampur stok utama: Pastikan selalu memilih lokasi gudang khusus "Konsinyasi" saat input penerimaan.'
    ]
  },
  {
    path: '/pricing',
    title: 'Daftar Harga Bertingkat & Grosir',
    category: 'Penjualan',
    roles: ['sales', 'finance', 'admin', 'direktur'],
    goal: 'Mengatur skema diskon volume (Tiered Pricing), harga khusus kontraktor, dan harga retail counter toko.',
    prerequisites: 'Data master produk dengan HPP rata-rata yang valid.',
    steps: [
      'Pilih produk material yang akan diatur harganya.',
      'Tambahkan rentang kuantitas pembelian (contoh: 1-10 zak: Rp 65.000, 11-100 zak: Rp 62.000, >100 zak: Rp 59.000).',
      'Tentukan batas bawah harga agar sales tidak menjual di bawah batas margin minimum perusahaan.',
      'Simpan konfigurasi; POS dan Sales Order akan otomatis menerapkan skema harga saat kasir menambah qty.'
    ],
    impact: 'Menentukan harga jual dasar per transaksi; memproteksi gross profit margin.',
    troubleshooting: [
      'Harga bertingkat tidak muncul di kasir: Pastikan tanggal berlaku harga masih aktif dan kuantitas keranjang memenuhi batas minimum tier.'
    ]
  },
  {
    path: '/returns',
    title: 'Retur Penjualan & Pembelian',
    category: 'Penjualan',
    roles: ['gudang', 'sales', 'finance', 'admin'],
    goal: 'Mencatat pengembalian material dari pelanggan (Retur Jual) atau pengembalian barang rusak ke supplier (Retur Beli).',
    prerequisites: 'Nomor invoice penjualan atau faktur pembelian asal.',
    steps: [
      'Pilih jenis Retur (Retur Penjualan atau Retur Pembelian).',
      'Pilih nomor invoice asal transaksi; sistem akan menampilkan daftar item yang dapat diretur.',
      'Tentukan kuantitas barang yang dikembalikan dan alasan (contoh: Kemasan Sobek, Besi Berkarat, Salah Spesifikasi).',
      'Pilih tindakan fisik stok: Masukkan kembali ke gudang aktif (kondisi baik) atau pindahkan ke Gudang Rusak/Karantina.',
      'Pilih metode kompensasi: Pemotongan sisa tagihan piutang (Credit Note) atau penggantian barang sejenis.'
    ],
    impact: 'Mengembalikan stok barang ke gudang terpilih. Membentuk jurnal balik pendapatan/piutang dan pemulihan HPP persediaan.',
    troubleshooting: [
      'Kuantitas retur ditolak: Kuantitas retur tidak boleh melebihi sisa barang yang belum pernah diretur pada invoice tersebut.'
    ]
  },
  {
    path: '/purchase/requests',
    title: 'Purchase Request (Permintaan Pembelian)',
    category: 'Pembelian',
    roles: ['gudang', 'purchasing', 'admin', 'direktur'],
    goal: 'Mengajukan kebutuhan pengadaan material baru dari kepala gudang atau departemen lapangan sebelum diterbitkan PO.',
    prerequisites: 'Stok barang mencapai titik batas minimum (Buffer/Reorder Point).',
    steps: [
      'Klik Buat Permintaan Pembelian.',
      'Pilih barang material, estimasi kuantitas yang dibutuhkan, tanggal kebutuhan, dan catatan alasan pengadaan.',
      'Simpan draft dan klik Ajukan ke Manajer Pembelian.',
      'Setelah disetujui, bagian Purchasing dapat melanjutkan ke pembuatan RFQ atau langsung PO.'
    ],
    impact: 'Dokumen perencanaan internal; tidak merubah stok maupun jurnal buku besar.',
    troubleshooting: [
      'Permintaan tidak diproses: Pastikan status PR telah diubah dari DRAFT menjadi SUBMITTED.'
    ]
  },
  {
    path: '/purchase/rfqs',
    title: 'RFQ (Request for Quotation)',
    category: 'Pembelian',
    roles: ['purchasing', 'admin'],
    goal: 'Meminta dan membandingkan penawaran harga dari 2 atau lebih supplier untuk mendapatkan harga dan termin terbaik.',
    prerequisites: 'Purchase Request yang telah disetujui.',
    steps: [
      'Pilih daftar barang kebutuhan dari PR.',
      'Kirimkan permintaan penawaran ke beberapa vendor/distributor.',
      'Input penawaran harga satuan, ongkos angkut, dan termin pembayaran yang diterima dari masing-masing supplier.',
      'Pilih penawaran pemenang terbaik dan klik Konversi ke Purchase Order (PO).'
    ],
    impact: 'Komparasi penawaran; tidak berdampak pada akuntansi buku besar.',
    troubleshooting: [
      'Daftar supplier kosong: Pastikan supplier telah didaftarkan pada Master Supplier dengan kategori barang terkait.'
    ]
  },
  {
    path: '/purchase/orders',
    title: 'Purchase Order (Pesanan Pembelian)',
    category: 'Pembelian',
    roles: ['purchasing', 'finance', 'admin', 'direktur'],
    goal: 'Menerbitkan surat pesanan resmi kepada pabrik semen/distributor besi baja dengan approval bertingkat sesuai plafon nilai pengadaan.',
    prerequisites: 'Data supplier dan penawaran harga yang disepakati.',
    steps: [
      'Klik Buat Purchase Order, pilih supplier terdaftar dan gudang tujuan pembongkaran.',
      'Pilih daftar material, qty tonase/sak, harga satuan, dan diskon pabrik.',
      'Jika total nilai PO melampaui batas wewenang purchasing (contoh: > Rp 50.000.000), sistem otomatis meminta Approval Direktur.',
      'Kirimkan dokumen PO resmi (PDF) ke supplier setelah berstatus APPROVED.'
    ],
    impact: 'Mengikat komitmen pengadaan; menjadi dasar pengecekan penerimaan barang gudang.',
    troubleshooting: [
      'PO tidak bisa disetujui: Pastikan seluruh item memiliki harga satuan di atas 0 dan gudang penerima telah dipilih.'
    ]
  },
  {
    path: '/purchase/receipts',
    title: 'Goods Receipt & 3-Way Matching',
    category: 'Pembelian',
    roles: ['gudang', 'purchasing', 'finance', 'admin'],
    goal: 'Menerima kedatangan fisik truk muatan material dari pabrik, memverifikasi kesesuaian surat jalan supplier dengan PO, dan mengontrol selisih.',
    prerequisites: 'Surat Purchase Order (PO) yang telah berstatus APPROVED.',
    steps: [
      'Pilih nomor PO yang barangnya tiba di gerbang gudang PT Sumber Material Jaya.',
      'Hitung fisik muatan barang nyata yang diturunkan dari armada pengangkut.',
      'Input kuantitas aktual yang diterima. Jika ada barang cacat/rusak, masukkan ke kolom Barang Rusak/Tolak.',
      'Jika terjadi selisih antara invoice supplier, PO, dan fisik terima, sistem menempatkan status transaksi pada kondisi HOLD.',
      'Simpan Penerimaan Barang (GR) untuk merilis stok masuk ke gudang.'
    ],
    impact: 'Menambah stok fisik gudang secara real-time. Mencatat mutasi kartu stok IN dan membentuk jurnal: Dr Persediaan Material / Cr Hutang Belum Ditagih (Goods Received Not Invoiced).',
    troubleshooting: [
      'Pembayaran supplier diblokir: Status HOLD pada penerimaan barang memblokir pencairan kas/bank oleh Finance hingga selisih diselesaikan.'
    ]
  },
  {
    path: '/landed-costs',
    title: 'Landed Cost (Biaya Tambahan Pengadaan)',
    category: 'Pembelian',
    roles: ['purchasing', 'finance', 'admin'],
    goal: 'Mengalokasikan ongkos angkut ekspedisi, biaya bongkar muat kuli, dan bea asuransi ke dalam harga pokok perolehan (HPP) barang.',
    prerequisites: 'Penerimaan barang (Goods Receipt) yang telah terkonfirmasi.',
    steps: [
      'Pilih nomor dokumen Goods Receipt yang dikenakan ongkos angkut tambahan.',
      'Ketik nominal total biaya ekspedisi/kuli bongkar.',
      'Pilih metode alokasi (Berdasarkan Nilai Rupiah, Kuantitas Qty, atau Berat/Tonase).',
      'Klik Terapkan Alokasi Landed Cost; sistem secara otomatis mendistribusikan biaya ke HPP tiap material terkait.'
    ],
    impact: 'Meningkatkan nilai valuasi persediaan dan HPP rata-rata berjalan barang tanpa mendistorsi harga beli dasar faktur supplier.',
    troubleshooting: [
      'HPP barang tidak berubah: Pastikan barang pada GR tersebut belum sepenuhnya terjual habis sebelum landed cost dialokasikan.'
    ]
  },
  {
    path: '/inventory/stocks',
    title: 'Stok per Gudang & Multi-Lokasi',
    category: 'Persediaan',
    roles: ['gudang', 'purchasing', 'sales', 'admin', 'direktur'],
    goal: 'Memantau kuantitas stok real-time yang tersedia, stok ter-reservasi, dan batas peringatan stok minimum di setiap gudang/outlet.',
    prerequisites: 'Data master barang dan gudang terdaftar.',
    steps: [
      'Pilih gudang spesifik pada dropdown filter (contoh: Gudang Induk Tuban, Toko Retail Jenu).',
      'Periksa status indikator warna: Hijau (Stok Aman), Kuning (Mendekati Minimum), Merah (Kritis / Habis).',
      'Klik ikon info pada baris produk untuk melihat rincian stok fisik vs stok yang sedang dalam proses kirim (in-transit).'
    ],
    impact: 'Tampilan status saldo persediaan saat ini.',
    troubleshooting: [
      'Stok tercatat negatif: Terjadi transaksi kasir sebelum proses penerimaan barang diinput. Segera input penerimaan stok atau lakukan opname koreksi.'
    ]
  },
  {
    path: '/inventory/stock-in',
    title: 'Penambahan & Koreksi Stok Manual',
    category: 'Persediaan',
    roles: ['gudang', 'admin', 'direktur'],
    goal: 'Melakukan penambahan stok non-PO, bonus pabrik, atau koreksi saldo awal persediaan.',
    prerequisites: 'Dokumen Berita Acara penerimaan non-pembelian yang ditandatangani supervisor.',
    steps: [
      'Pilih gudang penerima dan produk material.',
      'Pilih jenis mutasi (IN / SET Saldo). Masukkan jumlah kuantitas dan taksiran harga modal (HPP).',
      'Wajib ketik catatan referensi (contoh: Bonus Program Semen Zak dari Distributor).',
      'Klik Simpan Penambahan Stok.'
    ],
    impact: 'Menambah stok fisik pada gudang terpilih dan mencatat kartu stok bertipe IN.',
    troubleshooting: [
      'Harga modal wajib diisi: Sistem membutuhkan taksiran biaya agar perhitungan HPP rata-rata sistem tidak menjadi nol.'
    ]
  },
  {
    path: '/inventory/movements',
    title: 'Mutasi & Kartu Stok (Audit Trail)',
    category: 'Persediaan',
    roles: ['gudang', 'auditor', 'finance', 'admin', 'direktur'],
    goal: 'Memeriksa rekam jejak setiap pergerakan barang secara kronologis: saldo awal, masuk, keluar, nomor referensi dokumen, dan sisa saldo akhir.',
    prerequisites: 'Pilih produk spesifik yang ingin diaudit.',
    steps: [
      'Pilih barang material dan periode tanggal mutasi.',
      'Sistem menampilkan urutan kronologis: Pembelian (+), Penjualan POS/SO (-), Transfer Gudang, Retur, atau Koreksi Opname.',
      'Verifikasi bahwa setiap angka pengurangan memiliki nomor invoice atau DO yang sah.'
    ],
    impact: 'Buku pembantu persediaan (ledger stok append-only) yang tidak dapat dimanipulasi manual.',
    troubleshooting: [
      'Saldo kartu stok berbeda dengan fisik gudang: Lakukan penelusuran dokumen per tanggal selisih atau ajukan sesi Stock Opname.'
    ]
  },
  {
    path: '/inventory/transfers',
    title: 'Transfer Stok Antar Gudang',
    category: 'Persediaan',
    roles: ['gudang', 'logistik', 'admin', 'direktur'],
    goal: 'Memindahkan material dari Gudang Pusat ke Outlet Toko atau antar gudang cabang dengan pelacakan status In-Transit.',
    prerequisites: 'Stok tersedia di gudang asal transfer.',
    steps: [
      'Klik Buat Transfer Stok, tentukan Gudang Asal dan Gudang Tujuan.',
      'Pilih daftar barang dan kuantitas yang dipindahkan.',
      'Simpan dokumen; status menjadi PENDING/IN_TRANSIT (stok gudang asal berkurang, masuk ke buffer transit).',
      'Setelah armada tiba di gudang tujuan, petugas gudang penerima membuka dokumen dan mengklik Terima Transfer (status COMPLETED).'
    ],
    impact: 'Memindahkan lokasi kepemilikan stok. Saldo total perusahaan tetap, namun saldo per gudang disesuaikan.',
    troubleshooting: [
      'Barang belum muncul di gudang cabang: Pastikan staf gudang cabang telah mengklik tombol "Terima Transfer" untuk menyelesaikan proses transit.'
    ]
  },
  {
    path: '/inventory/opname',
    title: 'Stock Opname Fisik & Penyetelan',
    category: 'Persediaan',
    roles: ['gudang', 'finance', 'auditor', 'admin', 'direktur'],
    goal: 'Menghitung fisik barang nyata di gudang, membandingkannya dengan saldo sistem, dan menyetel stok melalui jurnal penyesuaian resmi.',
    prerequisites: 'Satu gudang hanya boleh memiliki satu sesi aktif berjalan. Dibuat oleh tim gudang, disetujui Direktur/Finance.',
    steps: [
      'Klik Buat Sesi Opname, pilih gudang yang akan dihitung fisik. Sistem mengambil snapshot stok pada detik tersebut.',
      'Petugas lapangan menghitung fisik nyata barang dan menginput kolom Hitung Fisik. Selisih dihitung otomatis (Fisik - Sistem).',
      'Klik Simpan Hitung (status COUNTING) untuk mencicil perhitungan.',
      'Jika seluruh rak telah terhitung, klik Ajukan Sesi (status SUBMITTED; angka terkunci).',
      'Atasan/Finance melakukan verifikasi dan klik Approve (APPROVED).',
      'Klik Posting Stok (status POSTED): Saldo sistem langsung diselaraskan dengan fisik, kartu stok mencatat ADJ, dan jurnal selisih terbentuk otomatis.'
    ],
    impact: 'Stok sistem disetel ke angka nyata. Jurnal selisih lebih: Dr Persediaan 1-1200 / Cr Pendapatan Selisih Stok 6-1100. Jurnal selisih kurang: Dr Beban Selisih Stok 6-1100 / Cr Persediaan 1-1200.',
    troubleshooting: [
      'Sesi tidak bisa diposting: Pastikan akun login memiliki hak akses level Direktur, Super Admin, atau Finance.'
    ]
  },
  {
    path: '/waste',
    title: 'Pencatatan Barang Rusak, Susut & Pecah',
    category: 'Persediaan',
    roles: ['gudang', 'finance', 'admin', 'direktur'],
    goal: 'Mencatat bata pecah, sak semen membatu/rusak terkena hujan, atau besi bengkok agar stok bersih dan HPP perusahaan tetap akurat.',
    prerequisites: 'Pemeriksaan fisik barang rusak di area karantina gudang.',
    steps: [
      'Klik Catat Pemusnahan/Susut.',
      'Pilih gudang, produk material, dan kuantitas yang rusak.',
      'Pilih klasifikasi penyebab (Kerusakan Alam/Hujan, Penanganan Kuli Kasar, Kedaluwarsa).',
      'Lampirkan catatan atau foto bukti fisik material rusak.',
      'Simpan; stok barang terkait otomatis dikeluarkan dari persediaan aktif.'
    ],
    impact: 'Memotong stok fisik barang. Membentuk jurnal pengakuan kerugian: Dr Beban Kerusakan/Susut Barang (6-1200) / Cr Persediaan Material (1-1200).',
    troubleshooting: [
      'Pencatatan ditolak: Kuantitas susut tidak boleh melebihi saldo stok yang tersedia di gudang tersebut.'
    ]
  },
  {
    path: '/logistics',
    title: 'Logistik & Delivery Order (DO)',
    category: 'Logistik',
    roles: ['gudang', 'logistik', 'admin', 'direktur'],
    goal: 'Menerbitkan surat jalan pengiriman, menunjuk armada truk dan pengemudi, serta mengumpulkan tanda tangan digital 3 pihak.',
    prerequisites: 'Sales Order berstatus APPROVED atau pesanan kasir yang membutuhkan pengiriman ke lokasi pelanggan.',
    steps: [
      'Pilih Sales Order yang siap dikirim.',
      'Klik Buat Delivery Order, pilih kendaraan armada pengiriman dan tentukan driver.',
      'Petugas gudang memeriksa muatan barang di atas truk dan wajib membubuhkan Tanda Tangan Pengirim di layar sentuh.',
      'Cetak Surat Jalan rangkap 3 untuk dibawa supir menuju lokasi proyek pelanggan.',
      'Setelah supir kembali membawa bukti serah terima bertanda tangan penerima, klik Konfirmasi Kantor/Gudang.'
    ],
    impact: 'Merubah status SO menjadi SHIPPED, kemudian DELIVERED. Konfirmasi kantor membuka gerbang penerbitan dan pelunasan invoice.',
    troubleshooting: [
      'Invoice tidak bisa dilunasi: Sistem mewajibkan kelengkapan tanda tangan pengirim, pengemudi, penerima, dan konfirmasi kantor.'
    ]
  },
  {
    path: '/surat-jalan',
    title: 'Daftar & Status Surat Jalan',
    category: 'Logistik',
    roles: ['gudang', 'logistik', 'sales', 'admin', 'direktur'],
    goal: 'Memantau seluruh surat jalan yang diterbitkan, dalam perjalanan, maupun yang telah selesai terkirim ke alamat proyek.',
    prerequisites: 'DO telah dibuat pada modul Logistik.',
    steps: [
      'Cari nomor surat jalan atau nama armada pengangkut.',
      'Periksa status kelengkapan tanda tangan (Pengirim, Driver, Penerima).',
      'Klik nomor surat jalan untuk membuka tampilan cetak dokumen siap print.'
    ],
    impact: 'Pemantauan pengiriman dokumen operasional.',
    troubleshooting: [
      'Surat jalan tidak ditemukan: Periksa filter rentang tanggal atau status pengiriman.'
    ]
  },
  {
    path: '/driver',
    title: 'Trip Pengemudi (Driver App)',
    category: 'Logistik',
    roles: ['driver', 'logistik', 'admin'],
    goal: 'Aplikasi mobile-friendly untuk supir truk PT Sumber Material Jaya: klaim trip pengiriman, navigasi rute proyek, dan unggah tanda tangan/foto serah terima.',
    prerequisites: 'Surat jalan DO yang telah dibuat gudang dan ditugaskan ke driver.',
    steps: [
      'Buka menu Trip Saya di ponsel/tablet pengemudi.',
      'Pilih DO yang ditugaskan, bubuhkan Tanda Tangan Pengemudi, lalu klik Klaim & Berangkat. Armada otomatis berstatus IN_TRANSIT.',
      'Gunakan tombol Lihat Peta / Alamat untuk navigasi GPS menuju lokasi pembongkaran pelanggan.',
      'Setelah material diturunkan di proyek, minta pelanggan membubuhkan Tanda Tangan Penerima di layar sentuh dan ambil foto bukti serah terima.',
      'Centang opsi "Invoice Diserahkan" jika supir menagihkan faktur, lalu klik Selesaikan Pengiriman (status DELIVERED).'
    ],
    impact: 'Memperbarui status pengiriman menjadi DELIVERED dan mencatat bukti geotagging serah terima.',
    troubleshooting: [
      'Gagal menyelesaikan trip: Pastikan tanda tangan penerima telah digoreskan pada kanvas tanda tangan sebelum klik selesai.'
    ]
  },
  {
    path: '/fleet',
    title: 'Manajemen Armada & Kendaraan',
    category: 'Logistik',
    roles: ['logistik', 'admin', 'direktur'],
    goal: 'Mencatat data truk/pickup engkel, jadwal uji KIR, masa berlaku pajak STNK, konsumsi BBM, dan servis berkala armada.',
    prerequisites: 'Data nomor polisi dan kapasitas tonase kendaraan PT Sumber Material Jaya.',
    steps: [
      'Daftarkan kendaraan baru (Nomor Polisi, Merk/Tipe: Colt Diesel/Fuso/Tronton, Kapasitas Muatan Tonase).',
      'Atur pengingat masa berlaku Pajak STNK dan Uji KIR.',
      'Catat riwayat pergantian oli, servis rem, atau pengisian BBM pada tab Log Perawatan.',
      'Pantau status kendaraan: AVAILABLE, IN_TRANSIT, atau UNDER_MAINTENANCE.'
    ],
    impact: 'Pemeliharaan aset logistik; mencegah penugasan armada yang sedang rusak atau mati uji kelayakan jalan.',
    troubleshooting: [
      'Kendaraan tidak muncul saat membuat DO: Periksa status kendaraan; jika disetel UNDER_MAINTENANCE maka kendaraan terkunci dari penugasan.'
    ]
  },
  {
    path: '/finance/coa',
    title: 'Bagan Akun Standar (Chart of Accounts)',
    category: 'Keuangan',
    roles: ['finance', 'auditor', 'admin', 'direktur'],
    goal: 'Mengelola struktur akun buku besar standar akuntansi perusahaan (Aset, Kewajiban, Ekuitas, Pendapatan, HPP, Beban).',
    prerequisites: 'Pengetahuan akuntansi double-entry dan kebijakan akuntansi perusahaan.',
    steps: [
      'Lihat hirarki akun berdasarkan kode akun (1-xxxx Aset, 2-xxxx Kewajiban, dst).',
      'Klik Tambah Akun untuk membuat sub-akun kas/bank baru atau akun beban operasional.',
      'Tentukan apakah akun merupakan Akun Induk (Header) atau Akun Transaksi (Detail Postable).'
    ],
    impact: 'Pondasi utama double-entry bookkeeping; seluruh mutasi transaksi merujuk pada kode COA ini.',
    troubleshooting: [
      'Tidak bisa menghapus akun: Akun yang telah memiliki riwayat jurnal transaksi tidak dapat dihapus demi menjaga integritas pembukuan.'
    ]
  },
  {
    path: '/finance/journals',
    title: 'Jurnal Umum & Ledger Akuntansi',
    category: 'Keuangan',
    roles: ['finance', 'auditor', 'admin', 'direktur'],
    goal: 'Mencatat ayat jurnal penyesuaian manual (reklasifikasi, beban sewa, bunga bank) dan memeriksa rincian transaksi debit-kredit.',
    prerequisites: 'Total debit wajib persis sama dengan total kredit (Balance = Seimbang).',
    steps: [
      'Klik Buat Jurnal Umum Manual.',
      'Pilih tanggal transaksi dan tuliskan memo uraian transaksi yang jelas.',
      'Tambahkan minimal dua baris akun (satu sisi DEBIT dan satu sisi KREDIT).',
      'Pastikan indikator SELISIH bernilai 0 (SEIMBANG).',
      'Klik Posting Jurnal. Setelah diposting, jurnal tersimpan secara permanen dalam audit ledger.'
    ],
    impact: 'Menambah catatan buku besar akun yang terlibat sesuai prinsip double-entry accounting.',
    troubleshooting: [
      'Posting jurnal ditolak: Total DEBIT harus sama dengan total KREDIT, dan periode akuntansi terkait tidak boleh dalam status terkunci/tutup buku.'
    ]
  },
  {
    path: '/finance/arap',
    title: 'Hutang & Piutang Usaha (AR/AP Aging)',
    category: 'Keuangan',
    roles: ['finance', 'auditor', 'admin', 'direktur'],
    goal: 'Memantau jatuh tempo tagihan pelanggan (Piutang Dagang / AR) dan tagihan pembayaran ke supplier pabrik (Hutang Usaha / AP).',
    prerequisites: 'Faktur penjualan dan faktur pembelian yang belum lunas.',
    steps: [
      'Pilih tab Piutang (AR) untuk melihat daftar piutang per pelanggan atau tab Hutang (AP) untuk daftar kewajiban per vendor pabrik.',
      'Gunakan pengelompokan aging (Belum Jatuh Tempo, 1-30 hari, 31-60 hari, >60 hari).',
      'Klik Bayar Hutang pada tagihan AP supplier yang akan dibayar via transfer bank, pilih akun bank penampung, dan konfirmasi pembayaran.'
    ],
    impact: 'Pelunasan hutang mendebit Hutang Usaha (2-1100) dan mengkredit akun Bank/Kas terkait.',
    troubleshooting: [
      'Jumlah piutang berbeda dengan laporan penjualan: Pastikan seluruh pembayaran kasir dan retur telah tervalidasi.'
    ]
  },
  {
    path: '/finance/tax',
    title: 'Administrasi Pajak & e-Faktur',
    category: 'Keuangan',
    roles: ['finance', 'auditor', 'admin', 'direktur'],
    goal: 'Pemberian nomor seri faktur pajak (NSFP 16 digit), rekapitulasi masa PPN Keluaran vs Masukan, pencatatan PPh Pasal 21/23/4(2), dan ekspor CSV siap impor e-Faktur.',
    prerequisites: 'Invoice penjualan dan invoice pembelian pada masa pajak yang dipilih.',
    steps: [
      'Pilih masa pajak (bulan/tahun) di kanan atas.',
      'Tab Faktur Keluaran: Ketik nomor seri faktur pajak 16 digit pada kolom input yang otomatis memformat format standar (010.000-YY.XXXXXXXX) lalu klik Simpan.',
      'Gunakan tombol "Isi Otomatis Semua" untuk menomori seluruh invoice secara sekuensial otomatis dalam 1 klik.',
      'Tab PPh Dipotong: Gunakan fasilitas pemilih Invoice/Supplier untuk otomatis mengisi pihak rekanan dan nilai DPP. Pilih jenis PPh (PPh 23 tarif 2%, PPh 21 tarif 5%, PPh 4(2) tarif 10%) dengan nominal yang otomatis terhitung real-time.',
      'Klik Export CSV untuk mengunduh arsip pelaporan masa pajak.'
    ],
    impact: 'Rekapitulasi perpajakan komersial perusahaan untuk pelaporan SPT Masa PPN dan PPh ke DJP.',
    troubleshooting: [
      'Format NSFP salah: Nomor seri faktur pajak wajib berisi 16 digit angka bersih tanpa huruf.'
    ]
  },
  {
    path: '/finance/periods',
    title: 'Tutup Buku Periode Akuntansi',
    category: 'Keuangan',
    roles: ['finance', 'auditor', 'super_admin', 'direktur'],
    goal: 'Mengunci periode akuntansi bulanan/tahunan setelah seluruh laporan keuangan diaudit, mencegah perubahan transaksi lama.',
    prerequisites: 'Neraca saldo (Trial Balance) seimbang dan rekonsiliasi kas/bank selesai.',
    steps: [
      'Pilih periode bulan yang akan ditutup (contoh: 2026-03).',
      'Pastikan tidak ada draft jurnal yang menggantung.',
      'Klik Tutup Periode. Setelah ditutup, sistem secara ketat menolak posting penjualan, pembelian, opname, payroll, atau jurnal baru pada tanggal periode tersebut.',
      'Membuka kembali periode tertutup hanya dapat dilakukan oleh Direktur / Super Admin dan wajib menyertakan alasan tertulis yang tercatat di audit log.'
    ],
    impact: 'Mengunci integritas ledger akuntansi secara permanen.',
    troubleshooting: [
      'Gagal posting transaksi: Jika muncul pesan "Periode akuntansi telah ditutup", periksa tanggal transaksi Anda atau mintakan pembukaan periode kepada Direktur.'
    ]
  },
  {
    path: '/finance/recon',
    title: 'Rekonsiliasi Bank Rekening Koran',
    category: 'Keuangan',
    roles: ['finance', 'admin', 'direktur'],
    goal: 'Mencocokkan baris mutasi rekening koran bank (file CSV/mutasi m-banking) dengan catatan penerimaan kas di sistem ERP.',
    prerequisites: 'Ekspor mutasi rekening koran dari bank bersangkutan.',
    steps: [
      'Pilih akun bank dan periode bulan rekonsiliasi.',
      'Unggah atau tempel baris mutasi rekening koran bank.',
      'Klik Cocokkan Otomatis (Auto-Match); sistem akan memadankan nominal dan tanggal yang bersesuaian dalam rentang ±5 hari.',
      'Untuk transaksi biaya administrasi atau bunga bank, klik Buat Jurnal Penyesuaian langsung dari baris mutasi.'
    ],
    impact: 'Menjamin saldo kas/bank di neraca ERP persis sama dengan saldo riil di buku bank.',
    troubleshooting: [
      'Mutasi tidak cocok: Periksa apakah ada transaksi transfer pelanggan yang belum diinput oleh kasir atau salah memilih rekening tujuan.'
    ]
  },
  {
    path: '/reports',
    title: 'Laporan BI & Analisis Eksekutif',
    category: 'Laporan',
    roles: ['direktur', 'super_admin', 'finance', 'auditor'],
    goal: 'Laporan Laba Rugi, Neraca Keuangan, Arus Kas, Tren Penjualan per Pelanggan, dan Analisis Performa Cabang.',
    prerequisites: 'Transaksi operasional dan jurnal yang telah diposting.',
    steps: [
      'Pilih jenis laporan finansial yang ingin ditampilkan pada tab navigasi atas.',
      'Tentukan rentang tanggal laporan dan bandingkan dengan periode sebelumnya.',
      'Gunakan tombol Cetak / Unduh Excel untuk keperluan rapat pemegang saham atau audit eksternal.'
    ],
    impact: 'Analisis laporan performa; tidak merubah data.',
    troubleshooting: [
      'Laba rugi tidak mencerminkan biaya gaji: Pastikan modul Payroll telah menjalankan fungsi "Posting Jurnal".'
    ]
  },
  {
    path: '/reports/inventory',
    title: 'Laporan Valuasi Persediaan & Margin',
    category: 'Laporan',
    roles: ['finance', 'gudang', 'auditor', 'admin', 'direktur'],
    goal: 'Melihat nilai rupiah total persediaan di seluruh gudang (Kuantitas x HPP rata-rata) serta margin keuntungan kotor per produk material.',
    prerequisites: 'Mutasi persediaan aktif.',
    steps: [
      'Pilih tab Valuasi Persediaan untuk melihat nominal rupiah aset stok yang tertimbun di gudang.',
      'Periksa tab Margin Produk untuk menganalisis material dengan persentase laba kotor tertinggi maupun produk yang dijual mendekati HPP.',
      'Gunakan tombol Ekspor CSV untuk mengunduh rekap stok opname berkala.'
    ],
    impact: 'Penyajian angka valuasi persediaan di neraca lajur.',
    troubleshooting: [
      'HPP rata-rata tampak ganjil: Periksa kartu stok barang; pastikan tidak ada input stok masuk dengan nilai harga beli Rp 0.'
    ]
  },
  {
    path: '/budgets',
    title: 'Anggaran & Estimasi Arus Kas',
    category: 'Keuangan',
    roles: ['finance', 'admin', 'direktur'],
    goal: 'Menetapkan anggaran biaya operasional per departemen (BBM, pemeliharaan armada, promosi) dan memonitor realisasi belanja aktual.',
    prerequisites: 'Rencana anggaran kerja tahunan perusahaan.',
    steps: [
      'Klik Tambah Anggaran, tentukan akun beban COA, periode tahunan/bulanan, dan nominal pagu anggaran.',
      'Sistem secara real-time membandingkan pengeluaran riil di buku besar dengan pagu.',
      'Jika pengeluaran melebihi 90% pagu, indikator berubah menjadi peringatan AMBER/RED.'
    ],
    impact: 'Pengendalian biaya preventif.',
    troubleshooting: [
      'Realisasi melebihi 100%: Pengeluaran melampaui batas anggaran; butuh persetujuan khusus Direktur untuk pencairan berikutnya.'
    ]
  },
  {
    path: '/assets',
    title: 'Aset Tetap & Penyusutan Bulanan',
    category: 'Keuangan',
    roles: ['finance', 'admin', 'direktur'],
    goal: 'Mencatat aset tetap perusahaan (Tanah, Bangunan Kantor, Truk Armada, Forklift Gudang, Komputer) dan menjalankan beban depresiasi otomatis setiap bulan.',
    prerequisites: 'Data perolehan aset dan taksiran umur ekonomis aset.',
    steps: [
      'Klik Tambah Aset Tetap, masukkan nama aset, tanggal beli, harga perolehan, nilai residu, dan estimasi umur ekonomis (tahun).',
      'Setiap akhir bulan, klik tombol "Penyusutan Bulan Ini". Sistem secara otomatis menghitung nilai depresiasi garis lurus.',
      'Sistem langsung membentuk ayat jurnal penyusutan: Dr Beban Penyusutan (6-2000) / Cr Akumulasi Penyusutan (1-3000).'
    ],
    impact: 'Mengurangi nilai buku aset tetap dan membebankan depresiasi ke laporan laba-rugi secara konsisten.',
    troubleshooting: [
      'Penyusutan tidak bertambah: Aset yang telah mencapai batas umur ekonomis atau nilai residu tidak akan disusutkan lagi.'
    ]
  },
  {
    path: '/hr',
    title: 'SDM, Karyawan & Payroll',
    category: 'HRD',
    roles: ['hr', 'finance', 'admin', 'direktur'],
    goal: 'Pengelolaan data induk staf, rekap kehadiran, lembur, dan pembuatan slip gaji bulanan serta posting jurnal beban gaji otomatis.',
    prerequisites: 'Data karyawan dan konfigurasi komponen gaji pokok & tunjangan.',
    steps: [
      'Kelola master karyawan: biodata, jabatan, departemen, gaji pokok, dan akun login.',
      'Pantau rekap absensi harian dan rekap keterlambatan.',
      'Buka tab Payroll, pilih periode bulan penggajian, lalu klik Generate Gaji Periode.',
      'Periksa komponen lembur, potongan keterlambatan, BPJS Ketenagakerjaan, dan PPh 21.',
      'Klik "Posting Jurnal" untuk mendebit Beban Gaji (6-1000) dan mengkredit Hutang Gaji/Pph/BPJS ke buku besar.'
    ],
    impact: 'Membentuk beban operasional gaji resmi dan kewajiban pembayaran transfer gaji karyawan.',
    troubleshooting: [
      'Jurnal payroll terposting ganda: Sistem memiliki pengaman idempoten; payroll pada periode yang sama otomatis dilewati bila sudah pernah diposting.'
    ]
  },
  {
    path: '/absen',
    title: 'Absensi Mandiri & Geofence GPS',
    category: 'HRD',
    roles: ['all'],
    goal: 'Mencatat kehadiran jam masuk dan jam pulang karyawan secara mandiri melalui smartphone dengan validasi radius lokasi GPS gudang/kantor.',
    prerequisites: 'Izin akses lokasi GPS (Geolokasi) diaktifkan pada browser ponsel.',
    steps: [
      'Buka halaman Absensi Mandiri saat tiba di lokasi kerja PT Sumber Material Jaya.',
      'Pastikan titik GPS Anda berada dalam radius aman area kerja (geofence).',
      'Klik tombol "Absen Masuk" saat datang atau "Absen Pulang" saat selesai bertugas.',
      'Batas keterlambatan adalah pukul 08:00 WIB; keterlambatan tercatat otomatis pada rekap HR.'
    ],
    impact: 'Dasar perhitungan uang hadir, tunjangan makan, dan potongan denda keterlambatan pada modul Payroll.',
    troubleshooting: [
      'Peringatan "Di luar radius kantor": Pastikan sinyal GPS akurat dan Anda berada dalam radius yang ditentukan.'
    ]
  },
  {
    path: '/cuti',
    title: 'Pengajuan Cuti Karyawan',
    category: 'HRD',
    roles: ['all'],
    goal: 'Mengajukan permohonan cuti tahunan, cuti menikah, atau cuti keluarga secara mandiri dengan alur persetujuan atasan.',
    prerequisites: 'Sisa kuota hak cuti tahunan masih mencukupi.',
    steps: [
      'Klik Ajukan Cuti, pilih jenis cuti dan rentang tanggal pelaksanaan.',
      'Tuliskan alasan pengajuan dan nama rekan kerja pengganti sementara.',
      'Klik Kirim Permohonan; notifikasi otomatis dikirimkan ke HRD dan Manager untuk approval.'
    ],
    impact: 'Memotong kuota cuti tahunan karyawan setelah disetujui.',
    troubleshooting: [
      'Pengajuan ditolak: Hubungi HRD untuk memeriksa sisa kuota hak cuti berjalan Anda.'
    ]
  },
  {
    path: '/izin',
    title: 'Pengajuan Izin & Sakit Mandiri',
    category: 'HRD',
    roles: ['all'],
    goal: 'Mencatat ketidakhadiran karena sakit, keperluan mendesak, atau tugas luar kantor.',
    prerequisites: 'Surat keterangan dokter (SKD) atau surat tugas tertulis.',
    steps: [
      'Pilih jenis izin (Sakit dengan Surat Dokter, Izin Kepentingan Pribadi, atau Dinas Luar).',
      'Pilih tanggal izin dan unggah foto bukti surat dokter/keterangan.',
      'Kirim pengajuan untuk diverifikasi oleh bagian HRD.'
    ],
    impact: 'Mencegah pemotongan kehadiran sepihak (alpa) pada rekapitulasi absensi bulanan.',
    troubleshooting: [
      'Surat dokter wajib diunggah: Lampiran foto surat dokter menjadi syarat verifikasi izin sakit.'
    ]
  },
  {
    path: '/master/products',
    title: 'Master Data Produk & Material',
    category: 'Master',
    roles: ['gudang', 'purchasing', 'sales', 'admin', 'direktur'],
    goal: 'Mengelola katalog produk material bangunan: Kode SKU, Barcode, Nama Produk, Kategori, Satuan (Zak/Batang/Truk/M3), Harga Beli Acuan, dan Harga Jual Retail.',
    prerequisites: 'Standar penomoran SKU barang perusahaan.',
    steps: [
      'Klik Tambah Produk Baru.',
      'Isi kode SKU unik, barcode pabrik, nama material, dan pilih kategori (Semen, Besi, Bata, Pasir, Cat, Alat).',
      'Tentukan satuan utama dan satuan konversi (contoh: 1 Truk = 8 M3).',
      'Atur batas stok minimum (safety stock) agar sistem dapat memberikan peringatan dini saat persediaan menipis.',
      'Simpan data produk; produk langsung tersedia di kasir POS dan Sales Order.'
    ],
    impact: 'Master data acuan seluruh transaksi penjualan, persediaan, dan pembelian.',
    troubleshooting: [
      'SKU duplikat: Setiap produk wajib memiliki kode SKU yang unik dan belum pernah digunakan produk lain.'
    ]
  },
  {
    path: '/master/customers',
    title: 'Master Data Pelanggan & Rekanan',
    category: 'Master',
    roles: ['sales', 'finance', 'admin', 'direktur'],
    goal: 'Mencatat profil pelanggan toko retail, toko bangunan rekanan, pemborong, kontraktor proyek, nomor NPWP, dan batas plafon piutang.',
    prerequisites: 'Identitas pelanggan atau data NPWP perusahaan rekanan.',
    steps: [
      'Klik Tambah Pelanggan.',
      'Masukkan Nama Pelanggan, Nomor HP/WhatsApp, Alamat Pengiriman, dan NPWP untuk keperluan faktur pajak.',
      'Tentukan batas plafon kredit (Credit Limit) dan jangka waktu pembayaran (TOP - Term of Payment, contoh: 14 hari).',
      'Simpan; pelanggan dapat langsung dipilih pada transaksi kasir POS maupun Sales Order.'
    ],
    impact: 'Dasar pengendalian risiko piutang penjualan.',
    troubleshooting: [
      'Sales tidak bisa memberikan tempo: Periksa apakah plafon kredit pelanggan bernilai 0 (khusus pelanggan tunai).'
    ]
  },
  {
    path: '/master/suppliers',
    title: 'Master Data Supplier & Vendor Pabrik',
    category: 'Master',
    roles: ['purchasing', 'finance', 'admin', 'direktur'],
    goal: 'Mencatat produsen semen, pabrik baja tulangan, penambang pasir, nomor rekening bank pembayaran, dan NPWP vendor.',
    prerequisites: 'Data legalitas supplier dan rekening penampung.',
    steps: [
      'Klik Tambah Supplier, isi nama badan usaha, narahubung sales, nomor telepon, dan NPWP.',
      'Cantumkan nomor rekening bank resmi untuk keperluan transfer pelunasan hutang oleh bagian Finance.',
      'Tentukan termin pembayaran standar yang diberikan oleh supplier (contoh: 30 hari).'
    ],
    impact: 'Acuan pembuatan Purchase Order dan pembayaran hutang dagang (AP).',
    troubleshooting: [
      'Rekening salah saat bayar hutang: Selalu pastikan nomor rekening supplier telah diverifikasi sebelum Finance melakukan transfer.'
    ]
  },
  {
    path: '/approvals',
    title: 'Pusat Persetujuan Dokumen (Approval Matrix)',
    category: 'Sistem',
    roles: ['direktur', 'super_admin', 'finance', 'manager'],
    goal: 'Memeriksa dan memutuskan pengajuan yang membutuhkan otorisasi pimpinan (Diskon Penjualan, PO Besar, Cuti, Stock Opname).',
    prerequisites: 'Terdapat dokumen yang diajukan staf bawahan.',
    steps: [
      'Buka tab dokumen yang perlu tindakan (Diskon SO, PO Pembelian, Cuti, atau Opname).',
      'Periksa rincian alasan pengajuan dan batas toleransi ambang batas.',
      'Klik Setujui (Approve) untuk meloloskan transaksi atau Tolak (Reject) disertai catatan alasan penolakan.'
    ],
    impact: 'Mengubah status dokumen menjadi APPROVED dan membuka kunci alur operasional selanjutnya.',
    troubleshooting: [
      'Pengajuan tidak muncul: Pastikan role akun Anda terdaftar sebagai approver sah dalam matriks wewenang.'
    ]
  },
  {
    path: '/approval-rules',
    title: 'Matriks & Aturan Ambang Batas Approval',
    category: 'Sistem',
    roles: ['direktur', 'super_admin'],
    goal: 'Mengatur batas nominal transaksi atau persentase diskon yang secara otomatis memicu antrian approval pimpinan.',
    prerequisites: 'Kebijakan tata kelola internal PT Sumber Material Jaya.',
    steps: [
      'Sesuaikan ambang batas Diskon SO (contoh: diskon > 5% wajib approval).',
      'Sesuaikan ambang batas Nilai PO Pembelian (contoh: pengadaan > Rp 50.000.000 wajib approval Direktur).',
      'Tentukan role jabatan yang menjadi approver penerima tugas.'
    ],
    impact: 'Menjaga kepatuhan tata kelola transaksi (governance).',
    troubleshooting: [
      'Seluruh pesanan masuk approval: Periksa nilai ambang batas; jika disetel 0%, seluruh pesanan akan wajib approval.'
    ]
  },
  {
    path: '/notify',
    title: 'Pusat Notifikasi & WhatsApp Gateway',
    category: 'Sistem',
    roles: ['admin', 'finance', 'logistik', 'direktur'],
    goal: 'Mengirimkan pesan otomatis ke pelanggan (Pengingat Jatuh Tempo Piutang, Status Kirim Pesanan, Slip Gaji) via WhatsApp dan Email.',
    prerequisites: 'Konfigurasi WA Gateway atau SMTP server pada berkas environment.',
    steps: [
      'Lihat antrian pesan keluar pada tab Antrian Pesan.',
      'Klik Kirim Sekarang atau gunakan fungsi Kirim Massal antrian.',
      'Buka tab Template Pesan untuk menyunting kalimat pesan dengan variabel dinamis: {{customer}}, {{invoice}}, {{amount}}.'
    ],
    impact: 'Otomatisasi pengingat operasional dan penagihan pelanggan.',
    troubleshooting: [
      'Pesan tertahan di status QUEUED: Periksa apakah koneksi gateway WhatsApp aktif atau cek indikator banner konsol mode.'
    ]
  },
  {
    path: '/audit',
    title: 'Audit Trail & Rekam Jejak Sistem',
    category: 'Sistem',
    roles: ['auditor', 'super_admin', 'direktur'],
    goal: 'Menelusuri seluruh riwayat aktivitas pengguna: siapa melakukan perubahan apa, pada data apa, jam berapa, dan dari alamat IP mana.',
    prerequisites: 'Hak akses tingkat auditor eksekutif.',
    steps: [
      'Filter log audit berdasarkan username staf, modul entitas (INVOICE, STOCK, JOURNAL), atau rentang tanggal.',
      'Klik ikon inspeksi pada baris log untuk membandingkan data sebelum vs sesudah perubahan (diff change).'
    ],
    impact: 'Pengawasan kepatuhan dan pencegahan kecurangan (fraud prevention). Data log bersifat append-only.',
    troubleshooting: [
      'Log tidak dapat dihapus: Sesuai regulasi audit forensik, catatan audit log tidak dapat dihapus oleh siapapun.'
    ]
  },
  {
    path: '/settings',
    title: 'Pengaturan Profil Perusahaan & Sistem',
    category: 'Sistem',
    roles: ['super_admin', 'direktur'],
    goal: 'Mengatur identitas perusahaan (PT Sumber Material Jaya), logo resmi faktur, alamat gudang utama, nomor kontak, dan parameter pajak.',
    prerequisites: 'Hak akses Super Admin.',
    steps: [
      'Perbarui nama perusahaan, alamat kantor pusat, nomor telepon, dan NPWP perusahaan.',
      'Unggah file logo resmi untuk dicetak pada kop surat invoice dan surat jalan.',
      'Atur tarif pajak standar PPN (11%) dan akun default buku besar.'
    ],
    impact: 'Menentukan identitas cetak kop dokumen dan parameter perhitungan pajak sistem.',
    troubleshooting: [
      'Logo tidak tampil di cetak faktur: Gunakan format gambar PNG/JPG dengan rasio proporsional dan ukuran di bawah 2 MB.'
    ]
  },
  {
    path: '/errors',
    title: 'Monitoring Log Error & Kendala Sistem',
    category: 'Sistem',
    roles: ['super_admin'],
    goal: 'Mendeteksi kendala koneksi database, pengecualian query, atau error runtime aplikasi untuk pemeliharaan teknis cepat.',
    prerequisites: 'Akses teknis administrator sistem.',
    steps: [
      'Periksa daftar stacktrace kendala sistem terbaru.',
      'Klik baris error untuk melihat parameter payload request dan query yang memicu kendala.',
      'Gunakan tombol "Bersihkan Log" setelah perbaikan dilakukan.'
    ],
    impact: 'Diagnostik keandalan infrastruktur aplikasi.',
    troubleshooting: [
      'Error database connection: Periksa kestabilan server container PostgreSQL dan koneksi socket jaringan.'
    ]
  },
  {
    path: '/pos/receipt/:id',
    title: 'Struk Belanja Thermal 80mm',
    category: 'Penjualan',
    roles: ['kasir', 'sales', 'admin'],
    goal: 'Tampilan cetak struk belanja kompak format thermal printer 80mm (ESC/POS) siap cetak tanpa dialog konfigurasi berbelit.',
    prerequisites: 'Transaksi kasir POS yang telah tersimpan.',
    steps: [
      'Buka dari Riwayat Order atau otomatis terbuka setelah checkout POS selesai.',
      'Tekan Ctrl+P atau klik Cetak Struk.',
      'Pilih printer thermal (80mm) untuk mencetak struk belanja kasir.'
    ],
    impact: 'Bukti fisik pembelian langsung di counter bagi pelanggan retail.',
    troubleshooting: [
      'Ukuran kertas terpotong: Pastikan pada setelan printer browser telah memilih margin "None" dan ukuran kertas "80mm / Roll".'
    ]
  },
  {
    path: '/lacak/:token',
    title: 'Lacak Status Pesanan Publik',
    category: 'Penjualan',
    roles: ['public'],
    goal: 'Halaman publik yang dapat dibuka pelanggan tanpa login untuk memantau status pesanan, pengiriman armada, dan sisa tagihan.',
    prerequisites: 'Tautan lacak ber-token yang dibagikan oleh sales dari halaman Detail SO.',
    steps: [
      'Sales membuka Detail SO dan mengklik tombol "Bagikan Link Lacak".',
      'Kirimkan tautan URL acak 32 karakter tersebut ke WhatsApp pelanggan.',
      'Pelanggan membuka tautan di browser hp mereka untuk melihat linimasa pesanan real-time tanpa dapat melihat rahasia HPP perusahaan.'
    ],
    impact: 'Meningkatkan kepuasan pelanggan dan transparansi armada tanpa membuka celah data internal.',
    troubleshooting: [
      'Tautan kedaluwarsa/tidak ditemukan: Minta sales untuk menyalin ulang tautan aktif dari halaman detail pesanan.'
    ]
  },
  {
    path: '/panduan',
    title: 'Buku Panduan & Dokumentasi Lengkap',
    category: 'Utama',
    roles: ['all'],
    goal: 'Manual operasional terpadu seluruh fitur ERP PT Sumber Material Jaya, alur kerja peran staf, dan panduan troubleshooting lengkap.',
    prerequisites: 'Dapat diakses oleh seluruh pengguna maupun publik.',
    steps: [
      'Gunakan kolom pencarian untuk mengetik nama modul, fungsi, atau kendala yang dihadapi.',
      'Filter berdasarkan Peran Pekerjaan (Kasir, Sales, Gudang, Driver, Purchasing, Finance, HRD, Direktur).',
      'Klik Cetak Panduan untuk mencetak panduan standar operasional prosedur (SOP) fisik bagi staf baru.'
    ],
    impact: 'Pusat pengetahuan dan transfer keahlian operasional tim.',
    troubleshooting: [
      'Halaman yang dicari tidak muncul: Coba gunakan kata kunci umum dalam bahasa Indonesia seperti "faktur", "stok", "opname", atau "struk".'
    ]
  }
];

export function getGuideForRoute(pathname) {
  if (!pathname) return null;
  // Exact match first
  let match = GUIDEBOOK_ROUTES.find(r => r.path === pathname);
  if (match) return match;

  // Prefix match for dynamic routes (e.g. /sales/orders/detail/123 -> /sales/orders/detail/:id or /sales/orders)
  if (pathname.startsWith('/sales/orders/detail/')) {
    return GUIDEBOOK_ROUTES.find(r => r.path === '/sales/orders/detail/:id') || GUIDEBOOK_ROUTES.find(r => r.path === '/sales/orders');
  }
  if (pathname.startsWith('/surat-jalan/')) {
    return GUIDEBOOK_ROUTES.find(r => r.path === '/surat-jalan/:id') || GUIDEBOOK_ROUTES.find(r => r.path === '/surat-jalan');
  }
  if (pathname.startsWith('/pos/receipt/')) {
    return GUIDEBOOK_ROUTES.find(r => r.path === '/pos/receipt/:id');
  }
  if (pathname.startsWith('/lacak/')) {
    return GUIDEBOOK_ROUTES.find(r => r.path === '/lacak/:token');
  }

  // General longest prefix match
  const candidates = GUIDEBOOK_ROUTES.filter(r => r.path !== '/' && pathname.startsWith(r.path));
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.path.length - a.path.length);
    return candidates[0];
  }

  return GUIDEBOOK_ROUTES.find(r => r.path === '/');
}
