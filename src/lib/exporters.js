// Penulis file laporan (dipakai modul reporting, budget, dan assets):
//   PDF  : ditulis manual tanpa dependency - band header navy, zebra, kolom angka rata kanan,
//          baris TOTAL biru, angka negatif merah, footer nomor halaman.
//   XLSX : SheetJS + post-process OOXML (SheetJS versi community tidak bisa menulis style),
//          jadi zip-nya dibuka, styles.xml diganti, lalu atribut s=".." dipasang per sel.
//   CSV  : BOM + pemisah ';' (Excel id-ID). Format teks biasa - CSV tidak mendukung warna.
//
// Deskripsi kolom: [{ label, numeric?, total? }]  numeric = rata kanan/format ribuan, total = ikut dijumlahkan.
import * as XLSX from 'xlsx';
import zlib from 'zlib';

const PAGE_W = 842, PAGE_H = 595;       // A4 landscape
const MARGIN = 28, LINE_H = 13, FONT_SIZE = 8;
const CHAR_W = FONT_SIZE * 0.52;

const idMoney = (n)=> new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const idDate = (d = new Date())=>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/* ================================================================== ZIP */
const CRC_TABLE = (()=>{
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipRead(buf){
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--){
    if (buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: EOCD tidak ditemukan');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let n = 0; n < count; n++){
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
function zipWrite(files){
  const parts = [], central = [];
  let offset = 0;
  for (const f of files){
    const nameBuf = Buffer.from(f.name, 'utf8');
    const deflated = zlib.deflateRawSync(f.data);
    const useDeflate = deflated.length < f.data.length;
    const body = useDeflate ? deflated : f.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x2100, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x2100, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

/* ====================================================== XLSX (berwarna) */
// Palet: navy header, band judul biru muda, zebra abu sangat muda, TOTAL biru, angka negatif merah.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="#,##0"/>
<numFmt numFmtId="165" formatCode="#,##0;[Red]-#,##0"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><color rgb="FF334155"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF1E40AF"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF64748B"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E40AF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
<border><left/><right/><top style="medium"><color rgb="FF1E40AF"/></top><bottom style="medium"><color rgb="FF1E40AF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="4" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

const STYLE = { DEFAULT:0, HEADER:1, TITLE:2, SUBTITLE:3, ZEBRA_TEXT:4, NUM:5, NUM_ZEBRA:6, TOTAL_NUM:7, TOTAL_TEXT:8, BAND:9 };

function colIndex(ref){
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function applyCellStyles(xml, { headerRow, totalsRow, numeric }){
  return xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (whole, rStr, rowAttrs, inner)=>{
    const r = parseInt(rStr, 10) - 1;                 // 0-based
    const zebra = r > headerRow && (r - headerRow) % 2 === 0;
    const body = inner.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/?)>/g, (cellWhole, ref, cellAttrs, selfClose)=>{
      const ci = colIndex(ref);
      let s;
      if (r === 0) s = STYLE.TITLE;
      else if (r === 1) s = STYLE.SUBTITLE;
      else if (r === headerRow) s = STYLE.HEADER;
      else if (totalsRow !== null && r === totalsRow) s = numeric[ci] ? STYLE.TOTAL_NUM : STYLE.TOTAL_TEXT;
      else if (r > headerRow) s = numeric[ci] ? (zebra ? STYLE.NUM_ZEBRA : STYLE.NUM) : (zebra ? STYLE.ZEBRA_TEXT : STYLE.DEFAULT);
      else s = STYLE.BAND;
      const clean = cellAttrs.replace(/\ss="\d+"/g, '');
      return `<c r="${ref}"${clean} s="${s}"${selfClose}>`;
    });
    return `<row r="${rStr}"${rowAttrs}>${body}</row>`;
  });
}

export function buildXlsx({ title, subtitle, columns, rows, totals, sheetName }){
  const aoa = [[title], [subtitle || ''], []];
  const headerRow = aoa.length;                       // 0-based index of header
  aoa.push(columns.map(c=> c.label));
  for (const r of rows) aoa.push(r);
  let totalsRow = null;
  if (totals && totals.some(t=> t !== '' && t !== undefined && t !== null)){
    totalsRow = aoa.length;
    const label = (totals[0] === '' || totals[0] === undefined || totals[0] === null) ? 'TOTAL' : totals[0];
    aoa.push([label, ...totals.slice(1)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map((c, i)=>{
    let w = String(c.label).length + 4;
    for (const r of rows.slice(0, 300)) w = Math.max(w, String(r[i] ?? '').length + 2);
    if (c.numeric) w = Math.max(w, 14);
    return { wch: Math.min(42, w) };
  });
  const lastDataRow = totalsRow !== null ? totalsRow - 1 : aoa.length - 1;
  if (rows.length){
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: headerRow }, e: { c: columns.length - 1, r: lastDataRow } }) };
  }
  ws['!merges'] = [
    { s: { c: 0, r: 0 }, e: { c: Math.max(0, columns.length - 1), r: 0 } },
    { s: { c: 0, r: 1 }, e: { c: Math.max(0, columns.length - 1), r: 1 } },
  ];
  const safe = String(sheetName || title).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Laporan';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safe);
  const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // ---- post-process: pasang styles.xml berwarna + atribut s=".." per sel
  const files = zipRead(raw);
  const numeric = columns.map(c=> !!c.numeric);
  for (const f of files){
    if (f.name === 'xl/styles.xml') f.data = Buffer.from(STYLES_XML, 'utf8');
    else if (/^xl\/worksheets\/sheet\d+\.xml$/.test(f.name)){
      f.data = Buffer.from(applyCellStyles(f.data.toString('utf8'), { headerRow, totalsRow, numeric }), 'utf8');
    }
  }
  return zipWrite(files);
}

/* ============================================================ PDF (berwarna) */
function pdfEsc(s){
  return String(s ?? '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '-')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function clip(s, widthPx){
  const max = Math.max(3, Math.floor(widthPx / CHAR_W));
  const t = String(s ?? '');
  return t.length > max ? t.slice(0, max - 2) + '..' : t;
}
function textWidth(s, size = FONT_SIZE){ return String(s ?? '').length * size * 0.52; }
const NAVY = '0.118 0.251 0.686';
const NAVY_SOFT = '0.882 0.925 0.996';
const ZEBRA = '0.973 0.980 0.988';
const GRID = '0.850 0.878 0.906';
const GRAY_TEXT = '0.392 0.455 0.545';
const RED_TEXT = '0.725 0.110 0.110';

export function buildPdf({ title, subtitle, columns, rows, totals }){
  const usable = PAGE_W - 2 * MARGIN;
  const weights = columns.map((c, i)=>{
    let max = String(c.label).length;
    for (const r of rows) max = Math.max(max, String(r[i] ?? '').length);
    if (totals && totals[i] !== '' && totals[i] !== undefined && totals[i] !== null) max = Math.max(max, String(idMoney(totals[i])).length);
    return Math.min(190, Math.max(34, max * CHAR_W + 12));
  });
  const sum = weights.reduce((a, b)=> a + b, 0);
  const scale = sum > usable ? usable / sum : 1;
  const widths = weights.map(w=> w * scale);
  const xs = []; let acc = MARGIN;
  for (const w of widths){ xs.push(acc); acc += w; }
  const right = (i)=> xs[i] + widths[i] - 3;
  const cellText = (cell, i)=> clip(typeof cell === 'number' ? idMoney(cell) : String(cell ?? ''), widths[i] - 4);
  const isNeg = (cell)=> typeof cell === 'number' && cell < 0;

  const top = PAGE_H - MARGIN;
  const headY = top - 52;
  const firstRowY = headY - LINE_H - 3;
  const perPage = Math.max(1, Math.floor((firstRowY - MARGIN - 24) / LINE_H));
  const chunks = [];
  for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
  if (!chunks.length) chunks.push([]);

  const streams = chunks.map((chunk, pageIdx)=>{
    let s = '';
    // band judul
    s += `${NAVY_SOFT} rg ${MARGIN - 8} ${top - 44} ${usable + 16} 50 re f 0 0 0 rg\n`;
    s += `${NAVY} rg BT /F2 15 Tf ${MARGIN} ${top - 18} Td (${pdfEsc(title)}) Tj ET\n`;
    if (subtitle) s += `${GRAY_TEXT} rg BT /F1 8.5 Tf ${MARGIN} ${top - 31} Td (${pdfEsc(subtitle)}) Tj ET\n`;
    s += `${GRAY_TEXT} rg BT /F1 8 Tf ${MARGIN} ${top - 41} Td (Dicetak: ${pdfEsc(idDate())}) Tj ET\n`;

    // band header navy + teks putih
    s += `${NAVY} rg ${MARGIN} ${headY - 5} ${usable} ${LINE_H + 5} re f 0 0 0 rg\n`;
    columns.forEach((c, i)=>{
      const t = clip(c.label, widths[i] - 4);
      const x = c.numeric ? right(i) - textWidth(t) : xs[i] + 3;
      s += `1 1 1 rg BT /F2 ${FONT_SIZE} Tf ${x} ${headY} Td (${pdfEsc(t)}) Tj ET 0 0 0 rg\n`;
    });

    // baris data (zebra)
    let y = firstRowY;
    chunk.forEach((r, ri)=>{
      if (ri % 2 === 1) s += `${ZEBRA} rg ${MARGIN} ${y - 3} ${usable} ${LINE_H} re f 0 0 0 rg\n`;
      r.forEach((cell, i)=>{
        const t = cellText(cell, i);
        const x = columns[i].numeric ? right(i) - textWidth(t) : xs[i] + 3;
        const color = isNeg(cell) ? RED_TEXT : '0 0 0';
        s += `${color} rg BT /F1 ${FONT_SIZE} Tf ${x} ${y} Td (${pdfEsc(t)}) Tj ET 0 0 0 rg\n`;
      });
      y -= LINE_H;
    });

    // garis pemisah kolom
    s += `${GRID} RG `;
    for (let i = 1; i < xs.length; i++) s += `${xs[i]} ${headY - 5} m ${xs[i]} ${y + LINE_H - 3} l S `;
    s += `0 0 0 RG\n`;

    // baris TOTAL
    if (totals && pageIdx === chunks.length - 1){
      const ty = y + 1;
      s += `${NAVY} RG ${MARGIN} ${ty + LINE_H - 4} m ${PAGE_W - MARGIN} ${ty + LINE_H - 4} l S 0 0 0 RG\n`;
      s += `${NAVY_SOFT} rg ${MARGIN} ${ty - 3} ${usable} ${LINE_H} re f 0 0 0 rg\n`;
      totals.forEach((t, i)=>{
        const label = i === 0 ? 'TOTAL' : (t === '' || t === undefined || t === null ? '' : idMoney(t));
        if (!label) return;
        const txt = clip(label, widths[i] - 4);
        const x = (i === 0 || !columns[i].numeric) ? xs[i] + 3 : right(i) - textWidth(txt);
        const color = (i !== 0 && typeof t === 'number' && t < 0) ? RED_TEXT : NAVY;
        s += `${color} rg BT /F2 ${FONT_SIZE} Tf ${x} ${ty} Td (${pdfEsc(txt)}) Tj ET 0 0 0 rg\n`;
      });
    }

    // footer
    const footY = MARGIN - 4;
    s += `${GRID} RG ${MARGIN} ${footY} m ${PAGE_W - MARGIN} ${footY} l S 0 0 0 RG\n`;
    s += `${GRAY_TEXT} rg BT /F1 7.5 Tf ${MARGIN} ${footY - 11} Td (${pdfEsc(title)} - ${pdfEsc(subtitle || '')}) Tj ET\n`;
    const pager = `Halaman ${pageIdx + 1} dari ${chunks.length}`;
    s += `BT /F1 7.5 Tf ${PAGE_W - MARGIN - textWidth(pager, 7.5)} ${footY - 11} Td (${pdfEsc(pager)}) Tj ET 0 0 0 rg\n`;
    return s;
  });

  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${streams.map((_, i)=> `${5 + i * 2} 0 R`).join(' ')}] /Count ${streams.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  streams.forEach((content, i)=>{
    const pageObj = 5 + i * 2, contentObj = pageObj + 1;
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objects.length; i++){
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/* ================================================================= CSV */
// CSV tidak punya konsep warna - tetap tabel bersih dengan baris metadata + TOTAL.
export function buildCsv({ title, subtitle, columns, rows, totals }){
  const cell = (v)=>{
    const s = typeof v === 'number' ? String(v) : String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [
    cell(title),
    cell(subtitle || ''),
    cell('Dicetak: ' + idDate()),
    '',
    columns.map(c=> cell(c.label)).join(';'),
  ];
  for (const r of rows) lines.push(r.map(cell).join(';'));
  if (totals && totals.some(t=> t !== '' && t !== undefined && t !== null)){
    lines.push('');
    lines.push(totals.map((t, i)=>{
      if (i === 0 && (t === '' || t === undefined || t === null)) return 'TOTAL';
      return cell(t === '' || t === undefined ? '' : t);
    }).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n');
}

export { idMoney, idDate };

// Helper dipakai modul reporting/budget/assets supaya header HTTP-nya seragam.
export function sendReport(res, { format, payload, filename }){
  const base = String(filename || 'laporan');
  if (format === 'csv'){
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send(buildCsv(payload));
  }
  if (format === 'xlsx'){
    const buf = buildXlsx(payload);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    return res.send(buf);
  }
  const pdf = buildPdf(payload);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
  return res.send(pdf);
}
