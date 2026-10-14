// PART: FILE app/page.tsx — App Controller: StoreProvider → Shell + 7 Features + notifs — §4
"use client"
import { StoreProvider, useStore } from "@/lib/store"
import { Shell } from "@/components/shell"
import { DashboardFeature } from "./features/dashboard"
import { ProdukFeature } from "./features/produk"
import { PembelianFeature } from "./features/pembelian"
import { PelangganFeature } from "./features/pelanggan"
import { PenjualanFeature } from "./features/penjualan"
import { PengirimanFeature } from "./features/pengiriman"
import { InvoiceFeature } from "./features/invoice"
import { Overlays } from "./features/overlays"

function AppInner(){
  const s = useStore()
  const notifs = [
    ...(s.blockedCustomers.length ? [{ title: `${s.blockedCustomers.length} PELANGGAN TERBLOKIR`, desc: "Overdue >7 hari / limit terlampaui — Surat Jalan ditahan", actionLabel: "KELOLA KREDIT", onAction: ()=>s.setActive("pelanggan") } as any] : []),
    ...(s.lowStockCount ? [{ title: `${s.lowStockCount} SKU STOK KRITIS`, desc: "Di bawah min stock — perlu PO segera", actionLabel: "LIHAT STOK", onAction: ()=>s.setActive("produk") } as any] : []),
    ...(s.pendingPO ? [{ title: `${s.pendingPO} PO MENUNGGU TERIMA`, desc: "Barang belum masuk gudang", actionLabel: "KELOLA PO", onAction: ()=>s.setActive("pembelian") } as any] : []),
    ...(s.overdueInv ? [{ title: `${s.overdueInv} FAKTUR OVERDUE`, desc: "Segera follow-up piutang", actionLabel: "BUKA INVOICE", onAction: ()=>s.setActive("invoice") } as any] : []),
  ]
  return (
    <Shell active={s.active} onChange={s.setActive} searchValue={s.q} onSearch={v=>s.setQ(v)} notifCount={notifs.length} notifs={notifs} onNotifAction={()=>s.setActive("pelanggan")}>
      {s.toast && <div className="fixed bottom-6 right-6 z-50 rounded-full bg-zinc-900 text-white text-xs font-medium px-4 py-2.5 shadow-[0_16px_32px_rgba(0,0,0,0.18)] ring-1 ring-white/10">{s.toast}</div>}
      {s.active==="dashboard" && <DashboardFeature/>}
      {s.active==="produk" && <ProdukFeature/>}
      {s.active==="pembelian" && <PembelianFeature/>}
      {s.active==="pelanggan" && <PelangganFeature/>}
      {s.active==="penjualan" && <PenjualanFeature/>}
      {s.active==="pengiriman" && <PengirimanFeature/>}
      {s.active==="invoice" && <InvoiceFeature/>}
      <Overlays/>
    </Shell>
  )
}

export default function Page(){
  return <StoreProvider><AppInner/></StoreProvider>
}
