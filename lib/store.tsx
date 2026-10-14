// PART: FILE lib/store.tsx — Global Store (Context) — single source of truth, lihat DOKUMENTASI.md §3.1
// Menyimpan active/q/products/customers/soList/doList/poList/invList + derived filtered*/blocked/lowStock + weigh/forms/modals
"use client"
import React, { createContext, useContext, useState, useMemo } from "react"
import type { Product, Customer, SalesOrder, DeliveryOrder, PurchaseOrder, Invoice } from "./types"
import type { NavKey } from "@/components/shell"
import { products as p0, customers as c0, warehouses as w0, bins as b0, ledger as l0, salesOrders as so0, deliveryOrders as do0, invoices as i0, suppliers as s0, purchaseOrders as po0, calcStock as calc0 } from "./data"
import { creditCheck } from "./engine"

// PART: RangeKey + RANGE_LABEL — rentang Dashboard 7HARI→YTD
type RangeKey = "7HARI"|"14HARI"|"30HARI"|"60HARI"|"90HARI"|"YTD"
const RANGE_LABEL: Record<RangeKey,string> = { "7HARI":"7 Hari","14HARI":"14 Hari","30HARI":"1 Bulan","60HARI":"2 Bulan","90HARI":"3 Bulan","YTD":"Year to Date" }

type Toast = string | null

// PART: Type Store — shape lengkap global state (navigasi, entity, UI, form, timbangan, modal, derived)
type Store = {
  active: NavKey; setActive: (v:NavKey)=>void
  q: string; setQ: (v:string)=>void
  products: Product[]; setProducts: React.Dispatch<React.SetStateAction<Product[]>>
  customers: Customer[]; setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>
  soList: SalesOrder[]; setSoList: React.Dispatch<React.SetStateAction<SalesOrder[]>>
  doList: DeliveryOrder[]; setDoList: React.Dispatch<React.SetStateAction<DeliveryOrder[]>>
  poList: PurchaseOrder[]; setPoList: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>
  invList: Invoice[]; setInvList: React.Dispatch<React.SetStateAction<Invoice[]>>
  ledger: typeof l0; warehouses: typeof w0; bins: typeof b0; suppliers: typeof s0; calcStock: typeof calc0
  range: RangeKey; setRange: (v:RangeKey)=>void; RANGE_LABEL: typeof RANGE_LABEL
  toast: Toast; showToast: (m:string)=>void
  custFilter: string; setCustFilter: (v:string)=>void
  prodCat: string; setProdCat: (v:string)=>void
  soStatus: string; setSoStatus: (v:string)=>void
  poStatus: string; setPoStatus: (v:string)=>void
  newSO: {customerId:string;productId:string;unitId:string;qty:string}; setNewSO: React.Dispatch<React.SetStateAction<{customerId:string;productId:string;unitId:string;qty:string}>>
  newPO: {supplierId:string;warehouseId:string;productId:string;unitId:string;qty:string}; setNewPO: React.Dispatch<React.SetStateAction<{supplierId:string;warehouseId:string;productId:string;unitId:string;qty:string}>>
  overrideOpen: boolean; setOverrideOpen: (v:boolean)=>void
  pin: string; setPin: (v:string)=>void
  weigh: {tare:number;gross:number}; setWeigh: React.Dispatch<React.SetStateAction<{tare:number;gross:number}>>
  reading: boolean; setReading: (v:boolean)=>void
  addProdOpen: boolean; setAddProdOpen: (v:boolean)=>void
  addCustOpen: boolean; setAddCustOpen: (v:boolean)=>void
  addCust: {name:string;phone:string;type:any;limit:string}; setAddCust: React.Dispatch<React.SetStateAction<{name:string;phone:string;type:any;limit:string}>>
  detailSO: SalesOrder|null; setDetailSO: (v:SalesOrder|null)=>void
  detailPO: PurchaseOrder|null; setDetailPO: (v:PurchaseOrder|null)=>void
  editProd: Product|null; setEditProd: (v:Product|null)=>void
  filteredProducts: Product[]; filteredCustomers: Customer[]; filteredSO: SalesOrder[]; filteredPO: PurchaseOrder[]
  blockedCustomers: Customer[]; lowStockCount: number; pendingPO: number; overdueInv: number
}

const Ctx = createContext<Store|null>(null)

