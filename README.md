# HexaOne — AI-Powered Retail & Business Management Platform

A complete, enterprise-grade ERP + POS + Inventory + CRM + Accounting + Multi-Branch SaaS system for clothing retail.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS + ShadCN UI |
| Backend | NestJS 10 + TypeScript |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache/Queue | Redis 7 + BullMQ |
| Real-time | Socket.IO WebSockets |
| Auth | JWT (access + refresh tokens) + 2FA (TOTP) |
| Storage | Local / AWS S3 / Cloudflare R2 |
| Infra | Docker + NGINX + Kubernetes + GitHub Actions CI/CD |

## Monorepo Structure

```
clothing-shop/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # NestJS backend (port 3001)
├── nginx/            # NGINX reverse proxy config
├── k8s/              # Kubernetes manifests
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Quick Start

### Prerequisites
- Node.js 20+, pnpm 9+, Docker

### 1. Clone & Install
```bash
pnpm install
```

### 2. Start Infrastructure
```bash
docker-compose up -d postgres redis
```

### 3. Setup Backend
```bash
cd apps/api
cp .env.example .env        # fill in your secrets
pnpm prisma migrate dev
pnpm prisma db seed         # seeds demo tenant + users
pnpm dev                    # starts on :3001
```

### 4. Start Frontend
```bash
cd apps/web
pnpm dev                    # starts on :3000
```

### 5. Full Stack via Docker
```bash
docker-compose up --build
```

## Demo Credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.fashionerp.com | Admin@123456 |
| Cashier | cashier@demo.fashionerp.com | Cashier@123456 |

## Backend API Modules

| Module | Endpoints | Description |
|---|---|---|
| Auth | `/api/v1/auth/*` | Login, refresh, 2FA, password reset |
| Tenants | `/api/v1/tenants/*` | SaaS onboarding, multi-tenancy |
| Users | `/api/v1/users/*` | User management + activity logs |
| Roles | `/api/v1/roles/*` | RBAC roles + permissions |
| Products | `/api/v1/products/*` | Product catalog, categories, brands |
| Variants | `/api/v1/variants/*` | SKUs, sizes, colors, barcodes |
| Inventory | `/api/v1/inventory/*` | Stock levels, transfers, alerts |
| POS | `/api/v1/pos/*` | Billing, payments, held bills |
| Sales | `/api/v1/sales/*` | Sales history, analytics |
| Customers | `/api/v1/customers/*` | CRM, loyalty, wallet |
| Returns | `/api/v1/returns/*` | Return & refund management |
| Suppliers | `/api/v1/suppliers/*` | Supplier + purchase orders |
| Accounting | `/api/v1/accounting/*` | P&L, expenses, chart of accounts |
| HR | `/api/v1/hr/employees/*` | Employees, attendance, payroll |
| Dashboard | `/api/v1/dashboard/*` | KPIs, charts, insights |
| Reports | `/api/v1/reports/*` | Sales, inventory, tax reports |
| Notifications | `/api/v1/notifications/*` | In-app notifications |
| Branches | `/api/v1/branches/*` | Multi-branch management |
| Files | `/api/v1/files/*` | File upload/storage |
| Health | `/api/health` | Health check |

## Swagger API Docs
Visit `http://localhost:3001/api/docs` after starting the backend.

## Frontend Pages

All 21 dashboard pages are implemented:
- Dashboard, Analytics, POS Terminal, Sales, Returns
- Products, Categories, Brands, Inventory
- Customers, Suppliers, Purchases, HR & Payroll
- Accounting, Expenses, Branches, Reports
- Promotions, Notifications, Users & Roles, Settings

## Features

- **Multi-tenancy** — Subdomain-based tenant isolation with branch scoping
- **RBAC** — Role & permission-based access control with global guards
- **Real-time** — WebSocket events for sales, stock alerts, notifications
- **Background Jobs** — BullMQ queues for emails, reports, inventory sync
- **2FA** — TOTP-based two-factor authentication with QR code setup
- **Pagination** — Consistent cursor/offset pagination across all list APIs
- **Audit Logs** — Write operation audit trail for compliance
- **Rate Limiting** — Per-route throttling with Redis-backed counters

## Running Tests

```bash
cd apps/api
pnpm test           # unit tests
pnpm test:cov       # with coverage
pnpm test:e2e       # end-to-end
```

## Environment Variables

See `apps/api/.env.example` for all required environment variables.
