# ERP UI Overhaul — Master Prompt Pack

**Repo:** `E:\erptest` — *ERP Material / PT Sumber Material Jaya*
**Stack nyata:** React 18.2 · Vite 7 · React Router 7 · Tailwind 3.4 (tanpa plugin) · Zustand 4 · Recharts 2 · lucide-react · Inter Variable · Express 4 + PostgreSQL
**Skala:** 44 halaman rute, 15.211 baris kode halaman, 43/44 halaman memakai primitif `src/components/PosUI.jsx`

---

## 0. Cara pakai (baca ini dulu)

Dokumen ini berisi **tiga prompt siap tempel** dan **tiga lampiran teknis**:

| Bagian | Dipakai untuk |
|---|---|
| **§1 Master Prompt** | Overhaul menyeluruh (design system + shell + semua komponen inti). Tempel ke Claude/GPT dengan repo terlampir. |
| **§2 Page Prompt** | Refactor **satu halaman** (mis. Purchase Order) tanpa menyentuh halaman lain. |
| **§3 Review Prompt** | Minta AI mengaudit & memberi skor UI yang sudah ada, tanpa mengubah kode. |
| **Lampiran A** | Audit kondisi nyata repo ini (angka hasil grep) — sudah diringkas ke dalam §1. |
| **Lampiran B** | File token drop-in: CSS variables + `tailwind.config.js`. |
| **Lampiran C** | Rencana rollout 6 fase yang dipetakan ke file asli. |

Cara pakai:

1. Isi blok `[PLACEHOLDER]` di §1 (minimal `[MODULE_SCOPE]` dan `[CURRENT_SCREENSHOT]`).
2. Tempel §1 + Lampiran B ke AI **bersama** `src/components/PosUI.jsx`, `src/components/Layout.jsx`, `tailwind.config.js`, `src/index.css`, dan 2–3 halaman contoh.
3. Minta AI **berhenti setelah Fase 0–1** dan review hasilnya sebelum lanjut. Prompt sudah memerintahkan itu.
4. Untuk halaman berikutnya, jangan ulangi §1 — pakai §2 dengan konteks design system yang sudah jadi.

Aturan main yang sudah tertanam di prompt: **jangan ubah API, route, logika bisnis, atau RBAC**. Ini murni lapisan presentasi.

---

## 1. MASTER PROMPT — copy mulai dari sini

**ROLE**

You are a Principal Product Designer and Frontend Architect with 12+ years shipping dense, high-stakes B2B software (Linear, Stripe Dashboard, Vercel, SAP Fiori, Bloomberg Terminal). You are equal parts design-system engineer and React implementer: you do not hand over Figma fiction, you hand over code that compiles.

Your mandate is to overhaul the interface of a live, production ERP used 8+ hours a day by warehouse clerks, finance staff, sales reps, and a director. You will not redesign it into a marketing website. You will not add decoration. You will make an operator faster.

**NON-NEGOTIABLE CONTEXT — read before designing**

**Product.** "ERP Material" for PT Sumber Material Jaya — an Indonesian building-materials distributor (cement, rebar, ceramics, paint). Multi-warehouse, multi-unit, batch/lot tracking, PPN 11%, tiered approval matrix, AR/AP, fixed assets, fleet & driver trips, consignment, landed cost, loyalty tiers, and a POS with cashier shift reconciliation.

**Users & jobs.** Warehouse clerk receiving goods at 07:00 on a 1366×768 laptop. Finance reconciling 300 invoices before month-end close. Sales rep building a 40-line order while a customer waits. Director scanning 6 KPIs on a 27" monitor. Cashier on a touchscreen under time pressure. Design for the clerk first; the director gets the same system, not a different one.

**Language.** All UI copy stays **Bahasa Indonesia**. Keep existing domain vocabulary exactly (`Sales Order`, `Goods Receipt`, `Kartu Stok`, `Susut & Pecah`, `Konsinyasi`, `Landed Cost`, `AR / AP`, `Titipan`). Never translate a term the staff already say out loud.

**Tech stack — fixed, do not substitute.**
React 18.2 (function components + hooks only), Vite 7, React Router 7 (`react-router-dom`), Tailwind CSS 3.4 **without any Tailwind plugin** (`plugins: []`), Zustand 4 for auth state, Recharts 2 for charts, `lucide-react` for icons, `motion` 14 (already installed, currently unused) for micro-interactions, `react-hot-toast` (installed, barely used), `date-fns`, `axios`, `@fontsource-variable/inter`.
Backend is Express 4 + PostgreSQL and is **out of scope**. You may read API responses to understand data shapes; you may not change endpoints, payloads, or SQL.

**Codebase shape — respect it.**
- `src/App.jsx` — 44 lazy-loaded routes, each wrapped in `<Protected allow={PAGE_ACCESS.x}>`.
- `src/components/Layout.jsx` — app shell: fixed 268px dark sidebar (`#0F172A`), 64px sticky header, Ctrl+K search modal, notification popover, quick-action FAB, backend health ping.
- `src/components/PosUI.jsx` — **the de-facto design system**, 248 lines, imported by 43 of 44 pages. It exports `PosPageHeader, PosCard, PosCardBody, PosSearch, PosChip, PosChipRow, PosToolbar, PosSelect, PosTableWrap, PosTableHead, PosTh, PosBadge, PosEmpty, PosSkeleton, PosError, PosPager, PosStat, PosExportButtons, PosQtyInput` plus class constants `posInput, posBtnPrimary, posBtnSecondary, posBtnSm, posTh, posTr, posTd, posSearchWrap, posSelectWrap`.
  **Upgrade this file in place, backwards compatible.** All 19 components and 9 exported class constants must keep their current call signature and default props, because 43 pages depend on them. Add new primitives next to them; never fork a parallel library.
- `src/components/DialogProvider.jsx` — promise-based `dialog.alert()` / `dialog.confirm()`; the rest of the app awaits these. Preserve the API.
- `src/config/access.js` — **single source of truth** for RBAC (`PAGE_ACCESS`, `MODULE_ROLES`). The sidebar, route guard, and backend mounts all read it. Never duplicate a role list anywhere else.
- `src/index.css` — 10 lines. `tailwind.config.js` — 8 lines, only 5 colors and one font family.
- `src/store/auth.js` — Zustand; `localStorage` keys `token`, `user`, `pos_prefill`.

**Placeholders to resolve from the attached material:**
`[MODULE_SCOPE]` · `[PAGE_FILE]` · `[ROUTE_PATH]` · `[PRIMARY_ENTITY]` · `[CURRENT_SCREENSHOT]` · `[TABLE_COLUMNS]` · `[FORM_FIELDS]` · `[ROLE_SCOPE]` · `[BRAND_PRIMARY]` (default `#1E40AF`) · `[DENSITY_DEFAULT]` (default `default`) · `[LOCALE]` (default `id-ID`) · `[EXTRA_ACCEPTANCE]`

