// PART: FILE lib/excel.ts — Export ExcelJS (client) — 6 workbook: Stok/Sales/PO/DO/DJP/DetailSO — lihat DOKUMENTASI.md §3.6
"use client"
import ExcelJS from "exceljs"

const INK = "FF0A0A0F"
const LINE = "FFE4E4E7"
const MUTED = "FF71717A"

const RUPIAH_ACC = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"??_);_(@_)'
const QTY_FMT = '#,##0.##'

function colLetter(n: number) {
  let s = ""
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function styleHeader(cell: ExcelJS.Cell, accent?: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } }
  cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } }
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
  cell.border = {
    top: { style: "thin", color: { argb: LINE } },
    left: { style: "thin", color: { argb: LINE } },
    right: { style: "thin", color: { argb: LINE } },
    bottom: { style: "medium", color: { argb: accent ?? "FF10B981" } },
  }
}

function styleCell(cell: ExcelJS.Cell, opts?: { numFmt?: string; isAlt?: boolean; align?: "left"|"center"|"right" }) {
  cell.font = { name: "Calibri", size: 10, color: { argb: "FF18181B" } } as any
  cell.alignment = { vertical: "middle", horizontal: opts?.align ?? "left", wrapText: true } as any
  cell.border = {
    top: { style: "thin", color: { argb: LINE } },
    bottom: { style: "thin", color: { argb: LINE } },
    left: { style: "thin", color: { argb: LINE } },
    right: { style: "thin", color: { argb: LINE } },
  } as any
  if (opts?.isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } } as any
  if (opts?.numFmt) cell.numFmt = opts.numFmt
}

async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function setupSheetBase(ws: ExcelJS.Worksheet, opts: { title: string; subtitle: string }, headers: string[], widths: number[]) {
  ws.properties.defaultRowHeight = 17
  ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, printArea: `A1:${colLetter(headers.length)}120`, printTitlesRow: "4:4", margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } } as any
  ws.headerFooter.oddHeader = `&L&8&K9CA3AF BuildERP — Bahan Bangunan&R&8&K9CA3AF ${new Date().toLocaleDateString("id-ID")}`
  ws.headerFooter.oddFooter = `&L&7&K9CA3AF GUD-01 Gudang Pusat Cibitung — LIVE TELEMETRY&C&7&K9CA3AF Halaman &P dari &N&R&7&K9CA3AF Dicetak otomatis — bukan dokumen akuntansi`
  headers.forEach((_, i) => (ws.getColumn(i + 1).width = widths[i] ?? 16))
  ws.mergeCells(1, 1, 1, headers.length)
  const t = ws.getCell("A1")
  t.value = opts.title
  t.font = { name: "Calibri", size: 15, bold: true, color: { argb: INK } }
  t.alignment = { vertical: "middle", horizontal: "left" } as any
  ws.getRow(1).height = 23
  ws.mergeCells(2, 1, 2, headers.length)
  const s = ws.getCell("A2")
  s.value = opts.subtitle
  s.font = { name: "Calibri", size: 8.5, color: { argb: MUTED } } as any
  s.alignment = { vertical: "middle", horizontal: "left" } as any
  ws.getRow(2).height = 13
  const tag = ws.getCell(colLetter(headers.length) + "1")
  tag.value = "CONFIDENTIAL"
  tag.font = { name: "Calibri", size: 7, bold: true, color: { argb: "FFDC2626" } } as any
  tag.alignment = { vertical: "middle", horizontal: "right" } as any
  ws.getRow(3).height = 6
  ws.views = [{ state: "frozen", ySplit: 4, activeCell: "A5" }]
}

function applyTableStyle(ws: ExcelJS.Worksheet, headers: string[], accent: string) {
  const hr = ws.getRow(4)
  headers.forEach((_, i) => styleHeader(hr.getCell(i + 1), accent))
  hr.height = 20
  hr.commit()
}

