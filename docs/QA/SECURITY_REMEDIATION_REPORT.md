# HEXALYTE ERP — Security Remediation Report (Phase 1)

Date: 2026-11-22. Scope: three findings from the read-only audit. **Local changes only.** Nothing was deployed, no production host was contacted, no service restarted, no credential changed on any server. No secret value appears in this report (values were handled in shell variables and masked in all output).

## 0. Summary

| # | Finding | Verified? | Local fix | Status |
|---|---|---|---|---|
| 1 | WhatsApp credentials (and other private folders) publicly downloadable via nginx `/uploads/` | **Reproduced locally** with dummy files in a real nginx container | nginx deny rules in all 3 configs that serve uploads; credentials moved out of the public volume in `docker-compose.yml`; code default moved; startup warning + security-scan check | **Fixed in the repo and proven on a local nginx. NOT fixed in production until deployed** (§6) |
| 2 | Root password hardcoded in scripts | **Verified**: 25 untracked files, plus an older root password in 9+ tracked files (on `origin/main`) | 64 scripts now read credentials from the environment via `scripts/_ssh_config.py`; no password literal left in any `scripts/*.py` | **Code fixed. Passwords are still valid until rotated on the server** (§7) |
| 3 | Pasted JWT | **Verified** type/lifetime; access token **already expired** (06:47Z; checked 07:33Z) | none needed for this token; recommendations in §4 | Low residual risk for this token. **Bigger related finding:** tracked `.env.production` (§4.4) |

Not claimed as fixed: anything on the production server. Findings 1 and 2 stay open there until the steps in §6–§7 are performed with your approval.

---

## 1. Finding 1 — Public WhatsApp session files

### 1.1 Verified facts
- API writes WhatsApp (Baileys) login state to `WHATSAPP_AUTH_DIR/<tenantId>/` (multi-file auth state incl. `creds.json`). `docker-compose.yml` set `WHATSAPP_AUTH_DIR=/app/uploads/whatsapp-sessions`, i.e. inside the uploads volume `./storage`.
- The same `./storage` is mounted read-only into nginx (`./storage:/var/www/uploads:ro`) and every server block that serves uploads uses `location /uploads/ { alias /var/www/uploads/; }` (`nginx/nginx.clothing.conf` ×4, `nginx.conf`, `nginx.standalone.conf`). `nginx.prod.conf` does not serve uploads.
- The API itself does not serve static files (`main.ts` has no `useStaticAssets`); uploads are public by design: `/uploads/<tenantId>/<folder>/<uuid>.<ext>` (`files.module.ts:86`), written with random names and a content-type allow-list.
- A second private folder lives beside it: `.ssl-pending/` (timestamp files named after tenant subdomains — low sensitivity, reveals tenant list). A **host-side SSL job reads it from `./storage/.ssl-pending`**, so it was deliberately **not** moved (only blocked from the web).
- `storage/` is git-ignored; real server contents were **not inspected** (no production access).

### 1.2 Reproduction (local, safe)
Dummy files (`whatsapp-sessions/T1/creds.json`, `.ssl-pending/x.pending`, `T1/products/a.png`) served by `nginx:alpine` with the **original** `location /uploads/` block:

| URL | Original config | Fixed config |
|---|---|---|
| `/uploads/T1/products/a.png` (legit public image) | 200 | **200** |
| `/uploads/whatsapp-sessions/T1/creds.json` | **200 (leak)** | 404 |
| `/uploads/.ssl-pending/x.pending` | **200 (leak)** | 404 |

Fixed config, additional bypass attempts, all **404**: directory URL with/without trailing slash, `//` before the folder, `%77`-encoded letter, different case, `/T1/../whatsapp-sessions/…`, `/./whatsapp-sessions/…`, `…/%2e%2e/%2e%2e/whatsapp-sessions/…`, `%2e`-encoded `.ssl-pending`, and a folder named `whatsapp-sessions` under a tenant. Directory listing is off (nginx default `autoindex off`; no `autoindex on` in any config).

### 1.3 Attack scenario
Anyone who knows a tenant id (it is sent in the `x-tenant-id` header and inside every JWT, so every logged-in user and every leaked token reveals it) requests `https://<shop-host>/uploads/whatsapp-sessions/<tenantId>/creds.json` with no authentication, then runs WhatsApp Web / Baileys with that file and **acts as the shop's WhatsApp number** (read chats, send messages to customers, phishing with payment links). Tenant ids may also be guessable from public subdomains/JWTs seen anywhere. Impact: customer data, impersonation, fraud. Severity: Critical *if files exist on the server in that location* (compose says they do).

