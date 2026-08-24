# PrintBee

PrintBee is a full-stack local A4 printing and delivery platform. Customers upload documents, configure print jobs, pay online, and track delivery. Administrators manage pricing, services, operations, riders, payments, delivery settings, revenue, and the business ledger.

## Key features

- PDF, image, and HEIC upload with automatic page counting and chunked upload support.
- Configurable print services, A4 prices, double-sided printing, binding instructions, packaging, and add-on products.
- GPS-assisted checkout with editable reverse-geocoded delivery address.
- Store-to-customer distance delivery calculation with configurable base fee and per-100-metre charge.
- Global configurable platform fee, surge, late-night, packaging, and gateway fee controls.
- In-campus delivery: an additional ₹10 charge for classroom or hostel delivery. Classroom orders require building and room number; hostel orders require building name.
- Razorpay payment flow, payment review, payment QR, customer wallet points, referrals, invoices, feedback, and order tracking.
- Admin dashboard for orders, riders, services, operations, revenue, exports, notifications, and ledger reporting.
- Delivery partner portal with assigned orders, customer call and navigation links, delivery OTP verification, earnings, withdrawals, and a permanent Navigate to store link.

## Technology

- React + TypeScript through Vinext.
- Cloudflare-compatible runtime hosted with OpenAI Sites.
- Cloudflare D1 / SQLite for persistent operational data, with Drizzle migrations in `drizzle/`.
- Cloudflare R2 for uploaded customer documents.
- Supabase authentication and Razorpay checkout integration.

## Delivery details

Normal deliveries use the customer’s GPS point to calculate distance from the admin-configured store location. Customers review and edit their address before payment.

For in-campus delivery, checkout displays this instruction:

> Please enter class room number and building name for university classrooms, enter only building name for hostels.

The campus destination details are stored on the order and shown to both Admin and the assigned delivery partner.

## Local development

Prerequisites: Node.js 22 or newer.

```bash
npm install
npm run dev
npm run build
```

The project uses logical `DB` (D1) and `FILES` (R2) bindings defined in `.openai/hosting.json`. Database changes are delivered as committed SQL migrations.

## Project layout

- `app/` — customer, admin, and delivery partner application UI plus API routes.
- `db/schema.ts` — Drizzle schema definitions.
- `drizzle/` — versioned D1 migrations.
- `public/` — static brand and application assets.
- `.openai/hosting.json` — hosting project and storage binding declarations.

## Production

The public application is available at [www.printbee.co.in](https://www.printbee.co.in).
