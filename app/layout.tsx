// PART: FILE app/layout.tsx — Root Layout: metadata, html lang id, grain overlay — §4
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "BuildERP — Bahan Bangunan",
  description: "ERP bahan bangunan: stok presisi, penjualan tier otomatis, kredit, timbangan, e-faktur.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-[#F8FAFC] text-[#334155] antialiased">
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  )
}