### 1.4 Local changes made
| File | Change |
|---|---|
| `nginx/nginx.clothing.conf`, `nginx/nginx.conf`, `nginx/nginx.standalone.conf` | Added `location ~* ^/uploads/(?:.*/)?(?:whatsapp-sessions\|\.ssl-pending\|\.private)(?:/\|$) { return 404; }` before **each** `location /uploads/` (6 blocks). Regex locations take precedence over the prefix location; nginx normalises the URI first, so encoding/`..` tricks hit the rule. |
| `docker-compose.yml` | `WHATSAPP_AUTH_DIR` → `/app/private/whatsapp-sessions`; new API-only bind mount `./storage-private:/app/private` (not mounted in nginx). |
| `.gitignore` | `storage-private/` |
| `apps/api/src/modules/whatsapp/whatsapp-auth-dir.helper.ts` (+ spec) | New pure helpers: default auth folder is outside uploads (`<cwd>/private/whatsapp-sessions`), `isInsideDir`, `publicExposureWarning`. |
| `apps/api/src/modules/whatsapp/whatsapp.service.ts` | Uses the helper; logs a warning if the auth folder is inside the upload root; creates folders with mode `0700`. No change to connect/reconnect behaviour. |
| `apps/api/src/modules/platform-ops/security-scan.service.ts` | Reads the real auth folder and reports a **fail** check "WhatsApp credentials are outside public uploads" when it is under the upload root (so production shows red until migrated). |
| `apps/api/src/shared/security/nginx-private-uploads.spec.ts` | Static regression test: every nginx config serving `/uploads/` has the guard; compose keeps the credentials out of the uploads volume and out of nginx. |

Upload/download behaviour is unchanged: `FilesService`, the `/uploads/` URL scheme and nginx caching for public files are untouched; public image 200 was re-tested.

### 1.5 Tests
- Local nginx container, 14 URL probes before/after (above): **pass**.
- `npx jest --runInBand` on `src/modules/whatsapp`, `src/shared/security`, `src/modules/payment-qr`, `src/modules/pos/pos-sale-guards`: **17 suites, 105 tests passed** (includes the 2 new specs). Redis-connection error lines in the log are the PIN-lockout spec falling back with no local Redis; they do not fail anything.
- `npx tsc --noEmit` (apps/api): **exit 0**.
- Not run: DB-backed e2e suites; a live WhatsApp connection (would contact WhatsApp).

### 1.6 Remaining risk
Until deployed: the exposure exists in production. Even after the nginx rule, **treat every existing WhatsApp session as compromised** if the files were ever there while the route was open: log the account out from the phone (Linked devices) and re-pair, which invalidates the stolen creds. Check nginx access logs for `whatsapp-sessions` requests (read-only).

---

## 2. Finding 2 — Hardcoded root password

### 2.1 Verified facts (values never printed)
- Current root password (12 chars): in **25 files, all untracked, all in `scripts/`** (`_check_*`, `_deploy_*`, `_diag_*`, `_fix_*`, `_sql_tmp`, `_ssh_tmp`, `check_baileys_exports`, …). Shapes: 14× `HOST, USER, PASSWORD = "<ip>", "root", r"…"`, 10× `c.connect(ip, username="root", password=r"…")`, 1× positional `connect`. Purpose of each: operational SSH deploy/diagnostic scripts against the production host `95.217.14.198` (inspected by file name, header lines and the connect/command shape before editing; the edit touched only the credential expression).
- A **different (older) root password** was hardcoded in tracked scripts: 9 files with `password=r"…"` plus ~55 more with `PASSWORD = r"…"`/tuple form (all in `scripts/`). They are **committed and on `origin/main`** (e.g. commit `86ea705`), so that older password is in the remote Git history. Whether it is still valid is unknown (probably rotated, which is why the newer one exists).
- The current password also exists in **local agent checkpoint refs** (`refs/agents/…/checkpoints/turn/*`, commit `8f543ac` etc.). Not on any branch, not pushed.
- Reuse: the same root password is used by every one of these scripts against one host. No other service/file in the repo contains it (full-tree fixed-string scan of tracked + untracked, non-ignored files). Whether the **same value is reused on other systems** (DB, panel, Cloudflare, mail) cannot be determined from the repo — assume yes until rotated.
- Active use: root SSH on the production host is evidently the live deploy path (many scripts, `fail`-free compile).
- Other secrets found while scanning (names only, **not** changed here): `scripts/kc_provision_all.js`, `kc_provision_crazy3.js`, `kc_provision_hari.sh`, `setup-keycloak.sh`, `test-fashionerp-kc.sh`, `verify-auth-hexalyte.sh` (Keycloak client secrets); `scripts/_seed_bakery_demo.js`, `e2e-wave1-browser-relay.spec.cjs`, `test-dashboard.cjs` (demo/test passwords).

