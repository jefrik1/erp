// Lokasi operasional tunggal (single-location).
//
// Sumber nilai: pin peta yang SUDAH terkonfigurasi di aplikasi, yaitu konstanta
// ORIGIN pada src/components/AddressMapPicker.jsx (-6.8392646, 111.9838451) yang
// dipakai sebagai titik asal "Gudang Pusat" pada peta alamat pengiriman.
// Jangan mengarang koordinat baru: kalau pin peta berubah, ubah di sini juga
// (dan sebaliknya) supaya label UI dan peta menunjuk titik yang sama.
//
// UI tidak lagi memakai konsep multi-cabang. Kolom branch_id di database
// (users, employees, sales_orders, budgets, warehouses, ...) tetap disimpan
// sebagai foreign key dan riwayat bisnis - tidak dihapus dan tidak diubah UI.

export const LOCATION = Object.freeze({
  name: 'Gudang Pusat',
  lat: -6.8392646,
  lng: 111.9838451,
});

// Format tampilan: 6 desimal, pemisah koma (mis. "-6.839265, 111.983845").
export const LOCATION_COORDINATES =
  `${LOCATION.lat.toFixed(6)}, ${LOCATION.lng.toFixed(6)}`;

// Tautan eksternal ke peta (OpenStreetMap) untuk pin yang sama.
export const LOCATION_MAP_URL =
  `https://www.openstreetmap.org/?mlat=${LOCATION.lat}&mlon=${LOCATION.lng}#map=16/${LOCATION.lat}/${LOCATION.lng}`;