**1. ROLE & DESIGN PHILOSOPHY**

Operate on four laws, in this priority order:

1. **Clarity over decoration.** Every pixel must earn its place by helping a user decide, enter, or verify something. If an element only "adds polish", delete it.
2. **Density with air.** This is a data tool, not a landing page: target 44px default table rows and 36px inputs, but separate *groups* generously (16–24px) so the eye can chunk. The enemy is not density — it is undifferentiated density.
3. **The screen is a keyboard.** Power users live here. Every primary action, every row, every filter must be reachable without a mouse, and focus must always be visible.
4. **Trust is visual.** Money, stock, and status are the product. Numbers must align vertically, statuses must never be conveyed by color alone, and nothing may look "approximately right".

Explicitly reject the AI-SaaS default aesthetic: no purple-to-blue gradients, no glassmorphism, no oversized hero sections on data pages, no emoji icons, no floating 3D blobs, no "delightful" bounce. The reference feeling is *a precision instrument*, not *a startup homepage*.

Cognitive-load budget per screen:
- One primary action, max two secondary, everything else in an overflow menu.
- Max 3 levels of visual hierarchy above the table.
- Max 2 type sizes per component, max 2 accent colors visible at once.
- No more than one modal deep. A form with >12 fields is a page or a drawer, never a modal.

**2. FOUNDATIONS & DESIGN TOKENS**

Implement a two-layer token system: **CSS custom properties** as the runtime contract (enables dark mode + high contrast + density without recompiling), and **Tailwind theme keys** as the authoring API. No page may contain a raw hex value after this overhaul. Use the drop-in file in **Lampiran B** verbatim as the starting point; extend, never contradict.

**2.1 Color**

Neutral-heavy, cool-gray B2B palette. Backgrounds and borders carry the structure; color is reserved for meaning.

| Role | Light | Dark | Usage |
|---|---|---|---|
| `bg` | `#F7F8FA` | `#0B0F19` | app canvas |
| `surface` | `#FFFFFF` | `#111726` | cards, tables, modals |
| `surface-2` | `#F4F6F8` | `#161D2E` | table header, inset panels, input rest |
| `surface-3` | `#EDF0F4` | `#1D2538` | hover/pressed fill, skeletons |
| `border` | `#E4E7EC` | `#232B3D` | default 1px hairline |
| `border-strong` | `#D0D5DD` | `#2F394E` | inputs, dividers that must read |
| `text` | `#101828` | `#E7EAF0` | primary text, table values |
| `text-2` | `#475467` | `#A3ADC2` | labels, secondary |
| `text-3` | `#667085` | `#7C879E` | meta, timestamps, hints |
| `text-disabled` | `#98A2B3` | `#5A6478` | disabled |
| `primary` | `[BRAND_PRIMARY]` = `#1E40AF` | `#7B9BFF` | the single authoritative accent |
| `primary-hover` | `#1B3A9C` | `#93AEFF` | hover |
| `primary-subtle` | `#EEF3FF` | `#16213F` | selected row, active nav, soft chips |
| `primary-border` | `#C7D5FE` | `#2A3D6B` | tinted borders |

Semantic colors — **only** for status, never for branding or emphasis:

| Token | Text | Subtle bg | Border |
|---|---|---|---|
| success | `#067647` | `#ECFDF3` | `#ABEFC6` |
| warning | `#B54708` | `#FFFAEB` | `#FEDF89` |
| danger | `#B42318` | `#FEF3F2` | `#FECDCA` |
| info | `#026AA2` | `#F0F9FF` | `#B9E6FE` |
| neutral | `#344054` | `#F2F4F7` | `#E4E7EC` |

Rules:
- `primary` appears at most **twice per viewport**: the one primary button, and the active nav item or selected tab. Not both plus a link plus a badge.
- Semantic color never fills a large surface. Soft background + 1px border + dark text from the same hue. No saturated solid pills except a single destructive confirm.
- Data-viz categorical ramp (colorblind-safe, 8 series max): `#1E40AF, #0E9384, #DC6803, #7A5AF8, #C11574, #0BA5EC, #667085, #B54708`.
- **Dark mode** is a first-class theme, toggled by `data-theme="dark"` on `<html>`, persisted in `localStorage` key `ui.theme`, defaulting to `prefers-color-scheme`. In dark mode: desaturate semantic fills, never use pure black text on dark, borders carry the separation (shadows are nearly invisible — do not rely on them), and reduce chart fill opacity to 18%.
- **High contrast** via `data-contrast="high"`: borders become `#000`/`#FFF`, text becomes pure black/white, primary becomes `#0033CC`, all subtle backgrounds flatten to surface, focus ring becomes 2px solid currentColor with 2px offset. Must remain fully usable with Windows High Contrast Mode forced colors.

**2.2 Typography**

UI face: **Inter Variable** (already installed via `@fontsource-variable/inter`). Enable `font-feature-settings: "cv05" 1, "ss01" 1, "tnum" 1, "lnum" 1` on numeric contexts. Mono: `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace` — used for SKU, document numbers (`SO/2026/00123`), batch codes, IDs, and any value a user might copy. Do **not** add a webfont dependency.

Strict scale — no ad-hoc `text-[13.5px]` anywhere:

| Token | px | rem | line-height | tracking | weight | Use |
|---|---|---|---|---|---|---|
| `micro` | 11 | .6875 | 16 | +0.04em | 600 | table headers, eyebrows, badges — **UPPERCASE ONLY HERE** |
| `caption` | 12 | .75 | 16 | 0 | 500 | help text, meta, timestamps |
| `body-sm` | 13 | .8125 | 20 | 0 | 450 | dense table cells, secondary paragraphs |
| `body` | 14 | .875 | 20 | 0 | 450 | default body, inputs, buttons |
| `title-sm` | 16 | 1 | 24 | −0.005em | 600 | card title, section header |
| `title` | 18 | 1.125 | 26 | −0.01em | 650 | page sub-header, panel title |
| `title-lg` | 22 | 1.375 | 28 | −0.015em | 700 | page title |
| `display` | 28 | 1.75 | 34 | −0.02em | 700 | KPI hero, login headline |

