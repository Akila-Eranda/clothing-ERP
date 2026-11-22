# HEXALYTE ERP — Staging Release Readiness & Acceptance

Date: 2026-11-22. Inputs: `HEXALYTE_GLOBAL_ERP_QUALITY_REPORT.md`, `PRODUCTION_SECURITY_READINESS_REPORT.md`, `SECURITY_REMEDIATION_REPORT.md`.

**What this document is.** A controlled staging release package plus the evidence from a **full local rehearsal**: the real Dockerfiles were built, an isolated stack (database, Redis, two API instances, web) was run in Docker with production-grade hardening, and the smoke, browser, SQL and storage checks were executed against it. The rehearsal ran on this workstation with throw-away secrets and an empty database. **It is not a staging environment with realistic data, and nothing here is evidence about production.**

Safety held throughout: no production access or credentials, no deployment, no Git commit/push, no secret rotation, no WhatsApp socket opened and no message sent (container logs checked: zero WhatsApp activity), no production database touched. The staging containers, volumes, network and images were removed afterwards; other Docker projects on the machine were not touched.

Legend: **READY** = done and verified here · **PENDING** = needs an owner action or input · **BLOCKED** = cannot proceed until an external dependency is resolved · **NOT TESTED** = no evidence yet.

## 1. Summary table (your 13 tasks)

| # | Task | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Audit pending changes, find unrelated edits | **READY** (classified, §2). **PENDING** owner decision before any commit: 5 untracked scripts and `apps/mcp-server` still contain demo/login passwords | 80 modified + 141 untracked paths classified |
| 2 | Verify complete API + web build | **READY** | API `tsc` build OK; `next build` (full production build) exit 0; both **Docker images built from the real Dockerfiles** (API image runs `nest build`); API unit 115 suites / 998 tests, web 141 tests, both type-checks 0 errors |
| 3 | Verify migration + rollback SQL | **READY** locally (fresh install, upgrade from old rules, rollback, re-apply). **PENDING** run against a *sanitised copy of production* | §4 |
| 4 | Prepare isolated staging environment | **READY** as code (`docker-compose.staging.yml`, `.env.staging.example`, `ops/staging/`), rehearsed locally. **PENDING** a real staging host, domain/TLS, sanitised data | §3 |
| 5 | Tenant role-review dry-runs | **READY** (SQL gap report + the reviewed script, rehearsed incl. apply). **PENDING** the real per-tenant list from a staging copy | §5 |
| 6 | Accounting outbox backlog requirements | **READY** (queries + decision rules). **PENDING** real backlog numbers | §6 |
| 7 | Private WhatsApp storage ownership/permissions | **READY** (verified in the built image; failure case detected; survives container recreation). **PENDING** the host directory on the real server | §7 |
| 8 | Redis connectivity + multi-instance ownership | **READY** (two real containers + real Redis). **NOT TESTED** with a live WhatsApp socket | §8 |
| 9 | Staging deployment sequence | **READY** (`ops/staging/README.md`, every step has a success condition) | §9 |
| 10 | Smoke tests for all seven issues | **READY**: API smoke 27/27, browser 27/27 + 6/6 + 12/12 on the production web build. **NOT TESTED**: live WhatsApp reconnect (QA-004) | §10 |
| 11 | Financial reconciliation checks | **READY** (R1–R9, all clean; proven to detect tampering). **PENDING** run on real data | §11 |
| 12 | Rollback procedures | **READY** (SQL rollback verified; app rollback documented). **NOT TESTED** on a real host | §12 |
| 13 | Final acceptance report | This document — **decision in §14** | |

## 2. Pending source-change audit (task 1)

`git status`: 80 modified, 141 untracked (about 285 files counting untracked folders). Nothing is committed.

