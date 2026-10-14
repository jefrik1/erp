// PART: FILE lib/data.ts — Seed / Mock DB — lihat DOKUMENTASI.md §3.2
// Berisi warehouses, bins, suppliers, products (10 SKU), customers (5), ledger, SO/PO/DO/INV + calcStock
import type { Product, Customer, Warehouse, Bin, LedgerEntry, SalesOrder, DeliveryOrder, Invoice, Supplier, PurchaseOrder } from "./types"
// PART: Gudang — hanya GUD-01 aktif
export const warehouses: Warehouse[] = [
  { id:"wh1", code:"GUD-01", name:"Gudang Pusat Cibitung", address:"Jl. Industri No.88 Cibitung — SATU-SATUNYA GUDANG AKTIF" },
]
// PART: Bin/Rak — 6 lokasi di GUD-01
export const bins: Bin[] = [
  { id:"b1", warehouseId:"wh1", code:"RAK-A1-SEM" },
  { id:"b2", warehouseId:"wh1", code:"RAK-A2-CAT" },
  { id:"b3", warehouseId:"wh1", code:"AREA-PASIR-02" },
  { id:"b4", warehouseId:"wh1", code:"RAK-C4-BESI" },
  { id:"b5", warehouseId:"wh1", code:"RAK-C5-HOLLOW" },
  { id:"b6", warehouseId:"wh1", code:"RAK-C6-WF" },
]
// PART: Supplier — 3 pemasok baja
export const suppliers: Supplier[] = [
  { id:"s1", code:"SUP-001", name:"PT Krakatau Steel Distribusi", phone:"021 522 1122", address:"Cilegon, Banten" },
  { id:"s2", code:"SUP-002", name:"PT Gunung Garuda", phone:"021 890 3344", address:"Bekasi, Jabar" },
  { id:"s3", code:"SUP-003", name:"CV Baja Mandiri", phone:"0812 9900 1122", address:"Cibitung" },
]
// PART: Produk — 10 SKU baja/semen/pasir/atap/cat/bata + units & prices per Tier
export const products: Product[] = [
  { id:"p1", sku:"SEM-3R-50", name:"Semen Tiga Roda 50kg", category:"Semen", isDimension:false, minStock:100, buyPrice:58500,
    units:[
      { id:"u1", name:"Zak", factor:1, isBase:true, barcode:"899123400001" },
      { id:"u2", name:"Palet", factor:40, isBase:false, barcode:"899123400002" },
      { id:"u3", name:"Ton", factor:20, isBase:false },
    ],
    prices:[
      { unitId:"u1", tier:"Retail", price:65500 },
      { unitId:"u1", tier:"Tukang", price:63500 },
      { unitId:"u1", tier:"Reseller", price:61500 },
      { unitId:"u2", tier:"Proyek", price:2460000 },
    ]},
  { id:"p2", sku:"PASIR-COR-M3", name:"Pasir Cor Ayak (per m3)", category:"Agregat", isDimension:false, minStock:50, buyPrice:310000,
    units:[{ id:"u4", name:"M3", factor:1, isBase:true },{ id:"u5", name:"Truk", factor:7, isBase:false }],
    prices:[{ unitId:"u4", tier:"Retail", price:385000 },{ unitId:"u4", tier:"Proyek", price:345000 }]},
  { id:"p3", sku:"BESI-12-SNI", name:"Besi Beton Ulir 12mm SNI - 12m/lonjor", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:200, buyPrice:5958,
    units:[
      { id:"u6", name:"Lonjor", factor:12, isBase:false },
      { id:"u6m", name:"Meter", factor:1, isBase:true },
      { id:"u7", name:"Kg", factor:0.888, isBase:false },
      { id:"u8", name:"Ton", factor:1124, isBase:false },
    ],
    prices:[
      { unitId:"u6", tier:"Retail", price:78500 },
      { unitId:"u6m", tier:"Retail", price:6542 },
      { unitId:"u6", tier:"Tukang", price:76500 },
      { unitId:"u6m", tier:"Tukang", price:6375 },
      { unitId:"u6", tier:"Reseller", price:73500 },
      { unitId:"u6m", tier:"Reseller", price:6125 },
      { unitId:"u6", tier:"Proyek", price:74500 },
    ]},
  { id:"p3b", sku:"BESI-10-SNI", name:"Besi Beton Polos 10mm SNI - 12m/lonjor", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:200, buyPrice:4500,
    units:[
      { id:"u6b", name:"Lonjor", factor:12, isBase:false },
      { id:"u6bm", name:"Meter", factor:1, isBase:true },
      { id:"u7b", name:"Kg", factor:0.617, isBase:false },
    ],
    prices:[
      { unitId:"u6b", tier:"Retail", price:59500 },
      { unitId:"u6bm", tier:"Retail", price:4958 },
      { unitId:"u6b", tier:"Proyek", price:56500 },
    ]},
  { id:"p3c", sku:"HOLLOW-40-GALV", name:"Hollow Galvanis 40x40x1.2mm - 6m/batang", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:120, buyPrice:11417,
    units:[
      { id:"u15", name:"Batang", factor:6, isBase:false },
      { id:"u15m", name:"Meter", factor:1, isBase:true },
    ],
    prices:[
      { unitId:"u15", tier:"Retail", price:76500 },
      { unitId:"u15m", tier:"Retail", price:12750 },
      { unitId:"u15", tier:"Tukang", price:73500 },
      { unitId:"u15m", tier:"Tukang", price:12250 },
    ]},
  { id:"p3d", sku:"WF-150-STEEL", name:"Baja WF 150x75x5x7mm - 12m/batang", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:40, buyPrice:154167,
    units:[
      { id:"u16", name:"Batang", factor:12, isBase:false },
      { id:"u16m", name:"Meter", factor:1, isBase:true },
      { id:"u16kg", name:"Kg", factor:14, isBase:false },
    ],
    prices:[
      { unitId:"u16", tier:"Retail", price:2120000 },
      { unitId:"u16m", tier:"Retail", price:176667 },
      { unitId:"u16", tier:"Proyek", price:1980000 },
    ]},
  { id:"p3e", sku:"WRM-M8-21", name:"Wiremesh M8 2.1x5.4m - lembar", category:"Besi & Baja", isDimension:true, dimensionUnit:"m2", minStock:60, buyPrice:485000,
    units:[
      { id:"u17", name:"Lembar", factor:11.34, isBase:false },
      { id:"u17m", name:"M2", factor:1, isBase:true },
    ],
    prices:[
      { unitId:"u17", tier:"Retail", price:545000 },
      { unitId:"u17m", tier:"Retail", price:48057 },
      { unitId:"u17", tier:"Proyek", price:515000 },
    ]},
  { id:"p4", sku:"SENG-GEL-06", name:"Atap Seng Gelombang 0.30mm", category:"Atap", isDimension:true, dimensionUnit:"m2", minStock:80, buyPrice:48000,
    units:[{ id:"u9", name:"M2", factor:1, isBase:true },{ id:"u10", name:"Lembar", factor:1.8, isBase:false }],
    prices:[{ unitId:"u9", tier:"Retail", price:58000 },{ unitId:"u9", tier:"Proyek", price:52000 }]},
  { id:"p5", sku:"CAT-DLX-25", name:"Cat Dulux Weathershield 25kg", category:"Cat", isDimension:false, minStock:40, buyPrice:1280000,
    units:[{ id:"u11", name:"Pail", factor:1, isBase:true },{ id:"u12", name:"Kaleng", factor:0.2, isBase:false }],
    prices:[{ unitId:"u11", tier:"Retail", price:1420000 },{ unitId:"u11", tier:"Tukang", price:1350000 }]},
  { id:"p6", sku:"BATA-MRH-PCS", name:"Bata Merah Press Jumbo", category:"Bata", isDimension:false, minStock:5000, buyPrice:750,
    units:[{ id:"u13", name:"Pcs", factor:1, isBase:true },{ id:"u14", name:"Ribu", factor:1000, isBase:false }],
    prices:[{ unitId:"u13", tier:"Retail", price:950 },{ unitId:"u14", tier:"Proyek", price:880000 }]},
]

