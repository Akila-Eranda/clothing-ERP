# HexaOne — Sales AI Agent Knowledge Pack

Self-contained English documentation for a sales AI agent that qualifies retail customers, recommends the right business vertical and plan, and creates HexaOne tenant accounts via the public registration API.

**Product name:** HexaOne (Hexalyte)  
**API base:** `https://shop.clothing.api.hexalyte.com/api/v1`  
**Tenant workspace pattern:** `https://{subdomain}.shop.hexalyte.com`

Load this entire file into the agent's context. Operational sections to prioritize: **Registration API**, **Agent Playbook**, **Business Types**, then **Limitations**.

All values are derived from live code under `apps/api` and `apps/web`. If code and docs disagree, trust the code and update this file.

---

# 1. System Overview

## What HexaOne is

HexaOne is a **multi-tenant retail ERP** for small and medium shops. It combines POS billing, inventory (including batch/expiry), purchasing, CRM/loyalty, double-entry accounting, HR/payroll, and specialized automotive/tyre workshop workflows in one SaaS product. Each customer gets an isolated workspace on their own subdomain.

It is **not** a manufacturing ERP, restaurant POS, pharmacy prescription system, or ecommerce storefront builder. Position it as a multi-vertical retail business system.

## Target customer

- Sri Lankan (and similar) retail SMEs: clothing shops, groceries, hardware stores, agri shops, spare-parts dealers, tyre workshops, bakeries, and general retail.
- Owners who need barcode POS, stock control, supplier purchasing, and optionally accounting / payroll.
- Typical first conversation: 1 shop, a few cashiers, hundreds to a few thousand SKUs → **Starter** plan with 7-day trial.

## Domains and URLs

| Purpose | URL pattern |
|---|---|
| Marketing / portal | `https://shop.hexalyte.com` |
| Tenant workspace (web app) | `https://{subdomain}.shop.hexalyte.com` |
| Tenant login page | `https://{subdomain}.shop.hexalyte.com/login` |
| Public self-serve register | `https://shop.hexalyte.com/register` |
| REST API | `https://shop.clothing.api.hexalyte.com/api/v1` |
| Platform (super-admin) console | `https://admin3.hexalyte.com` |
| Keycloak (optional SSO) | `https://auth.hexalyte.com` (realm `fashion-erp`) |

After registration, always give the customer: `https://{subdomain}.shop.hexalyte.com/login`.

## Multi-tenant model

- One **Tenant** = one customer business (company + subdomain + plan + shop type).
- One tenant can have multiple **Branches** (limited by plan: Starter 1, Professional 3, Enterprise unlimited).
- Each branch can have **Warehouses**; inventory is tracked per warehouse + variant (and batch/lot when enabled).
- Users belong to a tenant (and optionally a default branch). Roles: Tenant Admin, Branch Manager, Cashier, plus custom roles.
- Tenant isolation is enforced by `x-tenant-id` header and/or host `{subdomain}.shop.hexalyte.com`.

## Tech stack (one line)

Next.js 15 + NestJS 10 REST API + PostgreSQL 16 (Prisma) + Redis/BullMQ + JWT auth (+ optional Keycloak) + Docker/NGINX on a VPS.

## Plans at a glance

| Plan key | Price | Trial | Users | Branches | Products |
|---|---|---|---|---|---|
| `STARTER` | Rs. 1,199 / mo | 7 days free | 3 | 1 | 500 |
| `PROFESSIONAL` | Rs. 4,799 / mo | none (ACTIVE immediately) | 10 | 3 | 5,000 |
| `ENTERPRISE` | Rs. 14,399 / mo | none | unlimited | unlimited | unlimited |
| `CUSTOM` | negotiated | — | negotiated | negotiated | negotiated |

Public self-serve signup hard-codes `STARTER`. The sales agent may pass any plan the API accepts (`STARTER` | `PROFESSIONAL` | `ENTERPRISE` | `CUSTOM`). Registration does **not** collect payment — a human must follow up for paid plans.

## Business verticals at a glance

`CLOTHING` · `GROCERY` · `HARDWARE` · `AGRICULTURE` · `SPARE_PARTS` · `TIRE_SHOP` · `GENERAL` · `BAKERY`

Vertical choice is made at registration (`shopType`) and controls which modules are authorized. See **Business Types** below.

---

# 2. Feature Catalog

Use this to answer “does it have X?” — and cross-check **Limitations** before promising anything not listed here.

## Selling & POS

| Feature | Customer benefit |
|---|---|
| POS billing | Fast counter sales with barcode / SKU lookup |
| Weighted products | Sell by kg/g with gram-entry popup (grocery/bakery) |
| Discounts & taxes | Line/bill discounts and tax on the till |
| Split / partial payments | Cash + card + multiple methods on one bill |
| Held bills | Park a bill and resume later |
| Returns from POS / sales | Process customer returns and restore stock (when vertical allows) |
| Gift vouchers | Issue and redeem vouchers as payment |
| Cashier PIN / counters | Switch cashiers, open/close shifts, day-end summary |
| Customer display route | Optional secondary screen (`/pos/customer-display`) |