| Group | Files | Belongs to this release? |
|---|---|---|
| **A. Functional QA-001…007 (this release)** | API: `cash-book.helper.ts`, `physical-cash-flow.helper.ts`, `accounting-outbox.tx.ts`, `accounting-outbox.service.ts`, `finance.service.ts`, `customer-credit.service.ts`, `supplier-ap.service.ts`, `pos.module.ts`, `inventory.service.ts`, `cash-management.module.ts`, `whatsapp.service.ts` + `whatsapp-session-lock.ts` + `whatsapp-reconnect.helper.ts`, `prisma/schema.prisma`, migration `20261122090000_bank_account_restrict_delete`. Web: `pos-custom-items.ts`, `pos-qr-cache.ts`, `bank-account.ts`, `pos-overlay.tsx`, `pos-qr-payment.tsx`, `payment-qr-settings-tab.tsx`, `bank-accounts-card.tsx`, `cash-bank-hub.tsx`, six credential forms (`method="post"`). Tests: `test-int/**`, `test/payment-qr-403…`, `test/pos-checkout-reliability…`, new `*.spec.ts` / `*.test.ts` | **Yes** |
| **B. Security remediation (earlier phases)** | `nginx/*.conf` (private-folder guard), `docker-compose.yml` (private mount, **+ `TRUST_PROXY_HOPS`**), `apps/api/Dockerfile`, `.gitignore`, `security-scan.service.ts`, `whatsapp-auth-dir.helper.ts`, `nginx-private-uploads.spec.ts`, 37 modified + new `scripts/*.py` (credentials now read from the environment, `scripts/_ssh_config.py`) | **Yes** (separate commit recommended) |
| **C. Staging package (this phase)** | `docker-compose.staging.yml`, `.env.staging.example`, `ops/staging/**`, `apps/api/src/main.ts` (**new**, see finding F-1), `test-int/browser/*` | **Yes** |
| **D. Reports** | `docs/QA/*.md` | Yes (documentation) |
| **E. UNRELATED — existing work in progress (theme / layout / dashboard)** | `components/layout/sidebar.tsx` (+643/−281), `app/(dashboard)/layout.tsx`, `app/globals.css`, `app/retail-theme.css`, `lib/accent-theme.ts`, `lib/design-tokens.ts`, `lib/theme-colors.ts`, `components/layout/theme-customizer.tsx`, `components/layout/header.tsx`, `components/layout/keyboard-shortcuts-dialog.tsx`, `components/dashboard/dreams-dashboard.css`, `dreams-dashboard-charts.tsx`, `tailwind.config.ts`; untracked `lib/nav-access.ts`, `lib/color-contrast.ts`, `hooks/use-unread-notifications.ts`, `public/brand/_test-on-white.png` | **No** — not part of QA-001…007. They compile and were included in every build above, but **their behaviour has not been acceptance-tested**. Decide: ship knowingly, or stash/commit separately |
| **F. Not for the repository** | `apps/web/tsc-out.txt`, `apps/mcp-server/` (its `.env.example` and README hold a login password literal), untracked `scripts/_seed_bakery_demo.js`, `clear_deen_users.py`, `set_cake_email.py`, `set_deen_email.py`, `wipe_deen_all_data.py` (demo-account password literals), ~100 other untracked ad-hoc ops scripts, `.env.staging` (git-ignored, throw-away) | **No — keep out of any commit** until cleaned; secret scan of the pending set found only these |

Recommended commit split (paths, not executed): (1) security remediation, (2) functional A + tests, (3) staging package C, (4) docs D, (5) the owner's UI work E on its own.

## 3. Isolated staging environment (task 4) — READY as code

