# M4: password reset bound to the wrong account — proposal for review

**Status:** ON HOLD (owner, 6 Nov 2026). Nothing below is implemented. This document is for review only.

## 1. The defect

| Step | Today (`auth.service.ts`) | Problem |
|---|---|---|
| Request | `forgotPassword` finds `user.findFirst({ email })` in **any** shop and stores `password_resets(email, token)` | With the same email in two shops, the email goes to whichever user Postgres returns first |
| Reset | `resetPassword` loads the token, then `user.findFirst({ email: resetRecord.email })` | Updates the **first** user with that email, which can be another shop's account. The person who clicked the link may change a password they do not own |
| Storage | `token` is a plain UUID | Anyone with read access to the table (backups, support queries) can use pending links |

Multi-shop owners and staff who reuse one email are exactly the users of a 10-shop SaaS, so this is realistic, not theoretical.

## 2. Proposed schema change (additive only)

```sql
-- migration: 2026111x_password_reset_binding (expand only; no existing row is changed)
ALTER TABLE "password_resets"
  ADD COLUMN "userId"   TEXT NULL,
  ADD COLUMN "tenantId" TEXT NULL;
CREATE INDEX "password_resets_userId_idx" ON "password_resets" ("userId");
```

```prisma
model PasswordReset {
  id        String    @id @default(cuid())
  email     String
  token     String    @unique          // new rows: "sha256:<hex of the emailed token>"
  userId    String?                     // new: the exact account the link resets
  tenantId  String?                     // new: that account's shop (audit / support)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([token])
  @@index([userId])
  @@map("password_resets")
}
```

- No foreign keys on purpose: rows stay valid if a user is later removed, and the migration takes no locks on `users`.
- No backfill and no `UPDATE` of existing rows. Pending legacy rows keep `userId = NULL`.
- Classification: **additive migration** (release plan category 2). Takes a brief `ACCESS EXCLUSIVE` lock on `password_resets` only (a small table); no rewrite, because the new columns are nullable and have no default.

## 3. Proposed code change

**Request (`POST /auth/forgot-password`):**
1. Require the shop, exactly like login (header or `{shop}.shop.hexalyte.com`). Missing → 400 "Choose your shop workspace".
2. Look up `user` by `(tenantId, email)`. Not found → return 200 silently (unchanged: no account enumeration).
3. Generate a 32-byte random token; email it; store `token = "sha256:" + sha256(token)`, `userId`, `tenantId`.
4. Throttle per IP and per email (ties in with F-25).

**Reset (`POST /auth/reset-password`):**
1. Hash the submitted token and look up `sha256:<hash>`.
2. Refuse if not found, used, expired, **or `userId` is NULL** (legacy row). The message tells the user to request a new link.
3. Update exactly `user.id = userId` (and check that user is still in `tenantId` and active), mark the row used, and invalidate that user's other pending resets, all in one transaction.

**Web:** on `{shop}.shop.hexalyte.com` the shop is already sent automatically. On the plain `shop.hexalyte.com` page, the forgot-password form needs a "Shop workspace" field (same as the login page).

## 4. Backward compatibility and rollback

| Scenario | Effect |
|---|---|
| New code, links issued **before** the release | Refused (legacy rows have no `userId`); users click "Forgot password" again. Links expire after 1 h anyway, so the impact window is at most one hour after the deploy |
| Rollback to the old app after the migration | The old code ignores the new columns and keeps working. Links issued by the new code fail under the old code, because it looks up the raw token while the row holds a hash. This fails closed: no wrong account is changed, and users request a new link |
| Old app writing rows while new columns exist | Works (columns are nullable) |
| Database rollback | Not needed. The columns can stay; dropping them would be a separate, later "contract" release |
| Existing customer data | Unchanged: no user, shop or existing reset row is modified by the migration |

## 5. Tests to add before it can be marked TESTED

- Unit: hashing and lookup; legacy row refused; expired / used refused; message wording.
- e2e (real DB): the same email in shops A and B → a reset requested from A changes only A's user, B's hash is byte-identical before and after; missing shop → 400; unknown email → 200 and no row; a second reset link invalidates the first.
- Migration gate (as for the decimal migration): snapshot before and after; only `password_resets` structure changes; the old app (main) still requests and completes resets against the migrated database.

## 6. What the owner needs to decide

1. Approve the additive migration in section 2.
2. Accept that pending reset links (≤ 1 hour old) stop working at release time.
3. Accept that `forgot-password` requires a shop (header, shop host, or a field on the plain domain).
