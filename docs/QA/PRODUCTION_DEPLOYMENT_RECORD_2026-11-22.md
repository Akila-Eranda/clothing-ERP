# Production deployment record — 2026-11-22

Server: the production host (`/opt/fashionerp`, docker compose project). Code: `origin/main` at `f1bd88b` (6 commits fast-forwarded from `b8663f6`). No secret appears in this record.

## What was done (in order)
| # | Step | Result |
|---|---|---|
| 1 | Push 6 local commits to GitHub | `b8663f6..f1bd88b` |
| 2 | Read-only preflight | Git clean except untracked backups (clean fast-forward); no CDN in front of nginx (no `cf-ray`), so `TRUST_PROXY_HOPS=1` is correct; JWT secrets are not placeholders; disk was 81% used |
| 3 | **Backups** (new files only) in `/root/backups/pre-qa-20261122-170152/` | `db.sql.gz` (26.6 MB, gzip verified, 162 tables), `storage.tgz` (14.5 MB), copies of `.env` (mode 600), `docker-compose.yml`, `nginx.clothing.conf` |
| 4 | Read-only SQL on the live DB (`BEGIN READ ONLY`) | Outbox backlog and role gaps — see findings |
| 5 | `git merge --ff-only origin/main` | OK |
| 6 | Free build cache, build `api` then `web` serially (memory-limited host) | Both exit 0; disk 81% → 60% |
| 7 | Migration `20261122090000_bank_account_restrict_delete` via the new image | Applied; all 5 FKs to `bank_accounts` are RESTRICT |
| 8 | `storage-private/` created (uid 1001, 0700); API stopped; `storage/whatsapp-sessions` (4 tenant folders) moved to `storage-private/whatsapp-sessions`; API recreated | API healthy; `TRUST_PROXY_HOPS=1`, `WHATSAPP_AUTH_DIR=/app/private/whatsapp-sessions`, uid 1001 |
| 9 | Web recreated | Up |
| 10 | nginx config tested in a throw-away container on the compose network, then nginx recreated | `nginx -t` OK |
| 11 | Role review, dry run for 15 shops then `--apply --add-only` for 14 | 14 shops: Tenant Admin 43/43 (the `grocery` shop included). Audit rows written (actor `deploy-20261122`) |

## Verification after the deploy
* Public: product image 200; `/uploads/whatsapp-sessions/<tenant>/creds.json` **404**, encoded variant **404**; login 200; API health through nginx 200. (`sales.hexalyte.com` is not part of this nginx config; it was not changed.)
* API log, 40 min: 0 rate-limit (429), 0 connection-pool timeouts, 0 EACCES. WhatsApp auto-resume reconnected 2 saved sessions; no message was sent by the deploy.
* Read-only reconciliation: customer balance mismatches 0; unbalanced journals 0; negative stock where disallowed 0. Outbox: 15,098 POSTED, 9 FAILED, 9 SKIPPED.

## Findings that need an owner decision
1. **WhatsApp credentials were publicly downloadable until this deploy** (nginx served the whole uploads folder). Treat all 4 saved sessions as possibly copied: unlink devices on the phones and re-pair, then the old files are useless.
2. **12 shops have a Tenant Admin role with 0 permissions** (`agri, aki, akila, akilq, bhagi, general, hardware, jo-lanka, test, testpw69807, testpw95602, tyreshop`): their admins can do nothing permission-gated unless another role covers them. Not changed. Also not changed: `demo` (the review would widen its Cashier) and `rathna-super` (suspended).
3. **9 old sales cannot be posted to the ledger**: "Debits must equal credits" with differences of 1–5 cents (per-line rounding). They stay FAILED (retried up to 10 times, then stop). An accountant should review them. 1,582 older completed sales and 4 customer payments have no ledger intent at all (created before the outbox existed).
4. **Cashiers are hitting the custom-item rule in production** (3 × 403 "Custom bill-only items require manager authorization" in 40 minutes). The new web build warns earlier; train staff to use a manager PIN.
5. The server accepts **root login with a password** (`PermitRootLogin yes`, `PasswordAuthentication yes`), and that password was shared in a chat/screenshot: rotate it and move to key-only login.
6. The remaining items from `PRODUCTION_SECURITY_READINESS_REPORT.md` (database/Redis/Keycloak secrets, public repository history) are **not** addressed by this deploy.

## Rollback
App: `git reset --hard b8663f6 && docker compose build api web && docker compose up -d --no-deps --force-recreate api web nginx` (the previous nginx config is in the backup folder). WhatsApp sessions: move `storage-private/whatsapp-sessions` back only if reverting the compose file too (this re-opens the public exposure unless the nginx guard stays). Migration: `ops/staging/rollback-bank-account-fk.sql` then `prisma migrate resolve --rolled-back 20261122090000_bank_account_restrict_delete`. Roles: additions only; remove by editing the role if required (audit rows identify the change). Database: `db.sql.gz` in the backup folder.