Hard rules:
- **Nothing below 11px. Ever.**
- `micro` is the only uppercase style, and only for column headers and section eyebrows. Buttons and labels are **sentence case**: "Tambah stok", not "TAMBAH STOK". "Simpan & submit", not "SIMPAN & SUBMIT".
- Never `font-black` / `font-weight: 900` on labels or headings. 700 is the maximum, and only on page titles, KPI values, and grand totals.
- **All money, quantities, percentages, dates, and IDs use `font-variant-numeric: tabular-nums`** and are right-aligned in tables. No exceptions. A column of rupiah that doesn't align is a bug.
- Line length for prose blocks: 60–75ch. Never full-bleed paragraph text on a 2560px monitor.
- Numbers: `Intl.NumberFormat('id-ID')`, currency prefix `Rp ` with a non-breaking space, no decimals for IDR (decimals only where a unit price genuinely carries them). Empty value renders `—`, never `0`.

**2.3 Spacing, radius, elevation**

- **4px base grid.** Allowed steps: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64`. The 2px step exists only for icon nudges and badge insets. No `p-[13px]`, no arbitrary values.
- Page gutter: 24px ≥1024, 16px below. Section gap: 16px. Card padding: 16px (12px in compact density). Group gap inside a form row: 12px.
- Control heights: `xs 26 · sm 32 · md 36 · lg 40 · xl 44`. Defaults: table toolbar 32, form input 36, primary CTA 40, touchscreen CTA 44.
- Table row heights: `compact 36 · default 44 · comfortable 56`.
- **Radius scale:** `4 (xs) · 6 (sm) · 8 (md) · 12 (lg) · 16 (xl) · 999 (full)`. Cards use `lg (12)`, modals `xl (16)`, inputs/buttons `sm (6)`, chips/badges `full`. **The current global `rounded-[20px]` must disappear.**
- **Elevation — replace muddy shadows with borders + layered surface contrast:**
  - `e0` — 1px border, no shadow. Default for every card and table.
  - `e1` — `0 1px 2px rgba(16,24,40,.06)`. Sticky header, raised card.
  - `e2` — `0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.04)`. Dropdown, popover, tooltip.
  - `e3` — `0 12px 24px -6px rgba(16,24,40,.10), 0 4px 8px -4px rgba(16,24,40,.05)`. Modal.
  - `e4` — `0 24px 48px -12px rgba(16,24,40,.18)`. Command palette, drawer.
  - In dark mode, shadows are replaced by a 1px `border-strong` top edge plus a subtle surface lift.
- Z-index scale, no exceptions: `sticky 10 · header 20 · sidebar 30 · dropdown 40 · overlay 50 · modal 60 · palette 70 · toast 80 · tooltip 90`.

**3. LAYOUT ARCHITECTURE & NAVIGATION**

**3.1 App shell**
- **Sidebar**: 240px expanded / 64px collapsed (icon rail with tooltip on hover), persisted at `localStorage.ui.sidebar`, toggled by a header button and by `[`. Dark in light mode is allowed (it anchors the app), but it must use the token surface, not a hardcoded `#0F172A`.
  - Grouped modules with 11px uppercase group labels and a 1px divider between groups: **Penjualan · Proyek · Pembelian · Barang & Persediaan · Operasional · Keuangan · Loyalty · SDM · Master · Saya**.
  - Active item: `primary-subtle` background, `primary` text, 2px left indicator. Not a solid white block on dark.
  - Collapsed rail shows a flyout submenu on hover/focus.
  - Sidebar scrolls independently; the user card + logout is pinned at the bottom.
  - **RBAC gating stays exactly as it is** (`PAGE_ACCESS` + `canAccess` + heading auto-hide). Do not hardcode visibility.
- **Top bar**: 56px, sticky, `surface` with a 1px bottom border and `e1`. Contains: mobile menu, breadcrumb, global search trigger, environment/health indicator, notification bell with count, theme toggle, density toggle, user menu.
- **Breadcrumbs**: `Beranda / Pembelian / Purchase Order / PO-2026-0142`. Derived from route metadata, truncated from the middle on narrow screens, last segment is plain text (not a link).
- **Global command palette (Cmd/Ctrl+K)**: replaces the current `SearchModal`. 560px wide, `e4`, 8px below the header, input 44px with a leading search icon, grouped results (`Navigasi`, `Aksi cepat`, `Data`), fuzzy match, recent items on empty state, `↑↓` navigate, `Enter` open, `Esc` close, `>` prefix switches to actions-only, `/` focuses data search. Every sidebar destination must be reachable by typing its name in Indonesian.
- **Notification popover**: 320px, grouped by urgency, 1px dividers, each row has an icon, a 2-line label, a relative timestamp, and a deep link. Unread dot, not a red count bubble on every item.
- **Quick action**: keep the FAB only below 1024px. On desktop, the same actions live in the header `+ Baru` split-button and in the palette.
- **Footer**: remove the marketing-style centered footer from the app shell; keep a 32px utility strip only if it carries something actionable (version, environment).

**3.2 Workspace grid**
- 12-column fluid grid, `gap: 16px`, inside `max-width: 1600px` centered on ≥1920px screens (never stretch a table to 3440px).
- Page composition order, always: **Page header → KPI strip (optional) → Filter/toolbar → Content (table/cards) → Pagination**. Never put KPIs below the table.
- Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Tables get horizontal scroll inside their card below `md`; the page itself must never scroll horizontally at 390px.
- Detail pages use a 2-column split: 8/12 primary content, 4/12 sticky summary rail (`top: 72px`). On <1024 it collapses to a single column with the summary moved above the actions.

**4. CORE COMPONENT SPECIFICATIONS**

**4.1 Data table — the most important component in this product**

Build one `DataTable` primitive (in `src/components/ui/DataTable.jsx`) and migrate all 38 pages that currently hand-roll `<table>`. It must support:

- **Sticky header** inside a scroll container (`position: sticky; top: 0`), `surface-2` background, 1px `border` top and bottom, 11px uppercase `text-3` labels, sort affordance (chevron appears on hover, solid when active, `aria-sort` set correctly).
- **Pinned columns**: left = 40px checkbox + the identity column (product name / document number), right = 48px action menu. Pinned cells get `surface` background, a 1px `border` separator, and `e1` on horizontal scroll so they never look detached.
- **Row states**: default `surface`; hover `surface-2` at 120ms; selected `primary-subtle` with a 2px `primary` inset on the left; keyboard-focused row gets the standard focus ring; loading rows are skeletons that match real column widths, not a centered spinner.
- **Numeric columns** right-aligned, tabular, `body-sm`. Money uses `text` for totals and `text-2` for secondary figures; negative values in `danger`. Never abbreviate `Rp 1.234.567` to `1,2jt` inside a table cell — abbreviate only on axis labels.
- **Bulk selection**: header checkbox with indeterminate state; selecting ≥1 row raises a **floating action bar** 16px above the viewport bottom, centered, `e4`, dark surface, showing `N dipilih`, the 2–4 allowed bulk actions, and a clear button. `Esc` clears. The bar must not cover pagination — reserve space.
- **Inline editing**: single click on an editable cell enters edit mode (input inherits cell metrics), `Enter` commits, `Esc` reverts, `Tab` moves right, blur commits, optimistic UI with a rollback toast on failure, and a subtle saving indicator on the cell. Read-only cells must look read-only.
- **Filter pills** above the table: one pill per active filter (`Gudang: Cikarang ×`), removable, plus "Hapus semua" when >1. Filters apply on change, not on a hidden "Terapkan" button — except free-text search, which applies on `Enter` with a 300ms debounce and an inline clear button.
- **Column visibility**: a "Kolom" dropdown with checkboxes, grouped, remembering the last choice per table in `localStorage`.
- **Density switcher**: segmented control `Rapat · Normal · Lega` mapping to 36/44/56px rows, persisted globally at `localStorage.ui.density`.
- **Export**: a single "Ekspor" split-button (Excel / PDF / CSV) replacing the three colored buttons. Keep the existing endpoints and `PosExportButtons` behavior; only the presentation changes.
- **Pagination**: `Menampilkan 1–25 dari 1.284` on the left, page-size select (10/25/50/100) and prev/next + page numbers on the right. Above 200 rows, paginate server-side; do not render 3.000 rows into the DOM.
- **Empty state** (inside the table body, not a separate page): icon in a 40px `surface-3` square, one-line cause, one-line next step, and the single relevant CTA. Two variants: *no data yet* ("Belum ada purchase order — buat PO pertama") and *no results for this filter* ("Tidak ada PO dengan status Draft di gudang ini — hapus filter").
- **Error state**: `danger-subtle` strip above the table with the actual message, a "Coba lagi" button, and the request id if available. Never a bare "Terjadi kesalahan".
- **Keyboard**: `j/k` next/prev row, `Enter` open, `x` toggle select, `/` focus search, `?` show shortcuts.

**4.2 Toolbar & filters**
One row, never two, unless the second row is the filter-pill row. Order: search (flex-1, max 360px) → structured filters (max 2 visible) → "Filter" popover for the rest → spacer → export → primary action. On <768px: search full width, filters collapse into a single "Filter" button with a count badge, primary action becomes a full-width sticky bottom bar.

**4.3 Complex forms & data entry**
- 12-column grid. Labels **above** inputs (never placeholder-as-label), 12px `text-2`, 600 weight, 6px gap to the field. Required fields marked with a `danger` asterisk *and* `aria-required`.
- Field widths follow content: currency 140px, qty 96px, date 148px, select 200–280px, free text 320px+. Never a 900px-wide input for a 3-character code.
- Sections separated by a 1px divider and a `title-sm` header — **not** nested cards. Max two card levels in the whole app.
- Validation: validate on blur, re-validate on change after first error, never on first keystroke. Error text replaces help text in place (no layout shift), `danger` color, 12px, with an icon; field border turns `danger`; `aria-invalid` + `aria-describedby` wired. Server errors map back to the specific field when the API returns one; otherwise a toast plus a summary strip at the top of the form.
- **Sticky bottom action bar** on every form: left side shows live impact (`Total: Rp 12.480.000 · 14 item`), right side `Batal` + primary `Simpan` (and `Simpan & kirim approval` where the workflow requires it). Backdrop blur is banned; use `surface` + top border + `e1`. It must never overlap the last field — reserve 72px of bottom padding.
- `Cmd/Ctrl+Enter` submits, `Esc` cancels (confirm if dirty), `Cmd/Ctrl+S` saves draft. Tab order follows visual order; no positive `tabindex`.
- Dirty-state guard on navigation; autosave a draft to `sessionStorage` for forms with >8 fields.
- Long pickers (customer, product, supplier) use a searchable combobox with keyboard nav and a "hasil terakhir" section — not a native `<select>` with 100+ options.
- Line-item editors: fixed column widths, a sticky subtotal row, inline qty steppers, per-line delete on hover (and always visible on touch), and an "Tambah baris" affordance that also accepts `Enter` on the last row.

**4.4 Executive dashboards & KPIs**
- **Metric card**: 11px uppercase `text-3` label + optional icon (16px, `text-3`, not a colored square) → value at `display` size, tabular, 700 → delta pill (`+12,4%` with arrow, success/danger, 11px) with the comparison period in `caption` (`vs bulan lalu`) → 40px sparkline → one text link. Whole card is one click target with a hover border change at 120ms. No gradient, no icon in a colored circle, no shadow-xl.
- KPI grid: 4-up ≥1280, 2-up ≥768, 1-up below. Equal heights, aligned baselines across the row.
- **Charts**: no chart borders, no vertical gridlines, horizontal gridlines only at 1px dashed `border`, axis labels 11px `text-3`, tooltip is an `e2` card with tabular values, legend as inline dots above the chart (max 5 series), no 3D, no gradients except a 12%-opacity area fill. Always render an explicit empty state ("Belum ada penjualan pada periode ini") and a loading skeleton with the same height to avoid layout shift.
- Every number on a dashboard must be traceable: each KPI links to the filtered list that produced it.

**5. STATUS BADGES & WORKFLOWS**

One `StatusBadge` component, driven by a single status→tone map (extend the one already in `Layout.jsx`). Shape: 20px tall, `full` radius, 11px/600, 6px dot + 6px gap + label, soft background + 1px border + same-hue dark text. **Never color-only** — the dot and the label always appear together, and the label is the human-readable Indonesian term, with the raw enum available in a `title` tooltip for support.

Canonical map (keep these keys, they exist in the backend):

| Status | Tone | Label |
|---|---|---|
| `DRAFT` | neutral | Draft |
| `SUBMITTED` | info | Diajukan |
| `PENDING` / `IN_REVIEW` | warning | Menunggu approval |
| `APPROVED` | info | Disetujui |
| `PICKING` / `PROCESSING` | info | Diproses |
| `IN_TRANSIT` / `SHIPPED` | info | Dikirim |
| `PARTIAL` | warning | Sebagian |
| `COMPLETED` | success | Selesai |
| `PAID` | success | Lunas |
| `OVERDUE` | danger | Jatuh tempo |
| `CANCELLED` | neutral (strikethrough label) | Dibatalkan |
| `ON_HOLD` | warning | Ditahan |
| `CONSIGNED` | neutral | Konsinyasi |
| `ACTIVE` | success | Aktif |
| `CLOSED` | neutral | Ditutup |
| `KRITIS` / `WASPADA` / `AMAN` (stock) | danger / warning / success | Kritis / Waspada / Aman |

Workflow affordances: the current state is always visible in the page header next to the document number; the *next allowed action* is the only primary button; disallowed transitions are hidden, not disabled-and-mysterious. Approval chains render as a compact horizontal stepper (max 4 visible, "+2" overflow) with actor, timestamp, and outcome.

**6. MICRO-INTERACTIONS & ERGONOMICS**

- Durations: `120ms` micro (hover, press, checkbox) · `160ms` standard (dropdown, tooltip) · `200ms` popover · `240ms` drawer/modal · `320ms` page transition. Nothing above 320ms.
- Easing: standard `cubic-bezier(.2,0,0,1)`; enter `cubic-bezier(.16,1,.3,1)`; exit `cubic-bezier(.4,0,1,1)`.
- Animate **only** `transform` and `opacity`. No `height`/`width` animation except a table row expansion. No bounce, no spring overshoot on enterprise actions.
- Press feedback: `scale(0.98)` + 120ms, on buttons only.
- Skeletons: match the final layout's block sizes, shimmer 1.4s linear, never a full-page spinner. First paint < 100ms of skeleton, then content.
- Toasts: bottom-right, 320px, `e3`, 4s auto-dismiss, max 3 stacked, one action max. Use `react-hot-toast` (already installed) for success/error confirmations; keep `DialogProvider` for destructive confirmations that need a decision. Never both for the same event.
- **Empty, zero-result, and error states are designed states**, not afterthoughts. Each has: an icon (24px, `text-3`), a cause line (`title-sm`), a next-step line (`caption`), and exactly one action. The zero-search-result state must echo the query and offer "Hapus filter".
- **Error boundary**: per-route boundary that keeps the shell alive, shows the route name, the error id, "Muat ulang halaman" and "Kembali ke beranda". Never a white screen.
- Optimistic UI for inline edits, row deletes, and status toggles, with a 4s undo toast where the backend allows it.
- `prefers-reduced-motion: reduce` disables all non-essential motion, including skeleton shimmer (use a static `surface-3` block).

**7. ACCESSIBILITY & INTERNATIONALISATION**

- WCAG 2.2 AA minimum. Text contrast ≥ 4.5:1, UI/border contrast ≥ 3:1, verified for both themes.
- Every interactive element has a visible `:focus-visible` ring: 2px `primary`, 2px offset, 2px radius. **The current codebase has zero `focus-visible` styles — this is a defect, not a preference.**
- Every icon-only button has an `aria-label` in Indonesian. Every icon is `aria-hidden`.
- Modals: focus trap, focus on first meaningful element, `Esc` closes, focus returns to the trigger, `aria-modal` + `aria-labelledby`.
- Tables: real `<table>` semantics, `<th scope>`, `aria-sort`, caption for screen readers.
- Forms: label association, `aria-invalid`, `aria-describedby`, error summary announced via `aria-live="polite"`.
- Touch targets ≥ 44×44 on <768px.
- Skip-link to main content; landmarks (`nav`, `main`, `aside`); `lang="id"`.
- Copy: sentence case, active voice, no jargon the staff doesn't use, no exclamation marks, no "Oops". Numbers and dates via `Intl` with `id-ID`; business dates in **WIB (UTC+7)** and labelled as such where ambiguity exists (`12 Okt 2026, 14:32 WIB`).

**8. GUARDRAILS — WHAT YOU MUST NOT BREAK**

1. **No backend changes.** No API path, payload, query param, or SQL. If a screen needs data the API doesn't return, say so; do not invent an endpoint.
2. **No route changes.** All 44 paths in `src/App.jsx` stay identical, including `/sales/orders/new` and `/sales/orders/detail/:id`.
3. **No RBAC changes.** `src/config/access.js` remains the only source of role lists. Sidebar gating, `Protected` guard, and `homeFor()` redirects must behave exactly as today.
4. **No business-logic changes.** Totals, tax (PPN 11%), discount/voucher rules, credit limits, approval thresholds, stock math, shift reconciliation — untouched. You are restyling, not rewriting.
5. **Backwards-compatible `PosUI`.** All 28 exports (19 components + 9 class constants) keep their current signatures and defaults. New primitives go in `src/components/ui/`. Existing pages must render without edits after the primitives are upgraded (a page may be migrated later, but must not crash in between).
6. **Keep code-splitting.** Every route stays `React.lazy`. No page may import another page.
7. **No new runtime dependencies.** No shadcn install, no Radix, no Headless UI, no date library, no CSS-in-JS, no icon pack other than `lucide-react`. Write the 30 lines you need (a `cx()` helper, a focus trap, a `useLocalStorage`) inside `src/components/ui/`.
8. **No Tailwind plugins.** The config is `plugins: []` and stays that way; implement variants with plain utilities and CSS variables.
9. **Don't rename Indonesian domain terms** and don't translate them to English in the UI.
10. **Don't touch** `server.js`, `src/modules/**`, `migrations/**`, `prisma/**`, `.env`, or anything under `dist/`.

**9. OUTPUT CONTRACT**

Work in this order and stop after each phase for review:

- **Phase 0 — Tokens.** `tailwind.config.js` + `src/index.css` only. Output the complete files, not a diff sketch. Include light/dark/high-contrast and the density attribute.
- **Phase 1 — Primitives.** `src/components/ui/`: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Radio`, `Switch`, `Field` (label/help/error), `Badge`, `StatusBadge`, `Card`, `Toolbar`, `FilterPill`, `SegmentedControl`, `Dropdown`, `Tooltip`, `Modal`, `Drawer`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `DataTable`, `Pagination`, `KpiCard`, `Sparkline`, `Tabs`, `Breadcrumb`. Each file: named exports, JSDoc prop types, no default export.
- **Phase 2 — Shell.** `Layout.jsx` + `SearchModal.jsx` → command palette + breadcrumb + theme/density toggles. Verify all role-based nav still hides correctly for `kasir`, `driver`, `hrd`, `purchasing`, `auditor`.
- **Phase 3 — Tables.** Migrate pages in batches of 3, highest-traffic first: `InventoryStocks`, `SalesOrders`, `PurchaseOrders`, `SalesInvoices`, `MasterProducts`, then the rest. One commit per batch.
- **Phase 4 — Forms.** `SalesOrderForm`, `StockIn`, `PurchaseRequests`, `MasterCustomers`, then the rest.
- **Phase 5 — Dashboards & polish.** `Dashboard`, `Reports`, `POS`, `Login`, plus empty/error state audit across all pages.

For every phase, return:
1. A file-by-file change list with line counts.
2. The complete code for new files; unified diffs for edited files.
3. A short "why" note per non-obvious decision (max 1 line each).
4. Any place where you had to choose between two valid options, and which you chose.
5. What you did **not** do, and why.

Do not summarize the prompt back to me. Do not produce a design essay. Produce code.

**10. ACCEPTANCE CRITERIA — the definition of done**

A screen is done only when all of these are true:

- [ ] `npm run build` passes; main bundle ≤ 300 kB (gzip ≤ 100 kB). Current baseline: 287,9 kB / 96,1 kB gzip.
- [ ] `grep -rE "#[0-9A-Fa-f]{6}" src/pages src/components` returns **zero** matches outside the token layer.
- [ ] Zero `text-[10px]`, zero `text-[9px]`, zero `rounded-[20px]`, zero `shadow-xl` / `shadow-2xl` on cards or tables.
- [ ] Every interactive element has a `focus-visible` ring; tabbing through the page never loses the cursor.
- [ ] Every table has sticky header, sort, numeric alignment, hover, empty, skeleton, pagination, and a bulk bar.
- [ ] Every form has labels above fields, inline errors, a sticky action bar, and `Cmd+Enter` submit.
- [ ] Both themes render with ≥4.5:1 text contrast; high-contrast mode is usable.
- [ ] No horizontal page scroll at 390px, 768px, 1024px, 1440px, 1920px.
- [ ] No layout shift when data loads (skeletons reserve the final height).
- [ ] All copy in Bahasa Indonesia, sentence case, no ALL-CAPS buttons.
- [ ] Lighthouse accessibility ≥ 95 on Dashboard, InventoryStocks, SalesOrderForm.
- [ ] Role smoke test passes: `admin`, `finance`, `sales`, `gudang`, `kasir`, `driver`, `hrd`, `purchasing`, `auditor` each see a coherent shell with no empty or broken nav group.
- [ ] `[EXTRA_ACCEPTANCE]`

If any criterion cannot be met, say which one and why — do not quietly ship around it.

**11. ANTI-PATTERN BLACKLIST — automatic rejection**

Gradients on buttons, headers, or cards · glassmorphism / backdrop-blur on solid surfaces · neon glows or colored shadows · emoji as icons · mixing icon sets or stroke weights (lucide only, 1.75 stroke) · more than two type sizes inside one card · `font-black` on labels · letter-spacing on body text · six different radii · five shadow depths · cards inside cards inside cards · a hero section on a data page · placeholder-as-label · validation only via toast · a modal for a 30-field form · decorative empty states without an action · animations over 320ms · bounce or parallax · truncating a SKU, document number, or money value without a tooltip · conveying status by color alone · icon buttons without `aria-label` · `shadow-xl` on every card · "Coming soon" placeholders · lorem ipsum · inventing a metric the API doesn't return.

**↑ copy sampai sini**

---

## 2. PAGE PROMPT — refactor satu halaman

Gunakan setelah §1 Fase 0–1 selesai, atau untuk halaman baru.

You are extending an existing, finished design system — not inventing one. The token layer and primitives in `src/components/ui/` are authoritative; read them before writing a single class.

**Target:** `[PAGE_FILE]` at `[ROUTE_PATH]`, entity `[PRIMARY_ENTITY]`, visible to roles `[ROLE_SCOPE]`.

**Task:** refactor this one page to the system standard. Do not touch any other file except `[PAGE_FILE]` and, if strictly necessary, a shared primitive (say so first).

Requirements:
1. Compose from existing primitives only. If something is missing, add it to `src/components/ui/` as a reusable primitive, not as page-local JSX.
2. Structure: `PageHeader` (title, one-line purpose, status badge, actions) → KPI strip (only if it answers a question the user actually has) → toolbar → `DataTable` with `[TABLE_COLUMNS]` → pagination.
3. Every money/quantity column right-aligned + tabular. Every status via `StatusBadge`. Every date via `id-ID` formatter. Every empty/loading/error state explicit.
4. Preserve: the API calls, the request params, the permission checks, and the URL. Keep `React.lazy` compatibility (default export).
5. Remove: duplicated class strings, hardcoded hex, inline `style={{}}`, local modal implementations (use `Modal`/`Drawer`), and any `text-[10px]`.
6. Keyboard: `/` focuses search, `j/k` moves rows, `Enter` opens, `Esc` closes overlays.
7. Form fields (if any): `[FORM_FIELDS]` — label above, 12-col grid, inline validation, sticky action bar with live totals.

Return: the full file, a list of primitives used, and anything you had to add to the shared layer. Do not change copy semantics unless a string is factually wrong.

---

## 3. REVIEW PROMPT — audit tanpa mengubah kode

Act as a design-system auditor. Do not write or modify code.

Input: `[CURRENT_SCREENSHOT]` or the source of `[PAGE_FILE]`.

Score each dimension 1–5 with one sentence of evidence, then give the single highest-leverage fix per dimension:

| Dimension | What "5" looks like |
|---|---|
| Hierarchy | The eye lands on the primary action and the primary number within 1 second |
| Density & rhythm | 4px grid respected; groups separated; no orphan whitespace; no cramped clusters |
| Typography | ≤2 sizes per component; tabular numbers aligned; no sub-11px text; sentence-case labels |
| Color discipline | Neutral-dominant; primary used ≤2×; semantic colors only for status; ≥4.5:1 contrast |
| Table craft | Sticky header, sort, pinned identity, right-aligned numerics, hover, empty, skeleton |
| Form craft | Labels above, inline errors, sticky actions, keyboard submit, no placeholder-as-label |
| State coverage | Loading, empty, zero-result, error, permission-denied, success all designed |
| Accessibility | Focus visible everywhere, ARIA correct, keyboard complete, no color-only meaning |
| Consistency | Same radius/shadow/spacing/control heights as the rest of the app |
| Trust | No ambiguous numbers, no missing units, no silent truncation, no fake data |

Then output:
1. **Top 5 fixes ranked by (impact ÷ effort)**, each with the exact file and the exact class/token change.
2. **What is already good and must not be lost** — be specific, this prevents regression.
3. **One structural change** that would remove the most complexity from this screen.

Be blunt. No praise sandwich. If the screen is generic, say it is generic and name the specific generic thing.

---

## Lampiran A — Audit kondisi nyata repo ini

Diukur dengan `grep`/`wc` pada 28 Okt 2026, sebelum perubahan apa pun.

| Sinyal | Angka | Artinya |
|---|---|---|
| Halaman rute | 44 (15.211 baris) | Permukaan migrasi besar; butuh primitif, bukan per-page polish |
| Halaman memakai `PosUI` | 43/44 | Design system sudah ada — tinggal dinaikkan mutunya, bukan dibuat dari nol |
| `Login.jsx` | 1 halaman | Satu-satunya halaman dengan bahasa visual sendiri |
| `<table>` mentah | 38 halaman | Tidak ada sticky header, sort, bulk select, density, column visibility, inline edit |
| Overlay `fixed inset-0` | 65 | Modal sprawl; 13 halaman mendefinisikan komponen modal sendiri |
| Hex unik | 44 warna | Tidak ada token layer; 5 nilai slate dipakai 2.470× (`#64748B` 813×, `#E2E8F0` 564×, `#1E40AF` 440×, `#F8FAFC` 356×, `#0F172A` 297×) |
| `text-[11px]` / `text-[10px]` | 654× / 115× | Micro-type sebagai default, bukan pengecualian |
| `rounded-[20px]` | 183× | Satu radius blob untuk semua peran |
| `shadow-sm` / `shadow-xl` / `shadow-2xl` | 93 / 46 / 8 | Elevasi tidak bermakna |
| `tabular-nums` | 211× | **Sudah benar** — pertahankan dan jadikan wajib |
| `dark:` | 0 | Tidak ada dark mode |
| `focus-visible` | 0 | Tidak ada focus ring — cacat aksesibilitas |
| `aria-*` | 17 total di 15k baris | Aksesibilitas nyaris tidak ada |
| `motion` | 0 import (paket terpasang) | Animasi belum dipakai; hanya satu keyframe `.animate-pop` 180ms |
| `react-hot-toast` | 1 halaman | Toast terpasang tapi tidak dipakai; notifikasi lewat `DialogProvider` |
| Recharts | 2 halaman | Grafik belum jadi bahasa visual produk |

**Yang sudah bagus dan wajib dipertahankan:** primitif `PosUI` sebagai satu lapisan bersama; `tabular-nums` di angka; `React.lazy` per rute; RBAC satu sumber di `src/config/access.js`; `DialogProvider` berbasis promise; health ping nyata ke `/api/health`; notifikasi sadar-role; label berbahasa Indonesia yang konsisten dengan istilah lapangan.

**Tiga akar masalah, bukan gejala:**
1. **Tidak ada token layer** → 44 hex tersebar, 183 radius identik, 151 utilitas shadow tanpa hierarki. Setiap halaman "menyelesaikan" desainnya sendiri.
2. **Tabel dirakit ulang 38 kali** → tidak ada satu pun yang punya sort, pinned column, bulk action, atau density. Ini biaya terbesar bagi operator.
3. **Tidak ada state kontrak** → loading/empty/error dibuat ad hoc per halaman, dan aksesibilitas (0 focus ring, 17 aria) tidak pernah menjadi bagian dari definisi selesai.

---

## Lampiran B — Token drop-in

### B.1 `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ---------- design tokens (channel triplets so Tailwind alpha works) ---------- */
:root {
  --bg: 247 248 250;
  --surface: 255 255 255;
  --surface-2: 244 246 248;
  --surface-3: 237 240 244;
  --border: 228 231 236;
  --border-strong: 208 213 221;
  --text: 16 24 40;
  --text-2: 71 84 103;
  --text-3: 102 112 133;
  --text-disabled: 152 162 179;

  --primary: 30 64 175;
  --primary-hover: 27 58 156;
  --primary-active: 23 48 127;
  --primary-subtle: 238 243 255;
  --primary-border: 199 213 254;
  --primary-contrast: 255 255 255;

  --success: 6 118 71;      --success-subtle: 236 253 243;  --success-border: 171 239 198;
  --warning: 181 71 8;      --warning-subtle: 255 250 235;  --warning-border: 254 223 137;
  --danger: 180 35 24;      --danger-subtle: 254 243 242;   --danger-border: 254 205 202;
  --info: 2 106 162;        --info-subtle: 240 249 255;     --info-border: 185 230 254;
  --neutral: 52 64 84;      --neutral-subtle: 242 244 247;  --neutral-border: 228 231 236;

  --ring: 30 64 175;
  --radius-card: 12px;
  --radius-control: 6px;
  --radius-modal: 16px;
  --row-h: 44px;
  --control-h: 36px;
}

[data-theme="dark"] {
  --bg: 11 15 25;
  --surface: 17 23 38;
  --surface-2: 22 29 46;
  --surface-3: 29 37 56;
  --border: 35 43 61;
  --border-strong: 47 57 78;
  --text: 231 234 240;
  --text-2: 163 173 194;
  --text-3: 124 135 158;
  --text-disabled: 90 100 120;

  --primary: 123 155 255;
  --primary-hover: 147 174 255;
  --primary-active: 169 190 255;
  --primary-subtle: 22 33 63;
  --primary-border: 42 61 107;
  --primary-contrast: 11 15 25;

  --success: 117 224 167;  --success-subtle: 6 40 27;   --success-border: 14 74 51;
  --warning: 253 176 34;   --warning-subtle: 42 28 5;   --warning-border: 78 52 8;
  --danger: 253 162 155;   --danger-subtle: 42 18 21;   --danger-border: 85 22 12;
  --info: 124 212 253;     --info-subtle: 6 40 61;      --info-border: 11 74 111;
  --neutral: 208 213 221;  --neutral-subtle: 29 37 56;  --neutral-border: 47 57 78;

  --ring: 123 155 255;
}

[data-contrast="high"] {
  --bg: 255 255 255; --surface: 255 255 255; --surface-2: 255 255 255; --surface-3: 255 255 255;
  --border: 0 0 0; --border-strong: 0 0 0;
  --text: 0 0 0; --text-2: 26 26 26; --text-3: 51 51 51; --text-disabled: 90 90 90;
  --primary: 0 51 204; --primary-hover: 0 34 153; --primary-subtle: 255 255 255; --primary-border: 0 0 0;
  --success-subtle: 255 255 255; --warning-subtle: 255 255 255; --danger-subtle: 255 255 255; --info-subtle: 255 255 255;
  --ring: 0 0 0;
}
[data-theme="dark"][data-contrast="high"] {
  --bg: 0 0 0; --surface: 0 0 0; --surface-2: 0 0 0; --surface-3: 0 0 0;
  --border: 255 255 255; --border-strong: 255 255 255;
  --text: 255 255 255; --text-2: 235 235 235; --text-3: 210 210 210;
  --primary: 153 179 255; --primary-subtle: 0 0 0; --primary-border: 255 255 255; --ring: 255 255 255;
}

[data-density="compact"]    { --row-h: 36px; --control-h: 32px; }
[data-density="comfortable"]{ --row-h: 56px; --control-h: 40px; }

@layer base {
  html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  body {
    background: rgb(var(--bg));
    color: rgb(var(--text));
    font-family: 'Inter Variable', Inter, system-ui, sans-serif;
    font-size: 14px; line-height: 20px;
    font-feature-settings: "cv05" 1, "ss01" 1;
  }
  .num, td.num, input.num { font-variant-numeric: tabular-nums lining-nums; }
  .mono { font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace; }

  :focus-visible { outline: 2px solid rgb(var(--ring)); outline-offset: 2px; border-radius: 4px; }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgb(var(--border-strong)); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-track { background: transparent; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
}
```

### B.2 `tailwind.config.js`

```js
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: { DEFAULT: c('surface'), 2: c('surface-2'), 3: c('surface-3') },
        line: { DEFAULT: c('border'), strong: c('border-strong') },
        ink: { DEFAULT: c('text'), 2: c('text-2'), 3: c('text-3'), disabled: c('text-disabled') },
        primary: {
          DEFAULT: c('primary'), hover: c('primary-hover'), active: c('primary-active'),
          subtle: c('primary-subtle'), border: c('primary-border'), contrast: c('primary-contrast'),
        },
        success: { DEFAULT: c('success'), subtle: c('success-subtle'), border: c('success-border') },
        warning: { DEFAULT: c('warning'), subtle: c('warning-subtle'), border: c('warning-border') },
        danger:  { DEFAULT: c('danger'),  subtle: c('danger-subtle'),  border: c('danger-border') },
        info:    { DEFAULT: c('info'),    subtle: c('info-subtle'),    border: c('info-border') },
        neutral: { DEFAULT: c('neutral'), subtle: c('neutral-subtle'), border: c('neutral-border') },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '16px' }],
        'body-sm': ['13px', { lineHeight: '20px' }],
        body: ['14px', { lineHeight: '20px' }],
        'title-sm': ['16px', { lineHeight: '24px', letterSpacing: '-0.005em', fontWeight: '600' }],
        title: ['18px', { lineHeight: '26px', letterSpacing: '-0.01em', fontWeight: '650' }],
        'title-lg': ['22px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '700' }],
        display: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
      spacing: { 1.5: '6px', 2.5: '10px', 3.5: '14px', 4.5: '18px', 7.5: '30px' },
      boxShadow: {
        e1: '0 1px 2px rgba(16,24,40,.06)',
        e2: '0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.04)',
        e3: '0 12px 24px -6px rgba(16,24,40,.10), 0 4px 8px -4px rgba(16,24,40,.05)',
        e4: '0 24px 48px -12px rgba(16,24,40,.18)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        enter: 'cubic-bezier(.16,1,.3,1)',
        exit: 'cubic-bezier(.4,0,1,1)',
      },
      transitionDuration: { 120: '120ms', 160: '160ms', 200: '200ms', 240: '240ms', 320: '320ms' },
      zIndex: { sticky: '10', header: '20', sidebar: '30', dropdown: '40', overlay: '50', modal: '60', palette: '70', toast: '80', tooltip: '90' },
      maxWidth: { workspace: '1600px' },
    },
  },
  plugins: [],
};
```

**Catatan migrasi:** `bg-white` → `bg-surface`, `border-[#E2E8F0]` → `border-line`, `text-[#0F172A]` → `text-ink`, `text-[#64748B]` → `text-ink-2`, `text-[#94A3B8]` → `text-ink-3`, `bg-[#F8FAFC]` → `bg-surface-2`, `bg-[#F1F5F9]` → `bg-surface-3`, `rounded-[20px]` → `rounded-lg`, `bg-[#1E40AF]` → `bg-primary`.

---

## Lampiran C — Rollout yang dipetakan ke file asli

| Fase | File | Risiko | Kenapa urutannya begini |
|---|---|---|---|
| **0. Token** | `tailwind.config.js`, `src/index.css` | Rendah | Semua fase berikutnya bergantung pada nama token. Tanpa ini, setiap halaman akan mengarang hex baru. |
| **1. Primitif** | `src/components/ui/*` (baru), `PosUI.jsx` (re-export) | Sedang | 43 halaman memakai `PosUI`; alias harus tetap jalan sebelum halaman disentuh. |
| **2. Shell** | `Layout.jsx`, `SearchModal.jsx` → `CommandPalette.jsx` | Sedang | Shell terlihat di semua halaman; harus selesai sebelum migrasi massal agar tidak ada dua bahasa visual. |
| **3. Tabel** | `InventoryStocks`, `SalesOrders`, `PurchaseOrders`, `SalesInvoices`, `MasterProducts`, lalu 33 sisanya | Tinggi (38 file) | Dampak terbesar ke operator; kerjakan 3 per commit agar `git bisect` tetap berguna. |
| **4. Form** | `SalesOrderForm`, `StockIn`, `PurchaseRequests`, `MasterCustomers`, `Settings` | Tinggi | Form menyentuh perhitungan; jangan pernah mengubah total/pajak, hanya presentasinya. |
| **5. Dashboard & POS** | `Dashboard`, `Reports`, `POS`, `Login` | Sedang | Butuh primitif KPI + chart yang sudah stabil. |
| **6. Audit state** | Semua 44 halaman | Rendah | Sapu bersih: loading, empty, zero-result, error, permission-denied, dark mode, 390px. |

**Gerbang kualitas per fase** (jalankan sebelum lanjut):

```bash
npm run build                                   # wajib lulus
grep -rE "#[0-9A-Fa-f]{6}" src/pages src/components | wc -l   # target: 0
grep -ro "text-\[10px\]\|rounded-\[20px\]" src | wc -l        # target: 0
grep -ro "focus-visible" src | wc -l                          # target: > 0 dan naik tiap fase
```

**Jebakan yang sudah diketahui di repo ini:**
- `src/components/PosUI.jsx` dipakai 43 halaman — ubah satu prop tanpa default dan semuanya pecah. Selalu beri nilai default.
- `Layout.jsx` menyembunyikan heading grup nav yang semua itemnya tidak punya akses. Perubahan markup sidebar harus mempertahankan logika `visibleNav` apa adanya.
- `Badge` di `Layout.jsx` punya peta status sendiri, terpisah dari `PosBadge` di `PosUI.jsx`. Satukan ke satu `StatusBadge` — kalau tidak, dua sumber kebenaran akan cepat berbeda.
- `Login.jsx` tidak memakai `PosUI` sama sekali; ia perlu migrasi manual dan tidak boleh memakai komponen tabel.
- `dist/` dan `:5174` adalah build lama — verifikasi selalu di `:5173` (Vite dev) atau build baru, jangan di dist lama.