## Inventory & Stock

| Feature | Customer benefit |
|---|---|
| Product catalog | Products, categories, brands, variants/SKUs/barcodes |
| Warehouses | Multiple warehouses per branch |
| Stock ledger | Full movement history |
| Adjustments & cycle counts | Correct stock with controlled sessions |
| ABC / dead stock / aging | Identify slow and aging inventory |
| Batch & expiry (FEFO/FIFO) | Lots, manufacture/expiry dates, block expired sales (grocery, agri, bakery, etc.) |
| Stock transfers | Branch-to-branch and warehouse-to-warehouse |
| Barcode labels | CODE128 stickers, shelf labels, hang tags (clothing) |

## Purchasing & Suppliers

| Feature | Customer benefit |
|---|---|
| Suppliers | Supplier master, balances, ledger |
| Purchase orders | Create, approve, receive (GRN) |
| Procurement | Purchase requests, quick/direct GRN, supplier invoices |
| Supplier returns / debit notes | Return goods to supplier |
| Supplier payments (AP) | Pay suppliers, allocate to invoices, aging |
| Reorder suggestions | Help restock based on sales/stock |

## Customers & Loyalty

| Feature | Customer benefit |
|---|---|
| CRM | Customer records, history, segments/tiers |
| Loyalty points | Earn and redeem (enabled for selected verticals) |
| Wallet / store credit | Credit balance, schedules, reminders |
| Promotions & coupons | %, fixed, buy-X-get-Y style rules (when vertical allows) |

## Accounting & Finance

| Feature | Customer benefit |
|---|---|
| Chart of accounts | Seeded CoA on signup |
| Journals & posting | Double-entry bookkeeping |
| Trial balance / P&L / balance sheet / cash flow | Standard financial reports |
| AR / AP | Customer receivables and supplier payables |
| Banking | Bank/cash accounts, transfers, cheque register, reconciliation |
| VAT / tax | Tax rates, VAT reports and return workflow |
| Petty cash & expenses | Funds, claims, reimbursements |
| Fixed assets | Categories, depreciation, asset transactions |
| Advanced accounting | Cost centers, budgets, recurring journals, exchange rates |
| Document number series | Auto numbers for invoices, POs, GRNs, payslips, etc. |

## HR & Payroll

| Feature | Customer benefit |
|---|---|
| Employees | Staff records and shifts |
| Attendance & leave | Daily/bulk attendance, leave approval |
| Payroll | Components, runs, payslips, print settings |

## Reporting & Analytics

| Feature | Customer benefit |
|---|---|
| Dashboard KPIs | Revenue, profit, inventory, branch performance |
| Sales / purchase / stock reports | Day-to-day operational reports |
| Expiry / cheque / commission / tax / cashier / branch reports | Specialized retail reports |
| Notifications | In-app low-stock, reorder, expiry, dues, PO/GRN alerts |

## Automotive & Workshop (vertical-gated)

| Feature | Customer benefit | Verticals |
|---|---|---|
| Vehicles / compatibility | Fit parts to makes/models / VIN-oriented lookup | `SPARE_PARTS`, `TIRE_SHOP` |
| Warranty tracking | Track warranties on parts/tyres | `SPARE_PARTS`, `TIRE_SHOP` |
| Quotations | Quote before sale | Hardware, spare parts, tyre, general, bakery |
| Workshop / job cards | Service jobs for tyre/workshop | `TIRE_SHOP` |
| Appointments | Book workshop slots | `TIRE_SHOP` |

## Platform & Admin

| Feature | Customer benefit |
|---|---|
| Multi-branch users & RBAC | Roles: Tenant Admin, Branch Manager, Cashier + custom |
| Workflow approvals | Multi-step approvals for purchases, discounts, stock moves |
| Audit logs | Who did what |
| Settings | POS rules, receipt branding, payslip layout, shop profile |
| WhatsApp (Baileys) | Connect via QR; send text / bill summaries |
| Files | Upload to local / S3 / Cloudflare R2 |
| Calendar | Tasks and meetings |

## Real integrations (implemented)

- **WhatsApp Web (Baileys)** — per-tenant QR session; text and invoice-summary sending.
- **SMTP email** — welcome, password reset, subscription invoices.
- **Thermal / receipt printing** — browser print + optional local print server (`services/print-server`, typically port 9123).
- **Barcode labels** — CODE128 via jsbarcode; sticker / shelf / hang-tag templates.
- **Barcode scanners** — keyboard-wedge into POS search.
- **Weighted selling** — manual gram/kg entry (no USB scale driver).
- **Object storage** — local, AWS S3, or Cloudflare R2.
- **CSV / Excel** — import/export utilities for accounts and reports.
- **WebSockets + Redis queues** — realtime and background jobs.
- **Optional Keycloak SSO** — secondary login path; primary login is local JWT.