// PART: Pelanggan — 5 customer Retail/Proyek/Reseller/Tukang + creditLimit/balance/overdue
export const customers: Customer[] = [
  { id:"c1", code:"C-RET-001", name:"Budi Santoso (Retail)", type:"Retail", phone:"0812 3456 7890", npwp:"-", creditLimit:0, balance:0, terms:0, isBlocked:false, overdueDays:0 },
  { id:"c2", code:"C-KON-042", name:"CV Maju Jaya Konstruksi", type:"Proyek", phone:"0813 8888 1122", npwp:"01.234.567.8-009.000", creditLimit:150000000, balance:87500000, terms:30, isBlocked:false, overdueDays:0 },
  { id:"c3", code:"C-RES-019", name:"TB Sumber Rejeki", type:"Reseller", phone:"0821 7777 3344", npwp:"02.111.222.3-009.000", creditLimit:75000000, balance:72000000, terms:14, isBlocked:false, overdueDays:9 },
  { id:"c4", code:"C-TUK-007", name:"Mandor Jajang", type:"Tukang", phone:"0856 9999 0011", npwp:"-", creditLimit:25000000, balance:5000000, terms:7, isBlocked:false, overdueDays:0 },
  { id:"c5", code:"C-PRO-088", name:"PT Griya Indah Proyek", type:"Proyek", phone:"0811 2222 9900", npwp:"03.999.888.7-009.000", creditLimit:300000000, balance:142000000, terms:45, isBlocked:true, blockedReason:"Overdue 12 hari - 2 faktur", overdueDays:12 },
]
// PART: Ledger Stok — jurnal PO(+) / SO(-), sumber calcStock()
export const ledger: LedgerEntry[] = [
  { id:"l1", productId:"p1", unitId:"u1", warehouseId:"wh1", binId:"b1", qty:2400, refType:"PO", refId:"PO-001", createdAt:"2026-09-10" },
  { id:"l2", productId:"p2", unitId:"u4", warehouseId:"wh1", binId:"b3", qty:84, refType:"PO", refId:"PO-002", createdAt:"2026-09-11" },
  { id:"l3", productId:"p3", unitId:"u6m", warehouseId:"wh1", binId:"b4", qty:2400, refType:"PO", refId:"PO-003", createdAt:"2026-09-12" },
  { id:"l4", productId:"p1", unitId:"u1", warehouseId:"wh1", binId:"b1", qty:-180, refType:"SO", refId:"SO-2409-011", createdAt:"2026-09-14" },
  { id:"l5", productId:"p3c", unitId:"u15m", warehouseId:"wh1", binId:"b5", qty:420, refType:"PO", refId:"PO-004", createdAt:"2026-09-13" },
]
// PART: Sales Orders — 2 SO (Approved/Draft)
export const salesOrders: SalesOrder[] = [
  { id:"so1", soNumber:"SO-2409-011", customerId:"c2", salesperson:"Sinta", date:"2026-09-14", status:"Approved", items:[{ productId:"p1", unitId:"u1", qty:180, price:63500, subtotal:11430000 },{ productId:"p3", unitId:"u6", qty:10, price:78500, subtotal:785000 }], total:12215000 },
  { id:"so2", soNumber:"SO-2409-012", customerId:"c3", salesperson:"Riko", date:"2026-09-15", status:"Draft", items:[{ productId:"p2", unitId:"u4", qty:7, price:345000, subtotal:2415000 }], total:2415000 },
]
// PART: Purchase Orders — 2 PO (Received/Ordered)
export const purchaseOrders: PurchaseOrder[] = [
  { id:"po1", poNumber:"PO-2026-001", supplierId:"s1", date:"2026-09-12", status:"Received", items:[{ productId:"p3", unitId:"u6", qty:200, price:71500, subtotal:14300000 }], total:14300000, warehouseId:"wh1" },
  { id:"po2", poNumber:"PO-2026-002", supplierId:"s2", date:"2026-09-14", status:"Ordered", items:[{ productId:"p3c", unitId:"u15", qty:80, price:68500, subtotal:5480000 }], total:5480000, warehouseId:"wh1" },
]
// PART: Delivery Orders — 2 DO (In Transit/Scheduled) + tare/gross/netto
export const deliveryOrders: DeliveryOrder[] = [
  { id:"do1", doNumber:"DO-2409-011", soId:"so1", driver:"Pak Warto", vehicle:"B 9123 UY", status:"In Transit", tare:8450, gross:14200, netto:5750 },
  { id:"do2", doNumber:"DO-2409-012", soId:"so2", driver:"-", vehicle:"-", status:"Scheduled" },
]
// PART: Invoices — 2 faktur Unpaid/Overdue + DPP/PPN
export const invoices: Invoice[] = [
  { id:"inv1", invNumber:"INV-2409-011", soId:"so1", customerId:"c2", dpp:12215000, dppLain:11197083, ppn:1343649, total:13558649, status:"Unpaid", dueDate:"2026-10-14" },
  { id:"inv2", invNumber:"INV-2409-008", soId:"so1", customerId:"c3", dpp:45000000, dppLain:41250000, ppn:4950000, total:49950000, status:"Overdue", dueDate:"2026-09-02" },
]
// PART: calcStock — hitung stok basis: sum ledger qty per productId
export function calcStock(productId:string){
  return ledger.filter(l=>l.productId===productId).reduce((s,l)=>s+l.qty,0)
}
// PART: getAutoPrice — cari harga per unitId+tier (fallback)
export function getAutoPrice(product: Product, unitId: string, tier: string): number {
  const exact = product.prices.find(p=> p.unitId===unitId && p.tier===tier)
  if (exact) return exact.price
  const anyTier = product.prices.find(p=> p.unitId===unitId)
  if (anyTier) return anyTier.price
  if (product.prices[0]) return product.prices[0].price
  return product.buyPrice
}
// PART: calcMeterPrice — hitung harga per Meter/M2 × qty
export function calcMeterPrice(product: Product, tier: string, qtyMeter: number){
  const meterUnit = product.units.find(u=> u.name==="Meter" || u.name==="M2")
  const pricePerMeter = meterUnit ? getAutoPrice(product, meterUnit.id, tier) : product.prices[0]?.price ?? product.buyPrice
  return { pricePerMeter, subtotal: Math.round(pricePerMeter * qtyMeter) }
}
