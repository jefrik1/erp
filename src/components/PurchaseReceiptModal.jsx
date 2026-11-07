import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Printer, FileText, Check, Copy } from 'lucide-react';
import api from '../lib/api';
import ThermalPrintButton from './ui/ThermalPrintButton';

const nf = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const tgl = (v) =>
  v
    ? new Date(String(v).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '-';

/**
 * PurchaseReceiptModal
 * Cetak Struk Pembelian / Bukti Penerimaan Barang (GRN & PO)
 * Mendukung cetak Thermal 80mm (ESC/POS / RawBT) dan Dokumen A4 / Bukti Resmi
 */
export default function PurchaseReceiptModal({
  isOpen,
  onClose,
  receiptId,
  preloadedData = null,
  type = 'GRN', // 'GRN' | 'PO'
}) {
  const [data, setData] = useState(preloadedData);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('thermal'); // 'thermal' | 'document'
  const [copied, setCopied] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    if (preloadedData && (!receiptId || preloadedData.id === receiptId)) {
      setData(preloadedData);
      return;
    }
    if (!receiptId) return;

    let isMounted = true;
    setLoading(true);
    setErr('');

    const endpoint = type === 'PO' ? `/purchase/orders/${receiptId}` : `/purchase/receipts/${receiptId}`;

    api
      .get(endpoint)
      .then((res) => {
        if (isMounted) setData(res.data);
      })
      .catch((e) => {
        if (isMounted) setErr(e.response?.data?.error || e.message || 'Gagal memuat rincian pembelian');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, receiptId, preloadedData, type]);

  const items = useMemo(() => {
    if (!data) return [];
    return data.items || data.details || [];
  }, [data]);

  const totalCalculated = useMemo(() => {
    if (!data) return 0;
    if (data.total != null && Number(data.total) > 0) return Number(data.total);
    return items.reduce((acc, it) => {
      const q = Number(it.qty_received ?? it.qty ?? 0);
      const c = Number(it.unit_cost ?? it.unit_price ?? 0);
      return acc + q * c;
    }, 0);
  }, [data, items]);

  const totalQty = useMemo(() => {
    return items.reduce((acc, it) => acc + Number(it.qty_received ?? it.qty ?? 0), 0);
  }, [items]);

  // Plaintext Struk untuk printer thermal 80mm (ESC/POS / RawBT)
  const plainText = useMemo(() => {
    if (!data) return '';
    const line = (a, b) => String(a).padEnd(20).slice(0, 20) + String(b).padStart(12);
    const isGRN = type === 'GRN';
    const numDoc = data.grn_number || data.po_number || `DOC-${data.id}`;
    const dateDoc = tgl(data.receipt_date || data.po_date || data.created_at);

    const rows = [
      'PT SUMBER MATERIAL JAYA',
      'Distributor Semen & Besi Baja SNI',
      'Jl. Raya Industri No. 88, Gresik',
      'Telp. 031-1234567',
      '================================',
      isGRN ? '  BUKTI PENERIMAAN BARANG (GRN) ' : '    STRUK PEMBELIAN BARANG (PO) ',
      '================================',
      `No. Dok  : ${numDoc}`,
      `Tanggal  : ${dateDoc}`,
      data.po_number && isGRN ? `No. PO   : ${data.po_number}` : '',
      `Supplier : ${(data.supplier_name || 'Supplier Mitra').slice(0, 20)}`,
      `Gudang   : ${(data.warehouse_name || 'Gudang Pusat').slice(0, 20)}`,
      `Status   : ${data.status || 'COMPLETED'}`,
      '--------------------------------',
      'Item                 Qty x Harga',
      '--------------------------------',
    ].filter(Boolean);

    for (const it of items) {
      const name = (it.product_name || it.name || `Produk #${it.product_id || ''}`).slice(0, 20);
      const q = Number(it.qty_received ?? it.qty ?? 0);
      const u = it.unit ? ` ${it.unit}` : '';
      const c = Math.round(Number(it.unit_cost ?? it.unit_price ?? 0));
      rows.push(line(name, `${q}${u} x ${c > 0 ? nf(c) : '-'}`));
      const sub = q * c;
      if (sub > 0) {
        rows.push(line('      Subtotal', nf(sub)));
      }
    }

    rows.push('--------------------------------');
    rows.push(line('Total Qty Item', `${nf(totalQty)} item`));
    if (totalCalculated > 0) {
      rows.push(line('TOTAL PEMBELIAN', rupiah(totalCalculated)));
    }
    rows.push('================================');
    rows.push('');
    rows.push('   Tanda Tangan & Verifikasi:   ');
    rows.push('');
    rows.push(' Pengirim/Driver    Penerima/Gudang ');
    rows.push('');
    rows.push('');
    rows.push('(..............)   (..............)');
    rows.push('');
    rows.push('Dicetak: ' + new Date().toLocaleString('id-ID'));
    rows.push('Sistem ERP PT Sumber Material Jaya');
    rows.push('', '', '');

    return rows.join('\n');
  }, [data, items, type, totalQty, totalCalculated]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintDocument = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center p-3 sm:p-5 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-purchase-receipt, #printable-purchase-receipt * {
            visibility: visible;
          }
          #printable-purchase-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: auto;
            margin: 8mm;
          }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface text-ink rounded-2xl w-full max-w-3xl shadow-2xl border border-line flex flex-col max-h-[92vh] overflow-hidden animate-pop"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-line bg-surface-2 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center font-bold">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-ink">
                {type === 'PO' ? 'Struk Pembelian PO' : 'Struk Penerimaan Barang (GRN)'}
              </h3>
              <p className="text-xs text-ink-2">
                Dokumen bukti fisik pembelian & penerimaan material di gudang
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface-3 p-1 rounded-xl border border-line text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('thermal')}
                className={`px-3 py-1 rounded-lg transition ${
                  mode === 'thermal'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Thermal 80mm
              </button>
              <button
                type="button"
                onClick={() => setMode('document')}
                className={`px-3 py-1 rounded-lg transition ${
                  mode === 'document'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Dokumen A4
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal struk"
              className="w-9 h-9 rounded-xl border border-line hover:bg-surface-3 grid place-items-center text-ink-2 hover:text-ink transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-3/50 space-y-4">
          {loading && (
            <div className="py-12 text-center space-y-2">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-ink-2">Memuat data rincian pembelian…</p>
            </div>
          )}

          {err && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
              {err}
            </div>
          )}

          {!loading && !err && data && (
            <>
              {mode === 'thermal' ? (
                /* Thermal 80mm Preview */
                <div className="flex flex-col items-center">
                  <div
                    id="printable-purchase-receipt"
                    className="w-full max-w-[360px] bg-white text-black p-5 rounded-xl border border-line shadow-md font-mono text-[11px] leading-[1.45]"
                  >
                    <div className="text-center space-y-0.5">
                      <div className="font-bold text-[14px] tracking-wide text-black">
                        PT SUMBER MATERIAL JAYA
                      </div>
                      <div className="text-[10px] text-gray-700">Distributor Semen & Besi Baja SNI</div>
                      <div className="text-[10px] text-gray-700">Jl. Raya Industri No. 88, Gresik</div>
                      <div className="text-[10px] text-gray-700">Telp. 031-1234567 • NPWP 01.234.567.8-901.000</div>
                    </div>

                    <div className="my-2 border-t border-dashed border-black/40" />

                    <div className="text-center font-bold text-[12px] uppercase tracking-wide">
                      {type === 'PO' ? 'STRUK PEMBELIAN (PO)' : 'BUKTI PENERIMAAN BARANG (GRN)'}
                    </div>

                    <div className="my-2 border-t border-dashed border-black/40" />

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">No. Bukti</span>
                        <span className="font-bold">{data.grn_number || data.po_number || `#${data.id}`}</span>
                      </div>
                      {data.po_number && type === 'GRN' && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ref PO</span>
                          <span>{data.po_number}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tanggal</span>
                        <span>{tgl(data.receipt_date || data.po_date || data.created_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Supplier</span>
                        <span className="font-semibold text-right max-w-[65%] truncate">
                          {data.supplier_name || 'Mitra Supplier'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Gudang Tujuan</span>
                        <span className="text-right max-w-[65%] truncate">
                          {data.warehouse_name || 'Gudang Pusat Bekasi'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status</span>
                        <span className="font-bold text-emerald-800">{data.status || 'DITERIMA'}</span>
                      </div>
                    </div>

                    <div className="my-2 border-t border-dashed border-black/40" />

                    {/* Items table */}
                    <div className="space-y-2">
                      {items.map((it, idx) => {
                        const qty = Number(it.qty_received ?? it.qty ?? 0);
                        const cost = Number(it.unit_cost ?? it.unit_price ?? 0);
                        const sub = qty * cost;
                        return (
                          <div key={idx} className="space-y-0.5">
                            <div className="font-semibold text-black">
                              {it.product_name || it.name || `Produk #${it.product_id}`}
                            </div>
                            {it.sku && <div className="text-[10px] text-gray-500">SKU: {it.sku}</div>}
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                {nf(qty)} {it.unit || 'Unit'} × {cost > 0 ? nf(cost) : '-'}
                              </span>
                              <span className="font-medium text-black">
                                {sub > 0 ? nf(sub) : '-'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {items.length === 0 && (
                        <div className="text-center py-2 text-gray-500">(Rincian item kosong)</div>
                      )}
                    </div>

                    <div className="my-2 border-t border-dashed border-black/40" />

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Total Qty Fisik</span>
                        <span className="font-bold">{nf(totalQty)}</span>
                      </div>
                      {totalCalculated > 0 && (
                        <div className="flex justify-between text-[12px] font-bold">
                          <span>TOTAL NILAI</span>
                          <span>{rupiah(totalCalculated)}</span>
                        </div>
                      )}
                    </div>

                    <div className="my-3 border-t border-dashed border-black/40" />

                    {/* Signature block */}
                    <div className="grid grid-cols-2 text-center text-[10px] gap-2 pt-1">
                      <div>
                        <div className="text-gray-600">Diserahkan:</div>
                        <div className="h-10" />
                        <div className="border-t border-black/40 pt-0.5">Pengirim / Driver</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Diterima:</div>
                        <div className="h-10" />
                        <div className="border-t border-black/40 pt-0.5">Petugas Gudang</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-dotted border-black/30 text-center text-[9px] text-gray-500">
                      Tercatat pada Sistem ERP • PT Sumber Material Jaya
                    </div>
                  </div>
                </div>
              ) : (
                /* Document A4 / Official Receipt Note */
                <div
                  id="printable-purchase-receipt"
                  ref={printRef}
                  className="bg-white text-black p-6 sm:p-8 rounded-xl border border-line shadow-md max-w-2xl mx-auto space-y-4"
                >
                  <div className="flex justify-between items-start border-b pb-4">
                    <div>
                      <div className="font-display font-bold text-xl text-navy">
                        PT SUMBER MATERIAL JAYA
                      </div>
                      <div className="text-xs text-gray-600">
                        Distributor Bahan Bangunan, Semen & Besi Baja SNI
                      </div>
                      <div className="text-xs text-gray-600">
                        Jl. Raya Industri No. 88, Gresik • Telp. 031-1234567
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 rounded-md bg-navy text-white text-xs font-bold uppercase tracking-wider">
                        {type === 'PO' ? 'PURCHASE ORDER' : 'GOODS RECEIPT NOTE'}
                      </div>
                      <div className="font-mono font-bold text-sm mt-1 text-black">
                        {data.grn_number || data.po_number || `#${data.id}`}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="space-y-1">
                      <div>
                        <span className="text-gray-500">Supplier:</span>{' '}
                        <b className="text-black">{data.supplier_name || 'Mitra Supplier'}</b>
                      </div>
                      {data.supplier_phone && (
                        <div>
                          <span className="text-gray-500">Telepon:</span> {data.supplier_phone}
                        </div>
                      )}
                      {data.supplier_address && (
                        <div>
                          <span className="text-gray-500">Alamat:</span> {data.supplier_address}
                        </div>
                      )}
                      {data.po_number && type === 'GRN' && (
                        <div>
                          <span className="text-gray-500">Ref PO:</span>{' '}
                          <b className="font-mono">{data.po_number}</b>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 text-right">
                      <div>
                        <span className="text-gray-500">Tanggal:</span>{' '}
                        <b>{tgl(data.receipt_date || data.po_date || data.created_at)}</b>
                      </div>
                      <div>
                        <span className="text-gray-500">Gudang Penerima:</span>{' '}
                        <b>{data.warehouse_name || 'Gudang Pusat'}</b>
                      </div>
                      <div>
                        <span className="text-gray-500">Status Dokumen:</span>{' '}
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          {data.status || 'COMPLETED'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full text-xs border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                        <th className="p-2 text-left w-10">No</th>
                        <th className="p-2 text-left">Deskripsi Material / SKU</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-center">Satuan</th>
                        <th className="p-2 text-right">Harga Satuan</th>
                        <th className="p-2 text-right">Total (IDR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {items.map((it, idx) => {
                        const qty = Number(it.qty_received ?? it.qty ?? 0);
                        const cost = Number(it.unit_cost ?? it.unit_price ?? 0);
                        const sub = qty * cost;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2 text-center">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-semibold text-black">
                                {it.product_name || it.name || `Produk #${it.product_id}`}
                              </div>
                              {it.sku && <div className="text-[10px] text-gray-500 font-mono">SKU: {it.sku}</div>}
                            </td>
                            <td className="p-2 text-right font-bold">{nf(qty)}</td>
                            <td className="p-2 text-center text-gray-600">{it.unit || 'Unit'}</td>
                            <td className="p-2 text-right">{cost > 0 ? rupiah(cost) : '-'}</td>
                            <td className="p-2 text-right font-bold">{sub > 0 ? rupiah(sub) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-bold border-t border-gray-200">
                        <td colSpan={2} className="p-2 text-right">
                          Total Akumulasi
                        </td>
                        <td className="p-2 text-right text-brand font-bold">{nf(totalQty)}</td>
                        <td colSpan={2} className="p-2 text-right">
                          Grand Total Pembelian:
                        </td>
                        <td className="p-2 text-right text-emerald-800 font-bold">
                          {rupiah(totalCalculated)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Signatures */}
                  <div className="grid grid-cols-3 gap-4 text-center text-xs pt-6">
                    <div>
                      <div className="text-gray-500">Diserahkan Oleh:</div>
                      <div className="h-14" />
                      <div className="border-t border-gray-400 mx-4 pt-1 font-semibold">
                        Driver / Ekspedisi
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Diterima & Diperiksa:</div>
                      <div className="h-14" />
                      <div className="border-t border-gray-400 mx-4 pt-1 font-semibold">
                        Checker Gudang
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Disetujui Oleh:</div>
                      <div className="h-14" />
                      <div className="border-t border-gray-400 mx-4 pt-1 font-semibold">
                        Kepala Logistik
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-line bg-surface flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-ink-2 hover:text-ink transition"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? 'Tersalin' : 'Salin Teks Struk'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-line bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-ink-2 hover:text-ink transition"
            >
              Tutup
            </button>

            {mode === 'thermal' ? (
              <ThermalPrintButton
                text={plainText}
                label="Cetak Struk Thermal (F9)"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-navy text-white text-xs font-bold hover:bg-navy/90 transition shadow-sm"
              />
            ) : (
              <button
                type="button"
                onClick={handlePrintDocument}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-strong transition shadow-sm"
              >
                <Printer size={15} /> Cetak Dokumen A4
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
