import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
async function main(){
  await prisma.stockLedger.deleteMany()
  await prisma.deliveryOrder.deleteMany()
  await prisma.salesOrderItem.deleteMany()
  await prisma.salesOrder.deleteMany()
  await prisma.purchaseOrderItem.deleteMany()
  await prisma.goodsReceipt.deleteMany()
  await prisma.purchaseOrder.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.productPrice.deleteMany()
  await prisma.productUnit.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouseBin.deleteMany()
  await prisma.warehouse.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.supplier.deleteMany()

  const wh1 = await prisma.warehouse.create({ data:{ code:"GUD-01", name:"Gudang Pusat Cibitung", address:"Jl. Industri No.88 Cibitung" }})
  const wh2 = await prisma.warehouse.create({ data:{ code:"GUD-02", name:"Gudang Pasir & Split", address:"Area Terbuka Blok C" }})
  const wh3 = await prisma.warehouse.create({ data:{ code:"GUD-03", name:"Gudang Besi & Baja", address:"Hall B - Rak Berat" }})
  await prisma.warehouseBin.createMany({ data:[
    { warehouseId: wh1.id, binCode:"RAK-A1-SEM" },
    { warehouseId: wh1.id, binCode:"RAK-A2-CAT" },
    { warehouseId: wh2.id, binCode:"AREA-PASIR-02" },
    { warehouseId: wh3.id, binCode:"RAK-C4-BESI" },
    { warehouseId: wh3.id, binCode:"RAK-C5-HOLLOW" },
    { warehouseId: wh3.id, binCode:"RAK-C6-WF" },
  ]})

  const suppliers = await Promise.all([
    prisma.supplier.create({ data:{ code:"SUP-001", name:"PT Krakatau Steel Distribusi", phone:"021 522 1122", address:"Cilegon" }}),
    prisma.supplier.create({ data:{ code:"SUP-002", name:"PT Gunung Garuda", phone:"021 890 3344", address:"Bekasi" }}),
    prisma.supplier.create({ data:{ code:"SUP-003", name:"CV Baja Mandiri", phone:"0812 9900 1122", address:"Cibitung" }}),
  ])

  const customers = await Promise.all([
    prisma.customer.create({ data:{ code:"C-RET-001", name:"Budi Santoso (Retail)", customerType:"Retail", phone:"0812 3456 7890", creditLimit:0, currentBalance:0, paymentTerms:0 }}),
    prisma.customer.create({ data:{ code:"C-KON-042", name:"CV Maju Jaya Konstruksi", customerType:"Proyek", phone:"0813 8888 1122", npwp:"01.234.567.8-009.000", creditLimit:150000000, currentBalance:87500000, paymentTerms:30 }}),
    prisma.customer.create({ data:{ code:"C-RES-019", name:"TB Sumber Rejeki", customerType:"Reseller", phone:"0821 7777 3344", creditLimit:75000000, currentBalance:72000000, paymentTerms:14, overdueDays:9 }}),
    prisma.customer.create({ data:{ code:"C-PRO-088", name:"PT Griya Indah Proyek", customerType:"Proyek", phone:"0811 2222 9900", creditLimit:300000000, currentBalance:142000000, paymentTerms:45, isBlocked:true, blockedReason:"Overdue 12 hari" }}),
  ])

  type P = { sku:string; name:string; category:string; isDimension:boolean; dimensionUnit:string; minStock:number; buyPrice:number; units:{unitName:string;conversionFactor:number;isBase:boolean}[]; prices:{unitName:string;tier:string;price:number}[] }
  const catalog: P[] = [
    { sku:"SEM-3R-50", name:"Semen Tiga Roda 50kg", category:"Semen", isDimension:false, dimensionUnit:"pcs", minStock:100, buyPrice:58500, units:[{unitName:"Zak",conversionFactor:1,isBase:true},{unitName:"Palet",conversionFactor:40,isBase:false},{unitName:"Ton",conversionFactor:20,isBase:false}], prices:[{unitName:"Zak",tier:"Retail",price:65500},{unitName:"Zak",tier:"Tukang",price:63500},{unitName:"Zak",tier:"Reseller",price:61500}]},
    { sku:"BESI-12-SNI", name:"Besi Beton Ulir 12mm SNI - 12m/lonjor", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:200, buyPrice:71500, units:[{unitName:"Lonjor",conversionFactor:12,isBase:false},{unitName:"Meter",conversionFactor:1,isBase:true},{unitName:"Kg",conversionFactor:0.888,isBase:false}], prices:[{unitName:"Lonjor",tier:"Retail",price:78500},{unitName:"Meter",tier:"Retail",price:6542},{unitName:"Lonjor",tier:"Proyek",price:74500}]},
    { sku:"BESI-10-SNI", name:"Besi Beton Polos 10mm SNI - 12m/lonjor", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:200, buyPrice:54000, units:[{unitName:"Lonjor",conversionFactor:12,isBase:false},{unitName:"Meter",conversionFactor:1,isBase:true}], prices:[{unitName:"Lonjor",tier:"Retail",price:59500},{unitName:"Meter",tier:"Retail",price:4958}]},
    { sku:"HOLLOW-40-GALV", name:"Hollow Galvanis 40x40x1.2mm - 6m/batang", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:120, buyPrice:68500, units:[{unitName:"Batang",conversionFactor:6,isBase:false},{unitName:"Meter",conversionFactor:1,isBase:true}], prices:[{unitName:"Batang",tier:"Retail",price:76500},{unitName:"Meter",tier:"Retail",price:12750}]},
    { sku:"WF-150-STEEL", name:"Baja WF 150x75x5x7mm - 12m/batang", category:"Besi & Baja", isDimension:true, dimensionUnit:"m", minStock:40, buyPrice:1850000, units:[{unitName:"Batang",conversionFactor:12,isBase:false},{unitName:"Meter",conversionFactor:1,isBase:true}], prices:[{unitName:"Batang",tier:"Retail",price:2120000},{unitName:"Meter",tier:"Retail",price:176667}]},
    { sku:"WRM-M8-21", name:"Wiremesh M8 2.1x5.4m - lembar", category:"Besi & Baja", isDimension:true, dimensionUnit:"m2", minStock:60, buyPrice:485000, units:[{unitName:"Lembar",conversionFactor:11.34,isBase:false},{unitName:"M2",conversionFactor:1,isBase:true}], prices:[{unitName:"Lembar",tier:"Retail",price:545000},{unitName:"M2",tier:"Retail",price:48057}]},
    { sku:"SENG-GEL-06", name:"Atap Seng Gelombang 0.30mm", category:"Atap", isDimension:true, dimensionUnit:"m2", minStock:80, buyPrice:48000, units:[{unitName:"M2",conversionFactor:1,isBase:true},{unitName:"Lembar",conversionFactor:1.8,isBase:false}], prices:[{unitName:"M2",tier:"Retail",price:58000}]},
  ]
  for(const p of catalog){
    const prod = await prisma.product.create({ data:{ sku:p.sku, name:p.name, category:p.category, isDimension:p.isDimension, dimensionUnit:p.dimensionUnit, minStock:p.minStock, buyPrice:p.buyPrice }})
    const unitMap: Record<string,string> = {}
    for(const u of p.units){
      const created = await prisma.productUnit.create({ data:{ productId: prod.id, unitName:u.unitName, conversionFactor:u.conversionFactor, isBase:u.isBase }})
      unitMap[u.unitName]=created.id
    }
    for(const pr of p.prices){
      await prisma.productPrice.create({ data:{ productId: prod.id, unitId: unitMap[pr.unitName], tier: pr.tier, price: pr.price }})
    }
  }
  console.log("Seed done")
}
main().catch(e=>{ console.error(e); process.exit(1)}).finally(()=> prisma.$disconnect())