// PART: StoreProvider — inisialisasi useState(p0/c0/so0/do0/po0/i0) + useMemo filtered*/blocked + weigh/forms
export function StoreProvider({children}:{children:React.ReactNode}){
  const [active,setActive]=useState<NavKey>("dashboard")
  const [q,setQ]=useState("")
  const [custFilter,setCustFilter]=useState("all")
  const [prodCat,setProdCat]=useState("all")
  const [soStatus,setSoStatus]=useState("all")
  const [poStatus,setPoStatus]=useState("all")
  const [products,setProducts]=useState<Product[]>(p0)
  const [customers,setCustomers]=useState<Customer[]>(c0)
  const [soList,setSoList]=useState<SalesOrder[]>(so0)
  const [doList,setDoList]=useState<DeliveryOrder[]>(do0)
  const [poList,setPoList]=useState<PurchaseOrder[]>(po0)
  const [invList,setInvList]=useState(i0)
  const ledger=l0; const warehouses=w0; const bins=b0; const suppliers=s0; const calcStock=calc0
  const [range,setRange]=useState<RangeKey>("7HARI")
  const [toast,setToast]=useState<Toast>(null)
  const showToast=(m:string)=>{ setToast(m); setTimeout(()=>setToast(null),2200)}
  const [newSO,setNewSO]=useState({customerId:"c2",productId:"p3",unitId:"u6m",qty:"12"})
  const [newPO,setNewPO]=useState({supplierId:"s1",warehouseId:"wh1",productId:"p3",unitId:"u6m",qty:"120"})
  const [overrideOpen,setOverrideOpen]=useState(false)
  const [pin,setPin]=useState("")
  const [weigh,setWeigh]=useState({tare:8450,gross:14200})
  const [reading,setReading]=useState(false)
  const [addProdOpen,setAddProdOpen]=useState(false)
  const [addCustOpen,setAddCustOpen]=useState(false)
  const [addCust,setAddCust]=useState({name:"",phone:"",type:"Retail" as any,limit:"0"})
  const [detailSO,setDetailSO]=useState<SalesOrder|null>(null)
  const [detailPO,setDetailPO]=useState<PurchaseOrder|null>(null)
  const [editProd,setEditProd]=useState<Product|null>(null)

  const filteredProducts=useMemo(()=> products.filter(p=> (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())) && (prodCat==="all" || p.category===prodCat)),[q,products,prodCat])
  const filteredCustomers=useMemo(()=> customers.filter(c=> (custFilter==="all" || c.type===custFilter) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()))),[q,customers,custFilter])
  const filteredSO=useMemo(()=> soList.filter(s=> (soStatus==="all" || s.status===soStatus) && (!q || s.soNumber.toLowerCase().includes(q.toLowerCase()))),[soList,q,soStatus])
  const filteredPO=useMemo(()=> poList.filter(p=> (poStatus==="all" || p.status===poStatus) && (!q || p.poNumber.toLowerCase().includes(q.toLowerCase()))),[poList,q,poStatus])
  const blockedCustomers=customers.filter(c=> creditCheck(c,0,0).blocked)
  const lowStockCount=products.filter(p=> calcStock(p.id) <= p.minStock).length
  const pendingPO=poList.filter(p=> p.status==="Ordered").length
  const overdueInv=invList.filter(i=> i.status==="Overdue").length

  return <Ctx.Provider value={{active,setActive,q,setQ,products,setProducts,customers,setCustomers,soList,setSoList,doList,setDoList,poList,setPoList,invList,setInvList,ledger,warehouses,bins,suppliers,calcStock,range,setRange,RANGE_LABEL,toast,showToast,custFilter,setCustFilter,prodCat,setProdCat,soStatus,setSoStatus,poStatus,setPoStatus,newSO,setNewSO,newPO,setNewPO,overrideOpen,setOverrideOpen,pin,setPin,weigh,setWeigh,reading,setReading,addProdOpen,setAddProdOpen,addCustOpen,setAddCustOpen,addCust,setAddCust,detailSO,setDetailSO,detailPO,setDetailPO,editProd,setEditProd,filteredProducts,filteredCustomers,filteredSO,filteredPO,blockedCustomers,lowStockCount,pendingPO,overdueInv}}>{children}</Ctx.Provider>
}

// PART: useStore — hook akses global state, throw jika di luar provider
export function useStore(){ const v=useContext(Ctx); if(!v) throw new Error("StoreProvider missing"); return v}
