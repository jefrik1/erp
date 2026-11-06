/**
 * OpenAPI 3.0 Specification and Documentation Server
 * Menghadirkan dokumentasi interaktif Swagger UI pada /api/docs dan OpenAPI JSON pada /api/docs/spec.json.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BuildERP — Material & Enterprise API',
    version: '1.0.0',
    description: 'Dokumentasi REST API Sistem Enterprise Resource Planning (ERP) Bahan Bangunan & Material.',
    contact: {
      name: 'ERP Engineering Team',
    },
  },
  servers: [
    { url: '/api', description: 'API Server' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Masukkan JWT token: Bearer <token>',
      },
    },
  },
  security: [
    { BearerAuth: [] },
  ],
  tags: [
    { name: 'Auth', description: 'Autentikasi, login, session, dan MFA' },
    { name: 'Master', description: 'Data master produk, pelanggan, dan supplier' },
    { name: 'Sales', description: 'Sales Order, Invoice penjualan, dan riwayat pesanan' },
    { name: 'POS', description: 'Point of Sale (Kasir, Shift, Transaksi, Supervisor, Manager)' },
    { name: 'Purchase', description: 'Purchase Request, RFQ, PO, GRN penerimaan, dan 3-Way Matching' },
    { name: 'Inventory', description: 'Stok gudang, mutasi, kartu stok, transfer, dan stok opname' },
    { name: 'Finance', description: 'Bagan akun COA, jurnal umum, tutup buku, dan rekonsiliasi' },
    { name: 'Logistics', description: 'Surat jalan, armada, timbangan jembatan timbang, dan POD' },
    { name: 'HR', description: 'Karyawan, absensi geofence, cuti, izin, dan payroll PPh21/BPJS' },
    { name: 'Reporting', description: 'Neraca, Laba Rugi, Trial Balance, margin, dan ekspor data' },
    { name: 'Monitoring', description: 'Health check, metrik sistem, dan Prometheus exporter' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Monitoring'],
        summary: 'Pemeriksaan Kesehatan Layanan (Health Check)',
        description: 'Memeriksa kesiapan database PostgreSQL dan Redis cache.',
        responses: {
          200: { description: 'Layanan beroperasi normal' },
          503: { description: 'Database tidak dapat dihubungi' },
        },
      },
    },
    '/metrics/prometheus': {
      get: {
        tags: ['Monitoring'],
        summary: 'Metrik Prometheus',
        description: 'Scraping metrics untuk Prometheus server dan Grafana dashboard.',
        responses: {
          200: { description: 'Format teks metrik Prometheus standard' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login Akun Pengguna',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'admin123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login berhasil, token JWT diterbitkan' },
          401: { description: 'Kredensial salah atau akun terkunci' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Informasi Sesi Pengguna Aktif',
        responses: {
          200: { description: 'Payload identitas user login' },
          401: { description: 'Token tidak valid' },
        },
      },
    },
    '/reports/trial-balance': {
      get: {
        tags: ['Reporting'],
        summary: 'Laporan Neraca Saldo (Trial Balance)',
        parameters: [
          { name: 'start', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'end', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Data neraca saldo per akun dan total debit/kredit' },
        },
      },
    },
    '/reports/balance-sheet': {
      get: {
        tags: ['Reporting'],
        summary: 'Laporan Neraca Keuangan (Balance Sheet)',
        parameters: [
          { name: 'as_of', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Aktiva, Kewajiban, Ekuitas, dan Laba Berjalan' },
        },
      },
    },
    '/reports/profit-loss': {
      get: {
        tags: ['Reporting'],
        summary: 'Laporan Laba Rugi (Profit & Loss)',
        parameters: [
          { name: 'start', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'end', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Pendapatan, HPP, Laba Kotor, dan Laba Bersih' },
        },
      },
    },
    '/hr/payrolls/generate': {
      post: {
        tags: ['HR'],
        summary: 'Generate Penggajian Bulanan Otomatis (BPJS & PPh 21)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['period'],
                properties: {
                  period: { type: 'string', example: '2026-11' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Payroll berhasil digenerate' },
        },
      },
    },
    '/hr/payrolls/{id}/slip': {
      get: {
        tags: ['HR'],
        summary: 'Rincian Slip Gaji Karyawan',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Rincian slip gaji, pendapatan, potongan BPJS & PPh21' },
        },
      },
    },
    '/purchase/three-way': {
      get: {
        tags: ['Purchase'],
        summary: 'Status 3-Way Matching Pembelian (PO vs GRN vs Invoice)',
        responses: {
          200: { description: 'Daftar status pencocokan invoice pembelian' },
        },
      },
    },
  },
};

export function swaggerHtml() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>BuildERP — Dokumentasi REST API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5/favicon-32x32.png" />
  <style>
    body { margin: 0; background: #fafafa; font-family: sans-serif; }
    .topbar { display: none; }
    .swagger-ui .info { margin: 24px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/spec.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}
