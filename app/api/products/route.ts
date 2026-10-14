import { NextResponse } from "next/server"
export async function GET(){
  try{
    const { prisma } = await import("@/lib/prisma")
    const products = await prisma.product.findMany({ include:{ units:true, prices:true }})
    return NextResponse.json(products)
  }catch{
    const { products } = await import("@/lib/data")
    return NextResponse.json(products)
  }
}
