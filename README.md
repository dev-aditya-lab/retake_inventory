# Retake — Inventory & Billing System

Inventory management and billing/invoicing platform for Retake (spice manufacturer).

## Structure

- `frontend/` — Next.js (App Router) + TypeScript + Tailwind + Redux Toolkit
- `backend/` — Node.js + Express + TypeScript + MongoDB (Mongoose) + Redis
- `.claude/project info/` — product spec, EAN-13 barcode scheme, product seed CSV, brand logo

The full implementation plan (phased) lives at `.claude/CLAUDE.md` context and was tracked during
development in the assistant's plan file; see git history / commit messages for phase-by-phase progress.

## Prerequisites

- Node.js 20+ and npm
- A MongoDB Atlas cluster (or local MongoDB) connection string
- A Redis instance (local `redis-server`, or a hosted instance for prod)
- Cloudinary account (product images)
- WhatsApp Meta Cloud API credentials (digital invoice delivery)
- Resend account (transactional email)

## Backend setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in real values — .env is gitignored, .env.example is NOT
npm run dev             # starts on http://localhost:5000
```

Useful scripts:
- `npm run dev` — start with hot reload (tsx watch)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled build
- `npm test` — run backend unit tests (vitest)
- `npm run lint` — lint

**Never put real secrets in `.env.example`** — it's committed to git. Real credentials go only in
`backend/.env`.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local   # if/when frontend env vars are introduced
npm run dev                   # starts on http://localhost:3000
```

The frontend expects the backend to be reachable (default `http://localhost:5000`) and calls
`/health` on the backend to confirm connectivity.

## Brand / config

Centralized company details (name, address, GSTIN, logo, etc.) live in one place per app and should
be the only source of truth for invoice/footer/PWA copy:
- `backend/src/config/company.ts`
- `frontend/src/config/company.ts`

Update the placeholder fields there with Retake's real registered business details before going to
production (invoices with a placeholder GSTIN are not valid for GST filing).

## Barcode scheme

Product EAN-13 barcodes are generated from category/product/weight codes documented in
`.claude/project info/project.md`, and are never stored as images — they're rendered on demand from
product data (`jsbarcode` + `canvas` on the backend). `product.csv` in the same folder is the seed
data source for the initial product catalog (see the Phase 2 seed script).

Each spice's SKU code (`TUR`) and barcode product ID (`001`) live in the database and are managed by
admins on the **SKU codes** page; HSN/SAC codes likewise on the **HSN codes** page. The starter code
list is in `backend/src/config/defaultCatalogCodes.ts`, seeded once.

## Data migrations

One-time data migrations in `backend/src/migrations` run automatically on backend start (each at most
once per database, tracked in the `migrations` collection). The first boot after this was added seeds
the SKU code list, fills the HSN list from codes already on products, and builds the customer
directory from past invoices.

## GST (tax invoices, GSTR-1, GSTR-3B)

Every bill is a GST tax invoice (CGST Rule 46). Rules live in `backend/src/config/gst.ts`; the tax
maths in `backend/src/utils/gstCalc.ts`; the GSTR-1 file builder in `backend/src/utils/gstr1.ts`
(all unit-tested).

- **Pricing:** a buyer with a GSTIN is B2B — the product's B2B price (excl. GST) + GST on top. Everyone
  else is retail — the MRP, with the GST worked out inside it. Each product needs an HSN code
  (4+ digits), GST rate, unit (UQC) and MRP; the **GST → Setup check** page lists what's missing and
  fixes HSN/rate in bulk.
- **Place of supply:** the shop's state (`company.stateCode`, must match the GSTIN) unless the buyer's
  GSTIN or recorded address is in another state → CGST+SGST or IGST is decided automatically.
- **Numbers:** `RTK-YYMMDD-NNNN` bills, `CN-YYMMDD-NNNN` credit notes — within GST's 16-character limit,
  dated in India time whatever the server's time zone.
- **Filing:** GST → GSTR-1 → download the JSON → gst.gov.in → GSTR-1 → Prepare Offline → Upload → file
  with EVC/DSC → back in the app, **Mark as filed**. The download is refused while anything would make
  the portal reject it.
- **After filing** a month its bills lock. Returns and deletions become credit notes (reported in the
  month they're issued); credit notes are allowed until 30 Nov after the sale's financial year.
- **GSTR-3B:** its sales tables auto-fill from GSTR-1 on the portal (locked since July 2025); the GST
  page shows the same figures to check. Input tax credit comes from GSTR-2B on the portal — this app
  doesn't record purchases.
- Not covered: e-invoicing/IRN (only needed above ₹5 crore turnover), e-way bills, nil-rated/exempt
  sales (GSTR-1 Table 8), exports.