`docker-compose.staging.yml` (project `hexalyte-staging`): own network and named volumes; every published port bound to `127.0.0.1`; secrets only from `.env.staging` (template provided; random throw-away values were used in the rehearsal and discarded); same hardening as production (uid 1001, read-only root, `cap_drop: ALL`, `no-new-privileges`); staging cannot touch DNS/SSL/Cloudflare (those variables blanked) and does not auto-resume WhatsApp; two API instances (`--profile multi`) share Redis and the private volume to test ownership; DB pool configurable (`connection_limit=20`).
**PENDING for a real staging:** host/VM, domain + TLS + reverse proxy (staging must set `X-Forwarded-Proto: https`: the web app's middleware redirects plain-HTTP requests to HTTPS, so direct access to the web port redirects to `https://0.0.0.0:3000` — expected, not a defect), a **sanitised** restore of a production backup, and fresh secrets.

## 4. Migration and rollback (task 3) — READY locally

One migration: `20261122090000_bank_account_restrict_delete` (constraints only, no row touched).

| Check | Result |
|---|---|
| Fresh install through the built image (`db-fresh-install.mjs`): baseline + all later migrations, schema equals `schema.prisma` | PASS |
| `prisma migrate deploy` again | "No pending migrations" (62 found) |
| Upgrade path from the old rules (earlier phase, throw-away DB) | delete rules cascade×1, set-null×2, restrict×2 → restrict×5; re-run no-op |
| `ops/staging/rollback-bank-account-fk.sql` | restores **exactly** the previous rules (sale_payments SET NULL, bank_transactions CASCADE, cheques SET NULL, others RESTRICT) |
| Behaviour after rollback (inside a rolled-back transaction) | deleting an account **destroys its bank transactions** (0 rows left) — the old unsafe rule, confirming the rollback is real |
| Re-apply forward SQL | all RESTRICT; delete with history refused (`violates foreign key constraint`) |
Rollback also needs `prisma migrate resolve --rolled-back 20261122090000_bank_account_restrict_delete` so `migrate deploy` does not re-apply it. **PENDING:** the same on a sanitised copy of production (lock time on large tables is expected to be negligible: metadata-only, but unmeasured).

## 5. Role-review dry-runs (task 5) — READY

* `ops/staging/role-gap-report.sql` (read-only, keys and counts only) lists every shop whose Tenant Admin lacks catalogue permissions.
* Rehearsal: a legacy-style shop (Tenant Admin with 7 of 43 permissions, incl. no `accounting:update`) appeared at the top of the report. The reviewed script's **dry run inside the built image** reported "71 change(s)… Tenant Admin keep 7, add 36… Dry run only — nothing was changed". A **wrong `--confirm` was refused**. `--apply --confirm <id> --actor … --add-only` raised Tenant Admin to **43/43**, left the custom role (1 permission) untouched, wrote an audit row, and the gap report then showed the shop clean.
* **Behaviour to read before applying (finding F-3):** the apply also **creates missing standard roles** (Cashier, Branch Manager) — "add-only" does not prevent that. Review the dry-run output per tenant.
* **PENDING:** the real list of affected tenants (needs the staging copy). Production tenants must each be dry-run first.

## 6. Accounting outbox backlog (task 6) — READY (queries), PENDING (numbers)

`ops/staging/outbox-backlog.sql` (read-only) shows status/type counts, **exactly what the sweeper would pick up** (PENDING/FAILED, attempts < 10, older than 60 s, **all tenants**, every 2 minutes), failure reasons, stuck `PROCESSING`, business records with **no** outbox row, and POSTED rows without a journal.
Decision rules before deploying: (a) `would_be_processed = 0` → enable the sweeper normally; (b) any FAILED/PENDING backlog → read the reasons, fix causes (closed financial period, missing account mappings), or deploy with `ACCOUNTING_OUTBOX_SWEEP=false` first and process deliberately per tenant; (c) sales/payments with no outbox row cannot be recovered by the sweeper (existing `scanMissing` handles sales/GRNs/expenses; customer payments are covered going forward). Rehearsal result: 48 outbox rows (33 SALE, 15 CUSTOMER_CREDIT_PAYMENT), **all POSTED, max 1 attempt**, 0 pending, 0 stuck, 0 missing, 0 posted-without-journal. The sweeper itself had nothing to do (consistent with the fast path working).

## 7. Private WhatsApp storage (task 7) — READY (rehearsal), PENDING (real host)

`ops/staging/verify-private-storage.sh`, run inside the running container: **10/10 PASS** on both API instances — runs as uid 1001; auth dir outside uploads; private root owned by uid 1001, mode 700; can write; new files mode 600; nothing under `uploads/whatsapp-sessions`; no `/tmp/whatsapp-sessions` fallback. **Failure detected:** with a root-owned, mode-755 private directory (what a plain host `mkdir` creates) the same script reports FAIL on ownership/mode/writability. (A named Docker volume would have hidden this because Docker copies the image's ownership into an empty volume — production uses a host bind mount, so the host directory **must** be created as `mkdir -p storage-private && chown 1001:1001 storage-private && chmod 700 storage-private`.) **Container recreation:** a session file written before `--force-recreate` was present afterwards (owner 1001, mode 600), and the second API instance saw the same store. **Note:** two instances only share sessions when they share this directory (same host/volume, or shared storage); instances on different hosts need shared storage plus the Redis lock. **PENDING:** the same script on the real server after the move described in the security readiness report §9.

## 8. Redis and multi-instance ownership (task 8) — READY (rehearsal)

`ops/staging/verify-redis-ownership.cjs` uses the app's own compiled lock class inside the containers: Redis reachable with the configured password from both APIs; owner A acquires, B refused, A renews, B cannot renew or release A's lock, B takes over after release, an expired (crashed) owner is replaced — **8/8 PASS**; **cross-container:** api-a holds a tenant key, api-b probe is **REFUSED**. Service-level behaviour (reconnect, resume, ownership loss, shutdown) was verified in the previous phase with a simulated Baileys. **NOT TESTED:** a live WhatsApp socket under multi-instance ownership. That needs a dedicated test WhatsApp number and **your explicit approval**; no staging step opens a socket (`WHATSAPP_AUTO_RESUME=false`).

## 9. Deployment sequence (task 9) — READY

See `ops/staging/README.md` (12 steps, each with a success condition) and the rollback list. Order: secrets → build → data+services → read-only pre-flight (outbox, role gaps) → migration on the restored copy → role review per tenant → start apps → storage/Redis checks → smoke + browser → reconciliation → log review → business sign-off.

## 10. Staging smoke tests (task 10) — READY

`ops/staging/staging-smoke.cjs` (refuses production-looking URLs; never calls WhatsApp connect): **27/27 PASS** against the containerised API:
QA-001 credit sale, partial payment (outstanding 300→200), replayed key idempotent, 4 concurrent card payments, ledger closing = stored balance · QA-002 admin creates a QR (the originally failing call → 201), cashier sees it immediately, disabled bank hides it, cashier refused with a readable reason · QA-003 cash-flow report reconciles, CSV downloads, 3 simultaneous day-end closes → exactly one succeeds · QA-004 WhatsApp status answers (`disconnected`, no connection attempted) · QA-005 two cashiers/one unit → one sale, 6 parallel same-key requests → one sale, 20 simultaneous checkouts all complete · QA-006 create, rename without details, stale edit → 409, disable · QA-007 cashier refused (403 manager), manager sells a mixed cart.
Browser (local Chrome against the **production web build** + hardened API containers): roles × viewports **27/27**; custom items by role **6/6**; Cash & Bank page **12/12** (Day End is the last section on desktop and mobile, no runtime errors).
Manual acceptance list for the business owner (§13) covers what automation cannot.

## 11. Financial reconciliation (task 11) — READY

`ops/staging/reconciliation-checks.sql`: R1 customer balance = ledger · R2 charge allocation = payments + credit notes · R3 cash-book running balance · R4 non-cash rows in the cash book · R5 journals balanced · R6 outbox vs sales/payments/journals · R7 shift expected cash recomputed · R8 variance arithmetic · R9 negative stock where disallowed. After the smoke run **all nine are empty**. **Proof the checks are not vacuous:** inside a transaction that was then rolled back, a +5 tamper on customer balances, a +1 on a cash-book row and a nulled journal link were reported by R1 (3 customers), R3 (1 row) and R6 (1 row); after rollback the data was clean again. Caveat: R3/R4 may legitimately show rows created **before** this release (old unlocked writes, non-cash rows) — compare against the deploy timestamp. **PENDING:** run on real data.

## 12. Rollback (task 12) — READY, NOT TESTED on a real host
Application: previous image tags, no data-format change. Migration: verified rollback SQL (§4). Sweeper: `ACCOUNTING_OUTBOX_SWEEP=false`. WhatsApp auto-resume: `WHATSAPP_AUTO_RESUME=false`. Proxy trust: `TRUST_PROXY_HOPS=0`. Cash-book policy (non-cash no longer in the cash book): code-only, reversible by redeploying the previous API. Staging teardown: `down -v` (project-scoped) — executed in the rehearsal, 0 resources left.

## 13. New findings from this phase

| ID | Finding | Status |
|---|---|---|
| **F-1** | **Rate limiting treated the whole platform as one client.** `trust proxy` was never set, so behind nginx every request appears to come from the proxy; the limiter (10 req/s, 50/10 s, 200/min **per IP**) then throttled everyone together. Reproduced: 30 requests claiming 30 different client IPs → **10 served, 20 × 429**. In production this would cap the *entire platform* at ~10 requests/second and plausibly explains intermittent checkout errors (QA-005 hypothesis, **unverified in production**). **Fix:** `TRUST_PROXY_HOPS` (default 0, safe) read in `main.ts`; set to `1` in `docker-compose.yml` and the staging compose. After the fix: 30 distinct clients → **30 × 200**; one client is still limited (10 served, 20 × 429) as intended. | **READY** in code and rehearsal. **PENDING:** confirm the real topology — if Cloudflare (or another CDN) sits in front of nginx, nginx must restore the visitor IP (`set_real_ip_from <CDN ranges>; real_ip_header CF-Connecting-IP`) or the bucket becomes "per CDN edge". Also **NOT TESTED:** how many API calls one POS page load makes versus 10 req/s |
| F-2 | The API image's entrypoint ignores the command: `docker compose run api-a node scripts/…` silently starts another API server. One-off tasks need `--entrypoint node`. | Documented in the runbook |
| F-3 | Role review apply creates missing standard roles even with `--add-only`. | Documented; read each dry run |
| F-4 | `prisma:error … Unique constraint failed (tenantId, clientRequestId)` appears in logs under duplicate-request races — it is the idempotency guard working (the request is turned into a replay). Noisy for alerting. | Note for ops |
| F-5 | `step1b-audit-sql.e2e-spec.ts` needs `docs/ops-sql/step1b-audit-2026-11.sql`, which never existed in the repository. | Pre-existing; open |
| F-6 | Web `next.config.ts` sets `ignoreBuildErrors` / `ignoreDuringBuilds`; the build passes, and a separate `tsc --noEmit` is clean (0 errors) — keep running `tsc` in CI. | Note |
| F-7 | Prod compose needs `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` from the server `.env` (blank otherwise). | Existing; unchanged |

## 14. Final staging acceptance decision

**READY TO DEPLOY TO A REAL STAGING ENVIRONMENT. STAGING ACCEPTANCE: PENDING. PRODUCTION: NOT READY — and local results alone do not change that.**

Blocking / pending before staging acceptance can be signed:
1. **PENDING (owner):** a staging host and a **sanitised copy of production data** — the migration, role gap list, outbox backlog, reconciliation and performance checks mean little on an empty database.
2. **PENDING (owner):** decide how to commit/stage the pending tree (§2): exclude group F, decide on group E (unrelated UI work). Clean or exclude the files holding demo/login passwords.
3. **PENDING (owner):** confirm the proxy/CDN topology for F-1 and set `TRUST_PROXY_HOPS` accordingly in the target environment.
4. **PENDING (owner, explicit approval needed):** live WhatsApp test with a dedicated number (QA-004 stays *fixed but not verified* until then).
5. **BLOCKED for production (from the security reports):** credential rotation, `.env.production` cleanup, public-repository decision, server assessment — unchanged and not addressed by this package.

Business acceptance checklist for staging (owner signs): create a credit sale and take partial/full payments (balances agree with the customer ledger); add a bank account, rename it, disable it, confirm the QR disappears from the POS at once; add a QR as Tenant Admin (the original 403 must not recur); sell a Demo item as a manager and confirm a cashier is stopped early; run a normal cash sale, a QR sale and a mixed cart; close a shift (with and without variance) and confirm the second close is refused; open Cash & Bank and confirm Day End is last; export the physical cash-flow CSV and compare to the till; verify WhatsApp shows "not connected" and nothing is sent; check the reconciliation SQL is empty; check API logs for pool/permission errors.

Do **not** declare production ready until the staging copy of real data passes these checks and the production-only steps in the security readiness report are executed and verified.
