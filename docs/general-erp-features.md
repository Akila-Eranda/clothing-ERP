# HexaOne General ERP — Complete Feature Report

**Product:** HexaOne by Hexalyte
**Edition:** General Shop (mixed retail — products, stock, sales & customers)
**Access:** Web (`shop.hexalyte.com`) + Windows Desktop App (HexaOne, auto-updating)

> HexaOne General ERP කියන්නේ සාමාන්‍ය retail කඩ (mixed products — electronics, home & living, stationery, health & beauty, general merchandise) සඳහා හදපු සම්පූර්ණ ERP එකක්. POS එකේ ඉඳන් inventory, purchasing, accounting, HR, payroll, reports දක්වා සියල්ල එකම system එකක.

---

## Table of Contents

1. [At a Glance](#1-at-a-glance)
2. [Dashboard & Overview](#2-dashboard--overview)
3. [POS Terminal](#3-pos-terminal)
4. [Sales, Quotations & Returns](#4-sales-quotations--returns)
5. [Customers, Loyalty & Credit](#5-customers-loyalty--credit)
6. [Products & Catalog](#6-products--catalog)
7. [Inventory & Warehouse](#7-inventory--warehouse)
8. [Procurement (Purchasing)](#8-procurement-purchasing)
9. [Finance & Accounting](#9-finance--accounting)
10. [Cash Management & Expenses](#10-cash-management--expenses)
11. [Reports & Analytics](#11-reports--analytics)
12. [HR & Payroll](#12-hr--payroll)
13. [Branches, Users & Roles](#13-branches-users--roles)
14. [Approval Workflows](#14-approval-workflows)
15. [Promotions, Coupons & Gift Vouchers](#15-promotions-coupons--gift-vouchers)
16. [WhatsApp Integration](#16-whatsapp-integration)
17. [Notifications & Alerts](#17-notifications--alerts)
18. [Settings & Customization](#18-settings--customization)
19. [Security](#19-security)
20. [Desktop App](#20-desktop-app)
21. [Subscription Plans](#21-subscription-plans)

---

## 1. At a Glance

| Area | Highlights |
|---|---|
| POS | 6 screen layouts, barcode/QR scan, weighed items, held bills, split payments, customer display |
| Inventory | Multi-branch, multi-warehouse, stock ledger, transfers, ABC / dead stock / aging analysis |
| Purchasing | Purchase orders with free qty, selling price & MRP, GRN, purchase returns, supplier payments |
| Accounting | Full double-entry GL, auto-posting, P&L, Balance Sheet, Cash Flow, VAT, fixed assets |
| Customers | Tiers, loyalty points, wallet, credit limits, instalments, WhatsApp reminders |
| HR | Employees, attendance, leaves, shifts, payroll with EPF / ETF |
| Control | Roles & permissions, approval workflows, audit trail, 2FA |

**Pre-configured for General retail:**
- Default categories: General Merchandise, Electronics, Home & Living, Health & Beauty, Stationery, Other
- Variant attributes: **Size** (Small / Medium / Large / Standard) and **Variant** (Standard / Premium / Economy)
- Units: pcs, set, pair, box, kg, pack
- Label templates: barcode stickers and shelf labels
- Enabled modules: Brands, Variants, Returns & Exchanges, Promotions, Loyalty, Quotations

---

## 2. Dashboard & Overview

### Business Dashboard
- Date-range picker with comparison against the previous period
- **KPI cards:** Total Sales, Sales Returns, Total Purchases, Purchase Returns, Profit, Invoice Due, Total Expenses, Payment Returns
- Sales chart and overall counts (suppliers, customers, orders)
- Top selling products, low stock products, recent sales, recent transactions
- Top customers, category statistics, order statistics
- Quick actions: **Open POS, Add Product, New Purchase, Stock Check**

### Business Calendar
- Monthly calendar showing sales, expenses and notes
- Each day shows expenses, supplier payments, supplier dues, cheques due, customer dues
- Create **notes, tasks** (open / done / cancelled) and **meetings**

### Global Tools
- Global search (products, customers, orders)
- Branch switcher
- One-click POS button
- Keyboard shortcuts panel and in-app support

---

## 3. POS Terminal

A full-screen, fast, touch- and keyboard-friendly point of sale.

### Screen Layouts
- **6 layouts:** Classic, plus Retail 1–5 (category rail, standard, cart-left, image cards, wide cart)
- The admin chooses the layout; all layouts share the same engine
- Per-terminal settings: cart width, product card size, touch mode, sound alerts, quantity popup, negative stock, tax rate

### Scanning & Search
- Barcode and QR scanning, plus search by name or SKU
- Scanner status indicator
- When one barcode matches several products, the cashier picks the right one from a list
- Variant picker for size / variant products
- Unit-serial barcodes printed on tags

### Weighed Items
- Items sold by kg: enter the weight in grams and it converts to kg automatically

### Multi-Price Selling
- When the same product was bought on different purchase orders at different selling prices, the POS shows a **price picker**, so old and new stock can be sold at the right price
- MRP is displayed, and the **"You saved"** amount against MRP prints on the receipt

### Cart
- Quantity +/-, line discount, whole-bill discount %
- Coupon codes, automatic promotions, customer tier discount
- Loyalty point redemption, cart notes
- Discounts above a set limit need **manager approval**

### Held Bills
- Hold a bill with **F3** and recall it with **F8**
- Split selected items into a separate held bill
- Recent bills with reprint

### Payment Methods
- **Cash, Card** (last digits recorded), **Bank Transfer, QR Pay, Cheque, Customer Credit, Gift Voucher, Wallet, Loyalty Points**
- Split and partial payments
- Exact cash and quick-cash buttons (500 / 1,000 / 2,000 / 5,000)

### Customers at POS
- Find a customer by phone or name, or register a new one on the spot
- Helper / salesperson commission tracking

### POS Side Tools
- **New Product** (saved to the catalog) and **Demo Product** (one-off, for this bill only)
- **Reload / Recharge:** mobile reloads with operator commission, digital and physical cards
- **Orders:** today's sales, with reprint
- **Vouchers:** issue and validate gift vouchers
- **Quick GRN:** receive stock from a supplier at the counter, see stock history since the last GRN and open-PO warnings, and pay the supplier immediately (cash / card / bank / cheque)
- **Quick Expense**, **Returns**, **Discounts**, **Sales reports**

### Counters, Shifts & Cash Control
- Multiple POS counters (tills) per branch
- Open a shift with opening cash; close it with a **denomination count**
- Cash variances go to approval
- Cash in / out and safe ↔ register transfers
- Day-end and shift summaries
- **Cashier PIN lock** and cashier switching (F12)

### Receipts
- Auto-print, pre-bill (F10), reprint
- **58 mm / 80 mm** paper, light or dark receipt theme
- Browser printing or a **LAN print server**, with printer status
- Send the bill to the customer on **WhatsApp**

### Customer Display
- Second-screen display with the shop logo, live cart, checkout total and a thank-you screen
- Opens in its own window in the desktop app

---

## 4. Sales, Quotations & Returns

### Sales
- Sales list with Today / Yesterday and date filters
- Sale detail shows items, payment methods and references, notes, totals, with reprint

### Quotations
- Status flow: Draft → Pending Approval → Sent → Accepted / Rejected → Converted / Expired
- Valid-until date and an approval workflow
- **Printable PDF quotation**
- Convert straight into a POS sale

### Returns & Exchanges
- Look up the original invoice and select the lines to return
- Reasons: Defective, Wrong Item, Damaged, Changed Mind, Other
- **Exchange** with automatic net refund calculation
- Stock goes back to inventory on approval
- Cash refunds are recorded in the cash register

---

## 5. Customers, Loyalty & Credit

### Customer Profiles & Tiers
- Tiers: Bronze, Silver, Gold, Platinum, Diamond
- **Automatic tier discounts:** 0% / 3% / 5% / 8% / 10%
- Customer segments and lookup by phone

### Loyalty Points
- Points earned automatically on every sale (default: 1 point per LKR 100)
- Redeem points at the POS
- Manual adjustments, with full history

### Customer Wallet (Store Credit)
- Top up the wallet and pay from it
- Overpayments are saved as an advance

### Credit Management
- Credit limit and credit days per customer
- Credit sales, credit payments, credit notes
- Customer ledger and statement
- **Instalment payment schedules**
- Overdue reminders, including **WhatsApp payment reminders**
- Collection report and AR dashboard

---

## 6. Products & Catalog

### Product Master
- Name, barcode, category, brand, HSN / SAC code, unit, tags, description
- **Multiple images** (the first is the cover)
- **Selling price, cost price, MRP**, with the gross margin shown
- Tax rates: 0 / 5 / 12 / 18 / 28 %
- **Variants matrix:** each size / variant row has its own SKU, selling price, cost and MRP
- Opening stock, reorder level, minimum / maximum stock, default warehouse
- Branch-specific product availability
- Supplier assignment

### Catalog Tools
- Product KPIs: total, active, drafts, inactive / out of stock
- Bulk status update
- **CSV import / export**
- **Barcode label printing** on A4 sheets, stickers and shelf labels
- Shared or unique barcode modes

### Categories & Brands
- Category management
- Brand management with logos and CSV export

---

## 7. Inventory & Warehouse

### Stock Control
- Stock levels: on hand, reserved, damaged, available
- Low stock view
- **Stock adjustments** with a reason (manual, restock, customer return, sale correction, damage / write-off), with optional approval
- Zero out negative stock in one action
- **Inventory Ledger:** every stock movement with a summary

### Stock Analysis
- **ABC Analysis:** identifies the fast-moving, high-value items
- **Dead Stock:** items that are not selling
- **Stock Aging:** how long stock has been sitting

### Stock Transfers
- Branch-to-branch transfers: Pending → In Transit → Received
- Two-step approval (Branch Manager → Admin)

### Warehouse Management
- Multiple warehouses per branch
- Warehouse dashboard: on hand, available, stock value, low stock
- Stock and value per warehouse
- Warehouse-to-warehouse transfers with approval

---

## 8. Procurement (Purchasing)

### Suppliers
- Supplier profiles with credit limit and credit days
- Supplier dashboard: recent POs, payments, assigned products, last buying price, lead time
- **AP aging** and open dues
- Supplier price history and a performance report

### Purchase Orders
- Supplier snapshot: outstanding balance, credit, last purchase, payment due date
- Each line has **Order Qty, Free Qty, Expiry, Buying Price, Selling Price, MRP and Discount**
- The same product can appear on multiple lines at different prices
- **Reorder suggestions** and product sales history
- Status flow: Draft → Pending Approval → Sent / Confirmed → Partially Received → Received → Closed
- Approval workflow (Manager → Finance)
- Print barcode labels straight from the PO

### Goods Received Notes (GRN)
- Three GRN types: **From PO, Direct, Quick (from POS)**
- On receipt, stock and the catalog selling price / MRP update automatically

### Purchase Returns
- Return goods to the supplier, with a debit note

### Procurement Hub
- **Purchase requests** with approval, then conversion to a PO
- Full flow: Request → PO → Confirm → Receive → Invoice → Pay
- Supplier invoices

### Supplier Payments
- Pay by Cash, Bank Transfer, Cheque, UPI or Card
- Automatic **oldest-first allocation** across unpaid POs
- Supplier ledger and statement

---

## 9. Finance & Accounting

A complete double-entry accounting system, integrated with sales and purchasing.

### Core Accounting
- **Chart of Accounts:** default template, import / export
- **General Ledger journals:** Draft → Submit → Approve → Post → Void
- **Automatic GL posting** of sales, purchases, payments and expenses (account mappings are configurable)
- AR and AP dashboards with statements

### Financial Reports
- **Trial Balance**
- **Profit & Loss**
- **Balance Sheet**
- **Cash Flow Statement**
- **General Ledger**
- Customer and supplier statements
- **VAT Report**
- All reports can be exported

### Cash & Bank
- Bank, savings, cash-in-hand and petty cash accounts
- **Cash Book and Bank Book**
- Deposits, withdrawals, transfers, bank fees, interest
- **Bank Reconciliation**

### Cheque Management
- Received and issued cheques
- Deposited → Cleared / Bounced tracking
- Overdue alerts and a cheque dashboard

### Advanced Accounting
- **Budgets** and budget variance
- **Cost centres**
- **Recurring journals** (automatic)
- **Multi-currency** exchange rates
- Forecasting and consolidation

### VAT / Tax
- Input and output tax rates
- VAT returns (Draft → Submit → File) and VAT reports

### Petty Cash
- Petty cash funds, disbursements and replenishment
- **Expense claims:** Submit → Approve → Reimburse

### Fixed Assets
- Asset categories and register
- **Depreciation:** straight-line or declining balance, with a schedule
- Asset disposal and transfer

### Periods & Year-End
- Fiscal years and periods
- Year-end preview; close and reopen periods

### Accounting Settings
- Fiscal year, currency, **document number series**, tax settings, approval rules, GL mappings

---

## 10. Cash Management & Expenses

### Cash Management
- Cash open, cash close, cash in / out
- Counter management
- Shift history, a detailed shift sheet, denomination entry
- **Variance tracking and approval**

### Expenses
- Record expenses with a category, payment method and reference
- Categories: Rent, Salary, Electricity, Transport, Marketing, Other
- Charts by category and by payment method
- Date filters: this month, last month, last 3 months, this year
- Quick Expense directly from the POS

---

## 11. Reports & Analytics

### Analytics
- Revenue, cost, gross profit, profit margin
- Revenue trend chart
- **Monthly P&L** (revenue vs expenses vs profit)
- **Best sellers** leaderboard
- **Profit by product**
- **Cashier performance**
- **Top branches**

### Reports Hub
Every report has a date-range filter and can be printed.

| Report | What it shows |
|---|---|
| Overview | Net revenue, orders, average order value, gross profit, returns, cash-flow in / out |
| Sales | Sales by period, product and payment |
| Purchases | PO count, totals, paid vs outstanding |
| Inventory | SKUs, out of stock, low stock, stock value at cost |
| Suppliers | Supplier totals, performance, price history |
| Customers | Customer counts, tiers, lifetime value |
| Cashier | Orders, revenue, tax and discounts per cashier |
| Branches | Branch-wise performance |
| Tax | Tax collected / paid |
| Cheques | Overdue and upcoming (next 7 days) cheques |
| Commission | Helper / salesperson commission sales and payouts |
| Financial | Financial summary |
| Best-selling / Profit / Stock movement | Product-level performance |

---

## 12. HR & Payroll

### Employees
- Personal details, department, designation, branch
- Employment type: full-time, part-time, contract, intern
- Basic salary, joining date, shift
- NIC, **EPF and ETF numbers**, bank details

### HR Masters
- Departments, designations, shifts (with staff assignment), holidays, leave types

### Attendance
- Daily and bulk attendance entry
- Statuses: present, absent, half day, leave, late, holiday
- Monthly attendance summary

### Leave Management
- Leave applications with approve / reject

### Payroll
- Allowance and deduction components
- Salary runs: Process → Approve → Pay
- Bulk payroll and payslips (layout is customizable)
- **Sri Lanka statutory:** EPF (8% employee / 12% employer) and ETF (3%)

---

## 13. Branches, Users & Roles

- **Multi-branch:** create branches, switch between them from the header, scope products and reports per branch
- **Users:** invite, activate / deactivate, assign roles, view activity
- **Built-in roles:** Tenant Admin, Branch Manager, Cashier (POS-only access)
- **Custom roles** with a detailed permission matrix and a preview of permission changes

---

## 14. Approval Workflows

Configurable multi-step approvals, a pending-tasks queue, and a full audit history.

| Approval | Default steps |
|---|---|
| Purchase Order | Manager → Finance |
| Purchase Request | Manager |
| Stock Adjustment | Inventory Manager |
| POS Discount | Manager |
| Stock Transfer | Branch Manager → Admin |
| Cash Variance | Manager |
| Quotation | Manager → Admin |
| Journal Entry | Approver |
| Expense Claim | Approver |

---

## 15. Promotions, Coupons & Gift Vouchers

- **Discount types:** Percentage, Fixed Amount, **Buy X Get Y**
- **Rules:** minimum order, maximum discount, usage limit, per-customer limit, start / end dates, coupon code, applicable products
- Promotion status views: Live, Scheduled, Expired, Inactive; usage statistics
- **Gift vouchers:** issue and redeem at the POS, including partial redemption

---

## 16. WhatsApp Integration

- Connect the shop's own WhatsApp number by **scanning a QR code**
- Automatic reconnection
- **Send bills / receipts** to customers after a sale
- **Credit payment reminders** to customers
- Connection status monitoring

---

## 17. Notifications & Alerts

- In-app notification centre with unread count
- **Automatic alerts:** low stock / reorder, customer dues, supplier dues, cheque due dates, pending POs and GRNs, daily summary
- Scheduled daily scans, with duplicate alerts suppressed
- Email notifications (SMTP)

---

## 18. Settings & Customization

- **Business info:** name, phone, country, currency, timezone
- **POS configuration:** layout, auto-print, round-off, negative stock, loyalty on every sale
- **Receipt designer:** logo, header / footer, paper width, font size, light / dark theme, show / hide tax, discount, cashier, customer and invoice barcode
- **Print server:** URL, API key, printer name, test print
- **Payslip layout**
- **Reload / recharge:** operators and card import
- **Appearance:** light / dark mode, **14 sidebar skins**, topbar skins, default or mini layout, fluid or boxed width
- Notification preferences
- Branch settings
- Billing / current plan
- Audit log

---

## 19. Security

- Secure login with session refresh; forgot / reset password
- **Two-factor authentication (2FA)**
- Login history and personal activity log
- **Full audit trail** of who did what, and when
- Permission-based access control
- Cashier PIN lock at the POS
- SSO-ready (Keycloak)
- Each shop's data is isolated from other shops (multi-tenant)

---

## 20. Desktop App

**HexaOne for Windows**, downloadable from `shop.hexalyte.com/downloads/HexaOne-Setup.exe`

- Native Windows app for the POS counter
- **Automatic updates:** update banner, download progress, "Update now" or install on exit
- Customer display opens in its own window (second monitor)
- Configurable server URL
- Runs as a single instance, so the POS is never opened twice by mistake
- Refresh shortcuts (Ctrl+R / F5)

---

## 21. Subscription Plans

| Plan | Users | Branches | Products |
|---|---|---|---|
| Starter | 3 | 1 | 500 |
| Professional | 10 | 3 | 5,000 |
| Enterprise | Unlimited | Unlimited | Unlimited |
| Custom | Tailored | Tailored | Tailored |

- Free trial available
- Custom domain / SSL available per shop

---

*HexaOne General ERP — POS, Inventory, Purchasing, Accounting, HR & Reports in one system.*
*© Hexalyte*