### 2.2 Attack scenario
Repo readers (GitHub collaborators, anyone with a copy of the repo/backup/laptop, anyone who gets the agent checkpoints) get root SSH to the production server → full access to all tenants' data, DB, uploads, WhatsApp sessions, JWT secrets.

### 2.3 Local changes made
- New `scripts/_ssh_config.py`: reads `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (preferred) or `DEPLOY_SSH_PASSWORD`/`DEPLOY_PASSWORD`; exits with a clear message if none is set; provides `HOST`, `USER`, `PASSWORD`, `ssh_connect_kwargs()`.
- 64 scripts rewritten mechanically (regex on the credential expression only; 3 patterns): `connect(ip, username=…, password=<literal>)` → `connect(**ssh_connect_kwargs(), …)`, and `HOST, USER, PASSWORD = …` / `PASSWORD = "…"` → `from _ssh_config import …`. No other line changed; CRLF/LF preserved; no script deleted.
- Verification: all `scripts/*.py` byte-compile (0 failures); a scan of the working tree for both root passwords finds **0 files**; no literal `password=`/`PASSWORD =` remains in `scripts/*.py`. The scripts were **not executed** (they would connect to production).

### 2.4 Limits
- Git history still contains the older password (origin) and the agent checkpoints contain the newer one. **Code changes do not remove them; only rotation does** (§7). History rewriting is destructive/outward-facing and was not done; decide after rotation.
- Scripts running without either env var will now stop with an error — intended.

---

## 3. Finding 3 — Exposed JWT

### 3.1 Verified (token contents not reproduced)
- Local-mode **HS256** access token (`auth.service.ts:540-550`, `jwt.strategy.ts` local branch: signature, `iss`, `aud`, `exp` checked); has a random `jti`. Belongs to a tenant-admin user of the grocery **demo** shop.
- Lifetime: `exp − iat = 3600 s` (compose `JWT_ACCESS_EXPIRY=60m`); **issued 05:47:52Z, expired 06:47:52Z on 2026-11-22**. At the time of this check (07:33Z) it was already **expired**, so it is not usable as an access token.
- Per-request validation re-reads the user and role permissions from the DB and requires `status = ACTIVE`; the permission claims inside the token are **not** authoritative. (Correction to the earlier audit: the token's missing `accounting:update` proves the role lacked it **at login time**; current DB state is unverified.)
- Revocation: logout deactivates the `sessions` row (hash of the access token) and sets `isRevoked` on the user's refresh tokens (`auth.service.ts:~370-385`), but the JWT strategy **does not check the session or a denylist**, so a specific access token cannot be revoked before `exp`. Refresh tokens are stored in DB, rotated, and reuse revokes the family (`:289-345`), so refresh tokens **can** be revoked individually.
- Refresh token: separate secret, 7 d (`JWT_REFRESH_EXPIRY`). The pasted request contained no refresh token; whether one was exposed with it is unknown.

### 3.2 Least disruptive invalidation (needs your approval; nothing executed)
1. Access token: nothing to do — already expired.
2. Revoke that user's refresh tokens (`UPDATE refresh_tokens SET "isRevoked"=true WHERE "userId"=…`, or have the user log out / reset password). Affects only that demo user.
3. Signing-key rotation is **not required for this token** (a JWT does not reveal the secret). It **is** required if the secrets in §3.3 are the live ones.

### 3.3 Related finding found during this check — tracked `.env.production`
`.env.production` is **tracked in Git and on `origin/main`** (commits `bc20cb2`, `db4d21c`) and contains non-placeholder-looking values for `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `KC_ADMIN_PASSWORD` (lengths 12–50; values not read into this report). `scripts/deploy_server.py` does `cp .env.production .env`, so this file may be the **live production environment**. `.gitignore` lists it, but ignore rules do not apply to already-tracked files. If these are the real secrets, anyone with repo access can **forge access/refresh tokens for any user and tenant** (HS256 secret = signing key) and reach DB/Redis. Whether the live server uses these exact values is **unverified**; whether the GitHub repo is public is unknown (no `gh` here).

### 3.4 Recommendation (not implemented — affects all sessions)
Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (and DB/Redis/KC secrets) in the server `.env`, then `git rm --cached .env.production`. Rotation logs every user out once (POS tills need re-login) → do it off-hours. Optional hardening (code, needs a decision): have the JWT strategy reject tokens whose `sessions` row is inactive, or add `tokensValidAfter` on the user — gives per-user/per-token revocation without secret rotation.

---

## 4. Verified vs. fixed

| Item | Verified | Fixed locally | Proven |
|---|---|---|---|
| Public `/uploads/whatsapp-sessions` | yes (local nginx 200) | yes | yes (404; images 200) |
| Public `/uploads/.ssl-pending` | yes | yes | yes |
| WhatsApp creds in public volume | yes (compose) | yes (compose + code) | static spec + tsc; runtime not run |
| Root password in scripts | yes (25 + older in tracked) | yes (64 scripts) | compile + tree scan |
| Password in Git history / agent refs | yes | **no** | — |
| Expired JWT | yes | n/a | exp < now |
| `.env.production` tracked | yes | **no** | — |

## 5. Remaining production risks
1. Exposure live until nginx + compose are deployed; sessions may already be stolen.
2. Both root passwords unrotated; older one public in GitHub history.
3. `.env.production` secrets in Git; JWT forgery possible if they are live.
4. Keycloak client secrets and demo passwords in tracked scripts.
5. `.ssl-pending` not moved (needs the host SSL job changed first); it is now web-blocked only.
6. Root SSH + password authentication on the server (recommend key-only, dedicated deploy user, `PermitRootLogin prohibit-password`).

## 6. Deployment & rollback plan (production — requires explicit approval; not executed)
Prepare on the server (existing `/opt/fashionerp`, per repo scripts):
1. **Backup**: `cp -a storage/whatsapp-sessions storage/whatsapp-sessions.bak` (stays outside web: see step 4).
2. Create private dir: `mkdir -p storage-private && chmod 700 storage-private`.
3. Deploy the new `nginx/*.conf` and `docker-compose.yml`. Validate first: `docker exec fashionerp_nginx nginx -t` equivalent via a throwaway container, then `nginx -s reload` (no downtime).
4. **Move credentials** (before recreating the API container): `mv storage/whatsapp-sessions storage-private/whatsapp-sessions` (keep the `.bak` in `storage-private/`, never under `storage/`).
5. Recreate **only the API container** (`docker compose up -d api`) so `WHATSAPP_AUTH_DIR` points to the new mount. Expect a short API blip; WhatsApp status shows "disconnected" until someone presses Connect (sessions persist on disk).
6. Verify from outside: `curl -I https://<shop-host>/uploads/whatsapp-sessions/<tenantId>/creds.json` → 404; a product image URL → 200; WhatsApp Connect works; Platform → Security scan shows the new check green.
7. Check nginx access logs for earlier requests to those paths; if any non-staff hits, treat as breach: unlink devices from the WhatsApp phones, re-pair.
**Rollback**: nginx — restore previous conf, reload. Credentials — `mv storage-private/whatsapp-sessions storage/whatsapp-sessions` and revert the compose env var (only if the new mount fails; this re-opens the exposure unless the nginx rule stays, so keep the nginx rule).

## 7. Credential rotation checklist (no values here)
- [ ] Rotate server root password; add your SSH public key; set `PermitRootLogin prohibit-password` and `PasswordAuthentication no` once key login is confirmed (keep a second session open while testing).
- [ ] Create a dedicated deploy user; set `DEPLOY_SSH_KEY` locally instead of passwords.
- [ ] Check other places the old/new root password may have been reused (hosting panel, DB, mail, Cloudflare account) and change them.
- [ ] Rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (all users re-login), `POSTGRES_PASSWORD` (change in DB and `.env` together), `REDIS_PASSWORD`, `KC_ADMIN_PASSWORD`, Keycloak client secrets, `TENANT_SSL_HOOK_SECRET`, Cloudflare token if it was ever in scripts.
- [ ] `git rm --cached .env.production`; keep secrets only on the server / a secret manager.
- [ ] Decide on history cleanup (`git filter-repo`/BFG + force-push + collaborators re-clone) **after** rotation; delete local `refs/agents/*` checkpoints only with your OK.
- [ ] Re-pair all WhatsApp sessions if exposure is confirmed.
- [ ] Re-run `git log -S` and the tree scan after cleanup to confirm nothing remains.

## 8. Files changed (this phase)
`nginx/nginx.clothing.conf`, `nginx/nginx.conf`, `nginx/nginx.standalone.conf`, `docker-compose.yml`, `.gitignore`, `apps/api/src/modules/whatsapp/{whatsapp.service.ts, whatsapp-auth-dir.helper.ts, whatsapp-auth-dir.helper.spec.ts}`, `apps/api/src/modules/platform-ops/security-scan.service.ts`, `apps/api/src/shared/security/nginx-private-uploads.spec.ts`, `scripts/_ssh_config.py` (new) and 64 `scripts/*.py` (credential expression only). Pre-existing uncommitted edits in `apps/web/...` are not mine and were not touched. Nothing committed or pushed.