## What the customer sees (UI map, condensed)

**Auth / public:** `/`, `/features`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pos/customer-display`

**Daily ops:** `/dashboard`, `/pos`, `/sales`, `/returns`, `/customers`, `/products`, `/categories`, `/brands`, `/inventory` (+ ledger, ABC, dead-stock, aging, transfers, expiry*), `/warehouse`, `/suppliers`, `/purchases` (+ GRN, procurement, supplier payments), `/quotations`*, `/promotions`*, `/cash`, `/expenses`, `/branches`, `/users`, `/workflows`, `/calendar`, `/notifications`, `/settings`

**Automotive (when enabled):** `/vehicles`, `/warranty`, `/services`, `/job-cards`, `/appointments`

**HR:** `/hr`, `/hr/attendance`, `/hr/payroll`, `/hr/leaves`

**Accounting:** `/accounting` and sub-routes for accounts, journals, AR/AP, banking, VAT, petty cash, fixed assets, periods, advanced

**Reports:** `/reports` and sales / purchases / inventory / suppliers / customers / cashier / branches / tax / expiry / cheques / commission / financial

**Platform admin (Hexalyte staff only):** `/admin/*` on `admin3.hexalyte.com`

\*Sidebar hides vertical-inapplicable routes automatically.

## Plan feature labels vs reality

Plan catalog marketing lines (“Analytics”, “HR module”, “API Access”, “White-label”) are **descriptive**. Concrete enforcement is:

- User / branch / product **limits**
- Tenant **status** (TRIAL / ACTIVE / SUSPENDED / …)
- Vertical **module flags** from `shopType`

Do not tell a Starter customer that HR or analytics are locked by plan unless you have confirmed a hard gate in code. Prefer: “Starter includes core POS and inventory within the limits below; Professional raises limits and is the usual choice for multi-branch / larger teams.”

---

# 3. Business Types (Shop Verticals)

## Critical rule

`shopType` is chosen at registration and drives **real backend authorization** (returns, promotions, loyalty, vehicles, warranty, quotations, workshop, appointments, and related UI). Getting it wrong means the customer cannot use features they expected. Prefer asking clarifying questions before registering.

Exact enum values to send in `POST /tenants/register`:

`CLOTHING` · `GROCERY` · `HARDWARE` · `AGRICULTURE` · `SPARE_PARTS` · `TIRE_SHOP` · `GENERAL` · `BAKERY`

Default if omitted: `CLOTHING`.

Module keys (14): `brands`, `collections`, `hangTags`, `variants`, `returns`, `promotions`, `loyalty`, `expiry`, `batch`, `vehicles`, `warranty`, `quotations`, `workshop`, `appointments`.

## CLOTHING — Clothing Shop

- **Fits:** Apparel, fashion, boutiques.
- **Description:** Sizes, colors, hang tags.
- **Default unit:** `pcs` · **Units:** `pcs`
- **Default categories seeded:** Men's Wear, Women's Wear, Kids' Wear, Accessories, Footwear
- **Variant attributes:** Size (XS–XXL), Color (Black, White, Navy, Red, Blue, Green)
- **Modules ON:** brands, collections, hangTags, variants, returns, promotions, loyalty
- **Modules OFF:** expiry, batch, vehicles, warranty, quotations, workshop, appointments
- **Labels:** sticker, hangtag

## GROCERY — Grocery Shop

- **Fits:** Supermarket, mini-mart, provision store.
- **Description:** Weight, volume, expiry tracking.
- **Default unit:** `kg` · **Units:** pcs, kg, g, L, ml
- **Default categories:** Fresh Produce, Dairy & Eggs, Beverages, Snacks, Frozen Foods, Household
- **Variant attributes:** Weight (250g, 500g, 1kg, 2kg, 5kg)
- **Modules ON:** brands, variants, returns, promotions, expiry, batch
- **Modules OFF:** collections, hangTags, loyalty, vehicles, warranty, quotations, workshop, appointments
- **Labels:** sticker, shelf

## HARDWARE — Hardware Shop

- **Fits:** Tools, plumbing, electrical, building materials.
- **Default unit:** `pcs` · **Units:** pcs, piece, kg, feet, meter, box, set, roll
- **Default categories:** Tools, Electrical, Plumbing, Paint, Building Materials, Safety Gear
- **Variant attributes:** Size (Small/Medium/Large/10mm/12mm/20mm), Material (Steel, Brass, PVC, Copper, Aluminium)
- **Modules ON:** brands, variants, returns, quotations
- **Modules OFF:** collections, hangTags, promotions, loyalty, expiry, batch, vehicles, warranty, workshop, appointments
- **Labels:** sticker, shelf

## AGRICULTURE — Agriculture Shop

- **Fits:** Seeds, fertilizer, pesticides, farm equipment.
- **Default unit:** `kg` · **Units:** kg, bag, pcs, liter, acre
- **Default categories:** Seeds, Fertilizer, Pesticides, Equipment, Animal Feed, Irrigation
- **Variant attributes:** Weight (1–50kg), Grade (Grade A/B, Premium, Standard)
- **Modules ON:** brands, variants, returns, expiry, batch
- **Modules OFF:** collections, hangTags, promotions, loyalty, vehicles, warranty, quotations, workshop, appointments
- **Labels:** sticker, shelf

## SPARE_PARTS — Spare Parts Shop

- **Fits:** Auto spare parts dealers (parts focus, not full workshop).
- **Default unit:** `pcs` · **Units:** pcs, set, pair, box, liter
- **Default categories:** Engine Parts, Brakes & Suspension, Filters, Electrical, Body Parts, Lubricants, Accessories
- **Variant attributes:** OEM No, Part Type (OEM, Aftermarket, Genuine)
- **Modules ON:** brands, variants, returns, promotions, loyalty, batch, vehicles, warranty, quotations
- **Modules OFF:** collections, hangTags, expiry, workshop, appointments
- **Labels:** sticker, shelf

## TIRE_SHOP — Tyre Shop

- **Fits:** Tyre & rim shops with fitment / workshop / fleet.
- **Default unit:** `pcs` · **Units:** pcs, set, pair, box
- **Default categories:** Passenger Tyres, SUV & 4x4 Tyres, Commercial Tyres, Rims & Wheels, Accessories
- **Variant attributes:** Tyre Size (e.g. 205/55R16), Season (All Season/Summer/Winter), Tube Type (Tubeless/Tube)
- **Modules ON:** brands, variants, returns, promotions, loyalty, batch, vehicles, warranty, quotations, workshop, appointments
- **Modules OFF:** collections, hangTags, expiry
- **Labels:** sticker, shelf

## GENERAL — General Shop

- **Fits:** Mixed retail when no specialized vertical fits.
- **Default unit:** `pcs` · **Units:** pcs, set, pair, box, kg, pack
- **Default categories:** General Merchandise, Electronics, Home & Living, Health & Beauty, Stationery, Other
- **Variant attributes:** Size (Small/Medium/Large/Standard), Variant (Standard/Premium/Economy)
- **Modules ON:** brands, variants, returns, promotions, loyalty, quotations
- **Modules OFF:** collections, hangTags, expiry, batch, vehicles, warranty, workshop, appointments
- **Labels:** sticker, shelf

## BAKERY — Cake House / Bakery

- **Fits:** Cake houses, bakeries, pastry shops.
- **Default unit:** `pcs` · **Units:** pcs, kg, g, box, pack, L, ml
- **Default categories:** Cakes, Cupcakes, Pastries, Bread, Beverages, Ingredients, Custom Orders
- **Variant attributes:** Size (500g–2kg, Box of 6/12), Flavour (Chocolate, Vanilla, Strawberry, Red Velvet, Butter, Black Forest)
- **Modules ON:** brands, variants, returns, promotions, loyalty, expiry, batch, quotations
- **Modules OFF:** collections, hangTags, vehicles, warranty, workshop, appointments
- **Labels:** sticker, shelf

## Module matrix (quick reference)

| Module | CLOTHING | GROCERY | HARDWARE | AGRICULTURE | SPARE_PARTS | TIRE_SHOP | GENERAL | BAKERY |
|---|---|---|---|---|---|---|---|---|
| brands | Y | Y | Y | Y | Y | Y | Y | Y |
| collections | Y | — | — | — | — | — | — | — |
| hangTags | Y | — | — | — | — | — | — | — |
| variants | Y | Y | Y | Y | Y | Y | Y | Y |
| returns | Y | Y | Y | Y | Y | Y | Y | Y |
| promotions | Y | Y | — | — | Y | Y | Y | Y |
| loyalty | Y | — | — | — | Y | Y | Y | Y |
| expiry | — | Y | — | Y | — | — | — | Y |
| batch | — | Y | — | Y | Y | Y | — | Y |
| vehicles | — | — | — | — | Y | Y | — | — |
| warranty | — | — | — | — | Y | Y | — | — |
| quotations | — | — | Y | — | Y | Y | Y | Y |
| workshop | — | — | — | — | — | Y | — | — |
| appointments | — | — | — | — | — | Y | — | — |

## Customer phrase → shopType

| Customer says (examples) | Choose |
|---|---|
| Clothes, fashion, boutique, garments, shoes boutique | `CLOTHING` |
| Rice, vegetables, supermarket, mini mart, grocery, provisions | `GROCERY` |
| Tools, cement, pipes, electrical fittings, hardware | `HARDWARE` |
| Seeds, fertilizer, pesticides, farm shop | `AGRICULTURE` |
| Car parts, filters, brake pads, OEM parts (no tyre workshop) | `SPARE_PARTS` |
| Tyres, alignment, balancing, job cards, fleet tyres | `TIRE_SHOP` |
| Cakes, bakery, cupcakes, pastry | `BAKERY` |
| Mixed shop / unclear / “a bit of everything” | `GENERAL` |
| Pharmacy / prescriptions | **Do not register** — not supported (see Limitations) |
| Restaurant / cafe kitchen / KDS | **Do not register** — not supported |
| Factory / BOM / manufacturing | **Do not register** — not supported |

If the customer needs both spare parts **and** a tyre workshop, prefer `TIRE_SHOP`. If they only sell parts with no workshop, use `SPARE_PARTS`.

---

# 4. Registration API (Operational Spec)

Base URL for all calls:

```
https://shop.clothing.api.hexalyte.com/api/v1
```

Convention: NestJS global prefix `api` + URI version `v1` → `/api/v1/...`.

All successful responses are wrapped:

```json
{
  "success": true,
  "statusCode": 201,
  "data": { },
  "timestamp": "..."
}
```

No auth header is required for the public endpoints below. Do **not** send unknown JSON keys — the API uses `whitelist: true, forbidNonWhitelisted: true` and returns **400** on extra properties.

## 4.1 Pre-checks

### Platform maintenance

```http
GET /tenants/platform-status
```

Example `data`:

```json
{ "enabled": false, "message": "...", "platformName": "..." }
```

If `enabled` is `true`, **stop**. Do not call register. Tell the customer the platform is under maintenance and quote `message`.

### List verticals (optional)

```http
GET /tenants/shop-types
```

Returns `[{ type, label, labelSi, emoji, description }, ...]`. Prefer the local matrix in **Business Types** for decisions; use this endpoint to confirm live labels.

### Subdomain availability

```http
GET /tenants/resolve/{subdomain}
```

- **200** → subdomain is taken (workspace exists). Pick another slug.
- **404** → usually **available**. Caveat: `SUSPENDED` / `CANCELLED` tenants also return 404 from this endpoint, but `POST /tenants/register` still does an exact uniqueness check — if you then get **409**, pick another slug.
- Lookup lowercases the path param; registration stores the subdomain **verbatim**, so always send lowercase to avoid unloggable tenants.

Also reject reserved names yourself: `__platform_config__`, `platform`, and anything not matching lowercase `[a-z0-9-]{3,30}`.

## 4.2 Create tenant

```http
POST /tenants/register
Content-Type: application/json
```

### Request body

| Field | Type | Required | Rules / default |
|---|---|---|---|
| `companyName` | string | yes | Business display name |
| `subdomain` | string | yes | Store **verbatim**. Must be lowercase `[a-z0-9-]`, length 3–30. Login later lowercases the slug — mixed case will break login. |
| `adminEmail` | string | yes | Valid email; server trims + lowercases |
| `adminPassword` | string | yes | Min **8** characters |
| `adminFirstName` | string | yes | |
| `adminLastName` | string | yes | |
| `phone` | string | no | |
| `country` | string | no | Default `"IN"` — for Sri Lanka send `"LK"` |
| `currency` | string | no | Default `"INR"` — for Sri Lanka send `"LKR"` |
| `timezone` | string | no | Default `"Asia/Kolkata"` — for Sri Lanka send `"Asia/Colombo"` |
| `plan` | enum | no | `STARTER` (default) \| `PROFESSIONAL` \| `ENTERPRISE` \| `CUSTOM` |
| `shopType` | enum | no | See business types; default `CLOTHING` |

### Sri Lanka recommended defaults

```json
{
  "country": "LK",
  "currency": "LKR",
  "timezone": "Asia/Colombo",
  "plan": "STARTER",
  "shopType": "GROCERY"
}
```

### Example request

```json
{
  "companyName": "Acme Grocers",
  "subdomain": "acme",
  "adminEmail": "owner@acme.lk",
  "adminPassword": "Str0ngPass!9x",
  "adminFirstName": "Nimal",
  "adminLastName": "Perera",
  "phone": "+94771234567",
  "country": "LK",
  "currency": "LKR",
  "timezone": "Asia/Colombo",
  "plan": "STARTER",
  "shopType": "GROCERY"
}
```

### Success (`201`) — `data` shape

```json
{
  "tenant": {
    "id": "cuid...",
    "name": "Acme Grocers",
    "subdomain": "acme",
    "email": "owner@acme.lk",
    "phone": "+94771234567",
    "currency": "LKR",
    "country": "LK",
    "timezone": "Asia/Colombo",
    "plan": "STARTER",
    "shopType": "GROCERY",
    "status": "TRIAL",
    "trialEndsAt": "2026-08-06T...",
    "maxUsers": 3,
    "maxBranches": 1,
    "maxProducts": 500,
    "settings": {},
    "metadata": {},
    "createdAt": "...",
    "updatedAt": "..."
  },
  "branch": {
    "id": "cuid...",
    "name": "Acme Grocers - Main",
    "code": "HO-001",
    "isDefault": true
  },
  "adminUser": {
    "id": "cuid...",
    "email": "owner@acme.lk",
    "firstName": "Nimal",
    "lastName": "Perera"
  },
  "initialPassword": "Str0ngPass!9x"
}
```

Notes:

- `STARTER` → `status: "TRIAL"` and `trialEndsAt` = now + **7 days**.
- `PROFESSIONAL` / `ENTERPRISE` / `CUSTOM` → `status: "ACTIVE"`, `trialEndsAt: null`.
- Admin user is created **ACTIVE** with `emailVerified: true` — no OTP / email verification step.
- `initialPassword` is the plaintext password you sent; the welcome email also includes it.

### Errors

| Status | When |
|---|---|
| 400 | Validation failure / extra JSON keys / password &lt; 8 chars / reserved subdomain |
| 409 | `Subdomain already in use` |
| 503 | Platform maintenance (`message` from platform status) |

## 4.3 What happens after register (automatic)

Inside one DB transaction:

1. Tenant row (plan, shopType, limits, trial fields)
2. Default branch `{companyName} - Main`, code `HO-001`, `isDefault: true`
3. System role `Tenant Admin`
4. Admin user linked to that role and branch
5. Vertical default categories + `settings.shopProfile`
6. System roles pack (Cashier, Tenant Admin, Branch Manager) via `ensureSystemRoles`

After commit (async, fire-and-forget):

- Event `tenant.registered` → **welcome email** with `https://{subdomain}.shop.hexalyte.com/login`, email, and password
- **Cloudflare DNS** A record for `{subdomain}.shop` → server IP, then SSL queue (HTTPS usually ready in **1–3 minutes**)
- **Accounting bootstrap**: chart of accounts, cash/bank accounts, fiscal period, document number series, default tax rates
- Best-effort **Keycloak** user/group (errors swallowed; primary login is local JWT)

Not seeded: warehouses, POS counters, products, customers, suppliers.

## 4.4 Verify login

```http
POST /auth/login
Content-Type: application/json
x-tenant-id: {subdomain}
```

Body:

```json
{
  "email": "owner@acme.lk",
  "password": "Str0ngPass!9x"
}
```

Optional: `twoFactorCode`, `rememberMe`.

Success `data`:

```json
{
  "user": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "tenantId": "...",
    "branchId": "...",
    "roles": ["TENANT_ADMIN"]
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

- Access token TTL: **15 minutes**; refresh: **7 days**.
- Always send `x-tenant-id: {subdomain}` for reliable multi-tenant login.
- If 2FA were enabled (it is not on a fresh account): `{ "requiresTwoFactor": true, "userId": "..." }`.
- Later authenticated calls need: `Authorization: Bearer {accessToken}` + `x-tenant-id: {subdomain}`.

## 4.5 Full curl sequence

```bash
API="https://shop.clothing.api.hexalyte.com/api/v1"
SUB="acme"

# 1. Maintenance gate
curl -s "$API/tenants/platform-status"

# 2. Subdomain free? (expect 404)
curl -s -o /dev/null -w "%{http_code}\n" "$API/tenants/resolve/$SUB"

# 3. Register
curl -s -X POST "$API/tenants/register" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Acme Grocers",
    "subdomain": "acme",
    "adminEmail": "owner@acme.lk",
    "adminPassword": "Str0ngPass!9x",
    "adminFirstName": "Nimal",
    "adminLastName": "Perera",
    "phone": "+94771234567",
    "country": "LK",
    "currency": "LKR",
    "timezone": "Asia/Colombo",
    "plan": "STARTER",
    "shopType": "GROCERY"
  }'

# 4. Login check
curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: acme" \
  -d '{"email":"owner@acme.lk","password":"Str0ngPass!9x"}'
```

Customer workspace after DNS/SSL: `https://acme.shop.hexalyte.com/login`

---

# 5. Agent Playbook

How the sales AI agent should talk to a customer, decide `shopType` + `plan`, create the account, and hand off credentials.

## Conversation goals

1. Confirm HexaOne is a fit (retail shop — not restaurant/pharmacy/factory).
2. Collect fields needed for registration.
3. Choose `shopType` and `plan` using the rules below.
4. Read back and get explicit confirmation.
5. Call the registration API (section 4).
6. Deliver workspace URL + login details; note SSL wait and trial.

## Qualification questions (ask in order)

1. **What do you sell / what kind of shop is it?** → maps to `shopType` (section 3).
2. **How many physical shops / branches?** → plan limits.
3. **How many staff need login (cashiers + managers)?** → `maxUsers`.
4. **Roughly how many products / SKUs?** → `maxProducts`.
5. **Company / shop name?** → `companyName` + subdomain seed.
6. **Owner full name?** → split into `adminFirstName` / `adminLastName`.
7. **Login email?** → `adminEmail` (must be unique enough for the owner to receive mail).
8. **Phone?** (optional but preferred) → `phone`.
9. **Country / currency?** — for Sri Lanka use `LK` / `LKR` / `Asia/Colombo`.
10. **Do you need accounting and payroll from day one?** — educate; both exist on all tenants after seed, not plan-gated as hard locks. Still useful for Professional upsell narrative.
11. **Current system?** (Excel / another POS / none) — for onboarding tone only.

Stop and escalate to a human if the business is pharmacy, restaurant, manufacturing, or wholesale ecommerce marketplace — see **Limitations**.

## Decision rules — shopType

Use the phrase table in section 3. If unclear between two verticals, ask one more clarifying question. Never guess silently.

## Decision rules — plan

| Condition | Plan |
|---|---|
| 1 branch AND ≤ 3 users AND ≤ 500 products | `STARTER` (7-day trial) — default for most SME trials |
| &gt; 1 branch OR &gt; 3 users OR &gt; 500 products (and ≤ 3 branches, ≤ 10 users, ≤ 5000 products) | `PROFESSIONAL` minimum |
| &gt; 3 branches OR &gt; 10 users OR &gt; 5000 products OR needs negotiated limits / white-label talk | `ENTERPRISE` (or escalate for `CUSTOM`) |
| Customer asks for custom pricing / dedicated support | Escalate human; use `CUSTOM` only with approval |

Pricing to quote (Rs. per month):

- Starter: **Rs. 1,199/mo** after **7-day free trial**
- Professional: **Rs. 4,799/mo** (ACTIVE immediately — no trial)
- Enterprise: **Rs. 14,399/mo**
- Custom: negotiated

Important: registration does **not** charge a card. For `PROFESSIONAL` / `ENTERPRISE`, create the account only after the customer agrees a human will follow up on billing.

## Subdomain generation

1. Take `companyName`, lowercase, keep only `a-z0-9`, replace spaces/punctuation with `-`, collapse multiple `-`, trim to 3–30 chars.
2. If shorter than 3 chars, append `-shop` (e.g. `ab` → `ab-shop`).
3. Check `GET /tenants/resolve/{subdomain}`:
   - 404 → use it
   - 200 → try `{slug}-2`, `{slug}-3`, … or ask the customer for a preferred slug
4. Never use `__platform_config__` or `platform`.
5. Always send lowercase only.

## Password generation

- Generate a unique password per customer: **12+ characters**, mix of upper, lower, digit, symbol.
- Must be ≥ 8 characters (API minimum).
- Never reuse passwords across customers.
- Store only long enough to return in the handoff message; the API echoes it as `initialPassword` and emails it.

## Collected fields checklist (must be complete before POST)

```json
{
  "companyName": "",
  "subdomain": "",
  "adminEmail": "",
  "adminPassword": "",
  "adminFirstName": "",
  "adminLastName": "",
  "phone": "",
  "country": "LK",
  "currency": "LKR",
  "timezone": "Asia/Colombo",
  "plan": "STARTER",
  "shopType": ""
}
```

Also verify:

- [ ] Platform status `enabled === false`
- [ ] Subdomain resolve returned 404
- [ ] Customer confirmed the read-back
- [ ] Business type is supported

## Mandatory read-back (before creating)

Say something like:

> I will create your HexaOne workspace with these details:
> - Shop: **{companyName}**
> - Type: **{shopType label}** (`{shopType}`)
> - Plan: **{plan}** ({trial note or price})
> - URL: **https://{subdomain}.shop.hexalyte.com**
> - Admin login email: **{adminEmail}**
> - Owner: **{adminFirstName} {adminLastName}**
> - Country/currency: **{country} / {currency}**
>
> Reply **yes** to create the account now.

Do not call `POST /tenants/register` until the customer clearly confirms.

## Post-creation message (exact template)

> Your HexaOne account is ready.
>
> **Workspace:** https://{subdomain}.shop.hexalyte.com/login  
> **Email:** {adminEmail}  
> **Temporary password:** {initialPassword}  
>
> Please change the password after first login. HTTPS for a new subdomain usually finishes in **1–3 minutes** — if the page does not load yet, wait and retry.
>
> {If STARTER:} Your **7-day free trial** ends on **{trialEndsAt date}**. After that the workspace suspends until you upgrade/pay.
>
> {If paid plan:} A Hexalyte team member will follow up on billing for the **{plan}** plan (Rs. {price}/mo). Registration itself does not take payment.
>
> A welcome email with the same details was also sent to {adminEmail}.

Optionally verify with `POST /auth/login` + `x-tenant-id` before sending the handoff (recommended).

## Objection handling (short)

| Objection | Answer |
|---|---|
| “Too expensive” | Start on Starter trial (7 days, Rs. 1,199/mo after). Limits: 3 users, 1 branch, 500 products. |
| “We have 2 shops” | Professional (Rs. 4,799/mo): 10 users, 3 branches, 5,000 products. |
| “Do you have WhatsApp bills?” | Yes — connect WhatsApp via QR in the app and send bill summaries. |
| “Do you take card online?” | Card/QR payments at the till are recorded as payment methods; there is **no** Stripe-style online checkout gateway. |
| “Sinhala UI?” | Product UI is English today; some vertical labels include Sinhala text. Full Sinhala UI is not available yet. |
| “SMS alerts?” | Not live — do not promise SMS. In-app notifications and email/WhatsApp exist. |
| “Can you sync Shopify?” | No ecommerce / Shopify sync. |

## Failure handling

- **409 subdomain** — generate next slug, confirm with customer, retry.
- **503 maintenance** — apologize, do not retry register, escalate.
- **400 validation** — fix payload (no extra keys; password ≥ 8; valid email); retry once.
- **Register succeeded but login fails** — confirm `x-tenant-id` is exact lowercase subdomain; wait 1–2 minutes if DNS not ready for browser login (API login does not need DNS).
- **Email not received** — still give credentials from API response; email is best-effort.

---

# 6. Limitations and Don'ts

Hard guardrails. If a customer asks for something in this list, **do not promise it**. Offer a supported alternative or escalate to a human.

## Do not promise

| Topic | Reality in codebase |
|---|---|
| SMS notifications / OTP SMS | SMS is an **outbox stub only** — rows can be queued; nothing is sent via a gateway. |
| Twilio | Appears in deps/config examples only — **no live Twilio integration**. |
| Stripe / online card checkout | Env placeholders only — **no payment gateway, checkout, or webhooks**. |
| Automatic card/QR/UPI acquiring | Till can **record** card/QR/bank reference payments manually; no acquiring integration. |
| Manufacturing / BOM / MRP | **Not present**. |
| Restaurant / cafe / KDS | **Not present**. |
| Pharmacy / prescriptions | **Not present**. |
| Ecommerce storefront | **Not present**. |
| Shopify / WooCommerce sync | **Not present**. |
| QuickBooks / Xero / Tally export | **Not present**. |
| Government e-invoicing / Peppol / UBL | **Not present**. |
| Full Sinhala (or multi-language) UI | `next-intl` is configured with **`locales: ["en"]` only**. Some vertical metadata has Sinhala labels; the app UI is English. |
| USB / serial weighing scale driver | Weighted products use **manual gram entry** — no scale hardware driver. |
| Instant HTTPS on brand-new subdomain | DNS + SSL usually takes **1–3 minutes**; tell the customer to wait. |
| Email verification / OTP at signup | Admin is created **ACTIVE** and `emailVerified: true` immediately. |
| In-app payment at registration | Register creates the tenant **without charging**. Human follow-up required for paid plans. |
| Arbitrary per-tenant module toggles independent of shop type | Modules follow **`shopType`** profile; runtime gates use shop type, not free-form flags. |
| Plan features as hard module locks | Plan catalog lines like “Analytics / HR / API / White-label” are mostly **marketing labels**. Enforced: user/branch/product limits + subscription status. |

## Safe alternatives to suggest

| They ask for… | You can offer… |
|---|---|
| SMS alerts | In-app notifications; WhatsApp (QR-connected); email |
| Online payments | Record card/cash/bank at POS; human billing for subscription |
| Multi-language UI | English UI today; Sinhala labels on some vertical names |
| Scale integration | Manual kg/g entry on weighted products |
| Ecommerce | In-store POS + inventory; no online storefront |
| Accounting export to Tally | Built-in HexaOne accounting + CSV/Excel utilities |
| Restaurant POS | Decline / escalate — wrong product |

## Behavioral don'ts for the agent

1. **Do not register** unsupported business types (pharmacy, restaurant, manufacturing).
2. **Do not invent** modules, prices, or limits — quote only from this file.
3. **Do not send extra JSON fields** to `/tenants/register`.
4. **Do not** create an account without an explicit customer **yes** on the read-back.
5. **Do not** reuse or share another customer's password.
6. **Do not** claim payment was collected when you only called register.
7. **Do not** say loyalty / workshop / expiry works for every shop type — check the module matrix in section 3.
8. **Do not** use mixed-case or underscored subdomains.
9. If unsure whether a feature exists, say you will confirm with the Hexalyte team rather than guessing.

## Escalation triggers (hand to human)

- Custom / Enterprise contract negotiation
- Data migration from another POS
- Hardware procurement (printers, scanners) beyond “we support barcode wedge + print server”
- Legal / tax certification claims for a specific country
- Feature requests for items in the “Do not promise” table
- Maintenance mode (`platform-status.enabled === true`)
- Customer disputes about an existing tenant (billing, suspension, SSL)

## Quick truth sentence (use freely)

> HexaOne is a multi-vertical **retail ERP + POS** for clothing, grocery, hardware, agriculture, spare parts, tyre workshops, bakeries, and general shops — with inventory, purchasing, accounting, HR, and WhatsApp bill sharing. It is not a restaurant, pharmacy, manufacturing, or ecommerce platform, and signup does not process card payments.
