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
