// PART: FILE lib/types.ts — Domain Types — Tier, Product, Customer, SO/PO/DO/Invoice — lihat DOKUMENTASI.md §3.3
export type Tier = "Retail" | "Tukang" | "Reseller" | "Proyek"
export type Unit = { id: string; name: string; factor: number; isBase: boolean; barcode?: string }
export type ProductPrice = { unitId: string; tier: Tier; price: number }
export type Product = {
  id: string; sku: string; name: string; category: string
  isDimension: boolean; dimensionUnit?: string; minStock: number; buyPrice: number
  units: Unit[]; prices: ProductPrice[]
}
export type Warehouse = { id: string; code: string; name: string; address: string }
export type Bin = { id: string; warehouseId: string; code: string }
export type LedgerEntry = {
  id: string; productId: string; unitId: string; warehouseId: string; binId: string
  qty: number; refType: string; refId: string; createdAt: string
}
export type Customer = {
  id: string; code: string; name: string; type: Tier; phone: string; npwp: string
  creditLimit: number; balance: number; terms: number; isBlocked: boolean; blockedReason?: string
  overdueDays: number
}
export type Supplier = { id:string; code:string; name:string; phone:string; address:string }
export type SOStatus = "Draft" | "Approved" | "Partial" | "Completed" | "Cancelled"
export type SOItem = { productId: string; unitId: string; qty: number; price: number; length?: number; width?: number; subtotal: number }
export type SalesOrder = {
  id: string; soNumber: string; customerId: string; salesperson: string
  date: string; status: SOStatus; items: SOItem[]; total: number
}
export type POStatus = "Draft" | "Ordered" | "Received" | "Cancelled"
export type POItem = { productId: string; unitId: string; qty: number; price: number; length?: number; subtotal: number }
export type PurchaseOrder = { id:string; poNumber:string; supplierId:string; date:string; status:POStatus; items: POItem[]; total:number; warehouseId?: string }
export type DOStatus = "Scheduled" | "Loading" | "In Transit" | "Delivered"
export type DeliveryOrder = {
  id: string; doNumber: string; soId: string; driver: string; vehicle: string
  status: DOStatus; tare?: number; gross?: number; netto?: number
  podUrl?: string
}
export type Invoice = {
  id: string; invNumber: string; soId: string; customerId: string
  dpp: number; dppLain: number; ppn: number; total: number; status: "Unpaid" | "Paid" | "Overdue"; dueDate: string
}