// PART: Export Stok — Sheet STOK, status KRITIS/AMAN
// ───────── Stok
export async function exportStokExcel(args: { products: any[]; calcStock: (id:string)=>number }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "BuildERP"; wb.created = new Date(); (wb as any).company = "BuildERP"
  const ws = wb.addWorksheet("STOK", { properties: { tabColor: { argb: "FF10B981" } } })
  const headers = ["SKU", "Nama Produk", "Kategori", "Stok Base", "Satuan Base", "Harga Beli / Base", "Min Stok", "Status", "Selisih"]
  const widths = [13, 34, 15, 11, 11, 17, 10, 11, 11]
  setupSheetBase(ws, { title: "LAPORAN STOK — GUD-01  GUDANG PUSAT CIBITUNG", subtitle: `Diekspor ${new Date().toLocaleString("id-ID",{dateStyle:"medium", timeStyle:"short"})}  •  BuildERP  •  ${args.products.length} SKU  •  1 gudang aktif` }, headers, widths)
  const rows: any[][] = []
  let kritis = 0
  args.products.forEach((p) => {
    const stock = args.calcStock(p.id)
    const base = p.units.find((u:any)=>u.isBase)?.name ?? ""
    const selisih = stock - p.minStock
    const status = stock <= p.minStock ? "KRITIS" : "AMAN"
    if (status==="KRITIS") kritis++
    rows.push([p.sku, p.name, p.category, stock, base, p.buyPrice, p.minStock, status, selisih])
  })
  ws.addTable({
    name: "TabelStok",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium9" as any, showRowStripes: false },
    columns: headers.map(h=>({ name: h, filterButton: true })),
    rows,
  })
  applyTableStyle(ws, headers, "FF10B981")
  rows.forEach((_, idx)=>{
    const r = ws.getRow(5+idx)
    const status = r.getCell(8).value as string
    r.eachCell((c, col)=>{
      const isAlt = idx%2===1
      if(col===4 || col===7 || col===9) styleCell(c,{isAlt, align:"center", numFmt: QTY_FMT})
      else if(col===6) styleCell(c,{isAlt, align:"right", numFmt: RUPIAH_ACC})
      else if(col===8){
        const bg = status==="KRITIS" ? "FFFEF2F2" : "FFECFDF5"
        const fg = status==="KRITIS" ? "FFDC2626" : "FF059669"
        styleCell(c,{isAlt, align:"center"})
        c.font = { name:"Calibri", size:8, bold:true, color:{argb:fg}} as any
        c.fill = { type:"pattern", pattern:"solid", fgColor:{argb:bg}} as any
      } else styleCell(c,{isAlt, align: col===1 ? "center":"left"})
    })
    r.height = 17
  })
  const blank = ws.addRow([])
  blank.height = 4
  const sumRow = ws.addRow(["", "", "RINGKASAN", "", "", "", "", `${kritis} KRITIS`, `${args.products.length - kritis} AMAN`])
  sumRow.eachCell((c, col)=>{
    c.font = { name:"Calibri", size:9, bold:true, color:{argb: col>=8 ? "FFFFFFFF": INK}} as any
    c.fill = { type:"pattern", pattern:"solid", fgColor:{argb: col>=8 ? (col===8 ? "FFDC2626":"FF059669") : "FFF1F5F9"}} as any
    c.alignment = { vertical:"middle", horizontal: col===3 ? "right":"center"} as any
    c.border = { top:{style:"medium", color:{argb:INK}}, bottom:{style:"medium", color:{argb:INK}}, left:{style:"thin", color:{argb:LINE}}, right:{style:"thin", color:{argb:LINE}}} as any
  })
  sumRow.height = 18
  await downloadWorkbook(wb, `STOK-GUD01-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// PART: Export Sales — Sheet SALES Orders
// ───────── Sales
export async function exportSalesExcel(args: { soList:any[]; customers:any[] }) {
  const wb = new ExcelJS.Workbook(); wb.creator="BuildERP"; wb.created=new Date()
  const ws = wb.addWorksheet("SALES", { properties:{tabColor:{argb:INK}}})
  const headers=["SO Number","Tanggal","Pelanggan","Kode","Tipe","Total","Status"]
  const widths=[15,12,30,13,11,17,13]
  setupSheetBase(ws, { title:"DAFTAR SALES ORDERS", subtitle:`Diekspor ${new Date().toLocaleString("id-ID")}  •  ${args.soList.length} transaksi  •  Tier harga otomatis` }, headers, widths)
  const rows = args.soList.map((s:any)=>{
    const c=args.customers.find((x:any)=>x.id===s.customerId)
    return [s.soNumber, s.date, c?.name ?? "-", c?.code ?? "-", c?.type ?? "-", s.total, s.status]
  })
  ws.addTable({ name:"TabelSalesOrders", ref:"A4", headerRow:true, totalsRow:false, style:{theme:"TableStyleMedium1" as any, showRowStripes:false}, columns: headers.map(h=>({name:h, filterButton:true})), rows })
  applyTableStyle(ws, headers, INK)
  let total=0
  rows.forEach((_,idx)=>{
    const r=ws.getRow(5+idx)
    const orig=args.soList[idx]
    total+= orig.total
    r.eachCell((cell, col)=>{
      const isAlt=idx%2===1
      if(col===6) styleCell(cell,{isAlt, align:"right", numFmt: RUPIAH_ACC})
      else if(col===7){
        const map:any={ Approved:["FFECFDF5","FF059669"], Draft:["FFF8FAFC","FF64748B"], Cancelled:["FFFEF2F2","FFDC2626"], Completed:["FFEFF6FF","FF2563EB"]}
        const [bg,fg]= map[orig.status] ?? ["FFF8FAFC","FF18181B"]
        styleCell(cell,{isAlt, align:"center"}); cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:bg}} as any; cell.font={name:"Calibri",size:8,bold:true,color:{argb:fg}} as any
      } else styleCell(cell,{isAlt, align: col<=2 ? "center":"left"})
    })
  })
  ws.addRow([])
  const tr=ws.addRow(["","","","","GRAND TOTAL", total, `${args.soList.length} SO`])
  tr.eachCell((c,col)=>{
    c.font={name:"Calibri",size:10,bold:true,color:{argb: col===6?"FFFFFFFF": INK}} as any
    c.fill={type:"pattern",pattern:"solid",fgColor:{argb: col===6 ? INK : "FFF1F5F9"}} as any
    c.alignment={vertical:"middle",horizontal: col===6?"right":"center"} as any
    c.border={top:{style:"medium",color:{argb:INK}},bottom:{style:"medium",color:{argb:INK}},left:{style:"thin",color:{argb:LINE}},right:{style:"thin",color:{argb:LINE}}} as any
    if(col===6) c.numFmt=RUPIAH_ACC
  })
  await downloadWorkbook(wb, `SALES-ORDERS-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// PART: Export PO — Sheet PURCHASE
// ───────── PO
export async function exportPOExcel(args:{poList:any[]; suppliers:any[]}){
  const wb=new ExcelJS.Workbook(); wb.creator="BuildERP"
  const ws=wb.addWorksheet("PURCHASE",{properties:{tabColor:{argb:"FF0284C7"}}})
  const headers=["PO Number","Tanggal","Supplier","Kode Supplier","Gudang","Total","Status"]
  const widths=[15,12,30,14,11,17,13]
  setupSheetBase(ws, {title:"DAFTAR PURCHASE ORDERS — GUD-01", subtitle:`Diekspor ${new Date().toLocaleString("id-ID")}  •  ${args.poList.length} PO  •  Harga beli otomatis`}, headers, widths)
  const rows=args.poList.map((po:any)=>{
    const sup=args.suppliers.find((s:any)=>s.id===po.supplierId)
    return [po.poNumber, po.date, sup?.name ?? "-", sup?.code ?? "-", po.warehouseId ?? "GUD-01", po.total, po.status]
  })
  ws.addTable({ name:"TabelPurchaseOrders", ref:"A4", headerRow:true, totalsRow:false, style:{theme:"TableStyleMedium1" as any, showRowStripes:false}, columns: headers.map(h=>({name:h, filterButton:true})), rows })
  applyTableStyle(ws, headers, "FF0284C7")
  rows.forEach((_,idx)=>{
    const r=ws.getRow(5+idx)
    const po=args.poList[idx]
    r.eachCell((cell,col)=>{
      const isAlt=idx%2===1
      if(col===6) styleCell(cell,{isAlt, align:"right", numFmt: RUPIAH_ACC})
      else if(col===7){ styleCell(cell,{isAlt, align:"center"}); cell.font={name:"Calibri",size:8,bold:true, color:{argb: po.status==="Received"?"FF059669": po.status==="Ordered"?"FF0284C7":"FF64748B"}} as any}
      else styleCell(cell,{isAlt, align: col<=2?"center":"left"})
    })
  })
  await downloadWorkbook(wb, `PURCHASE-ORDERS-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// PART: Export DO — Sheet DELIVERY
// ───────── DO
export async function exportDOExcel(args:{doList:any[]; soList:any[]}){
  const wb=new ExcelJS.Workbook()
  const ws=wb.addWorksheet("DELIVERY",{properties:{tabColor:{argb:"FFF59E0B"}}})
  const headers=["DO Number","SO Number","Supir","Kendaraan","Netto (kg)","Status"]
  const widths=[15,15,22,15,13,14]
  setupSheetBase(ws, {title:"DAFTAR DELIVERY ORDERS — SURAT JALAN", subtitle:`Diekspor ${new Date().toLocaleString("id-ID")}  •  ${args.doList.length} DO  •  Timbangan RS232`}, headers, widths)
  const rows=args.doList.map((d:any)=>{
    const so=args.soList.find((s:any)=>s.id===d.soId)
    return [d.doNumber, so?.soNumber ?? "-", d.driver||"-", d.vehicle||"-", d.netto ?? 0, d.status]
  })
  ws.addTable({ name:"TabelDeliveryOrders", ref:"A4", headerRow:true, totalsRow:false, style:{theme:"TableStyleMedium1" as any, showRowStripes:false}, columns: headers.map(h=>({name:h, filterButton:true})), rows })
  applyTableStyle(ws, headers, "FFF59E0B")
  rows.forEach((_,idx)=>{
    const r=ws.getRow(5+idx)
    const d=args.doList[idx]
    r.eachCell((cell,col)=>{
      const isAlt=idx%2===1
      if(col===5) styleCell(cell,{isAlt, align:"center", numFmt: QTY_FMT})
      else if(col===6){ styleCell(cell,{isAlt, align:"center"}); const c=d.status==="Delivered"?"FF059669": d.status==="In Transit"?"FF0284C7":"FF64748B"; cell.font={name:"Calibri",size:8,bold:true,color:{argb:c}} as any}
      else styleCell(cell,{isAlt, align: col<=2?"center":"left"})
    })
  })
  await downloadWorkbook(wb, `DELIVERY-ORDERS-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// PART: Export DJP — Sheet E-FAKTUR DJP (PPN 11% efektif)
// ───────── DJP
export async function exportDJPExcel(args:{invList:any[]; customers:any[]}){
  const wb=new ExcelJS.Workbook()
  const ws=wb.addWorksheet("E-FAKTUR DJP",{properties:{tabColor:{argb:"FFDC2626"}}})
  const headers=["INV Number","SO","Pelanggan","DPP","DPP Lain 11/12","PPN 12%","Total","Status","Jatuh Tempo"]
  const widths=[15,15,24,15,15,13,15,11,13]
  setupSheetBase(ws, {title:"E-FAKTUR DJP — DAFTAR FAKTUR PENJUALAN", subtitle:`Diekspor ${new Date().toLocaleString("id-ID")}  •  PPN 12% × DPP Nilai Lain 11/12 (efektif 11%)  •  ${args.invList.length} faktur`}, headers, widths)
  const rows=args.invList.map((inv:any)=>{
    const c=args.customers.find((x:any)=>x.id===inv.customerId)
    return [inv.invNumber, inv.soId, c?.name ?? "-", inv.dpp, inv.dppLain, inv.ppn, inv.total, inv.status, inv.dueDate]
  })
  ws.addTable({ name:"TabelEfakturDJP", ref:"A4", headerRow:true, totalsRow:false, style:{theme:"TableStyleMedium1" as any, showRowStripes:false}, columns: headers.map(h=>({name:h, filterButton:true})), rows })
  applyTableStyle(ws, headers, "FFDC2626")
  rows.forEach((_,idx)=>{
    const r=ws.getRow(5+idx)
    const inv=args.invList[idx]
    r.eachCell((cell,col)=>{
      const isAlt=idx%2===1
      if([4,5,6,7].includes(col)) styleCell(cell,{isAlt, align:"right", numFmt: RUPIAH_ACC})
      else if(col===8){ const fg= inv.status==="Paid"?"FF059669": inv.status==="Overdue"?"FFDC2626":"FFD97706"; styleCell(cell,{isAlt, align:"center"}); cell.font={name:"Calibri",size:8,bold:true,color:{argb:fg}} as any}
      else if(col===9) styleCell(cell,{isAlt, align:"center"})
      else styleCell(cell,{isAlt, align: col<=2?"center":"left"})
    })
  })
  await downloadWorkbook(wb, `EFAKTUR-DJP-${new Date().toISOString().slice(0,10)}.xlsx`)
}

// PART: Export Detail SO — Sheet per SO Number
// ───────── Detail SO
export async function exportDetailSOExcel(args:{so:any; customers:any[]; products:any[]}){
  const wb=new ExcelJS.Workbook()
  const ws=wb.addWorksheet(args.so.soNumber.slice(0,31),{properties:{tabColor:{argb:INK}}})
  const c=args.customers.find((x:any)=>x.id===args.so.customerId)
  const headers=["No","Produk","SKU","Qty","Satuan","Harga / Satuan","Subtotal"]
  const widths=[6,32,13,10,11,17,17]
  setupSheetBase(ws, {title:`SALES ORDER — ${args.so.soNumber}`, subtitle:`${c?.name ?? "-"}  •  ${c?.code ?? "-"}  •  ${c?.type ?? "-"}  •  ${args.so.date}  •  Status ${args.so.status}  •  Sales ${args.so.salesperson}`}, headers, widths)
  const rows=args.so.items.map((it:any, idx:number)=>{
    const p=args.products.find((x:any)=>x.id===it.productId)
    const u=p?.units.find((x:any)=>x.id===it.unitId)
    return [idx+1, p?.name ?? it.productId, p?.sku ?? "-", it.qty, u?.name ?? "-", it.price, it.subtotal]
  })
  ws.addTable({ name:`Tabel${args.so.soNumber.replace(/[^A-Za-z0-9]/g,"")}`, ref:"A4", headerRow:true, totalsRow:false, style:{theme:"TableStyleMedium1" as any, showRowStripes:false}, columns: headers.map(h=>({name:h, filterButton:true})), rows })
  applyTableStyle(ws, headers, INK)
  rows.forEach((r0:any,idx:number)=>{
    const r=ws.getRow(5+idx)
    r.eachCell((cell:any,col:number)=>{
      const isAlt=idx%2===1
      if(col===1 || col===4) styleCell(cell,{isAlt, align:"center", numFmt: col===4? QTY_FMT: undefined})
      else if(col===6 || col===7) styleCell(cell,{isAlt, align:"right", numFmt: RUPIAH_ACC})
      else styleCell(cell,{isAlt})
    })
  })
  ws.addRow([])
  const tr=ws.addRow(["","","","","","TOTAL", args.so.total])
  tr.eachCell((cell:any,col:number)=>{
    cell.font={name:"Calibri",size:11,bold:true,color:{argb: col>=6?"FFFFFFFF": INK}} as any
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb: col>=6? INK: "FFF1F5F9"}} as any
    cell.alignment={horizontal: col===7?"right":"center", vertical:"middle"} as any
    cell.border={top:{style:"medium",color:{argb:INK}},bottom:{style:"medium",color:{argb:INK}},left:{style:"thin",color:{argb:LINE}},right:{style:"thin",color:{argb:LINE}}} as any
    if(col===7) cell.numFmt=RUPIAH_ACC
  })
  tr.height=20
  await downloadWorkbook(wb, `${args.so.soNumber}.xlsx`)
}
