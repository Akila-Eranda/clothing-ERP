-- sessions.token held the raw access JWT; it now stores SHA-256(token) as lowercase hex
-- (shared/security/session-token.ts). Hash existing rows in place so a database read cannot
-- yield a replayable bearer token. Idempotent: an already-hashed value is exactly 64 hex chars,
-- which a JWT never is. Data-only; no schema change. sha256() is built in from PostgreSQL 11.

UPDATE "sessions"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" !~ '^[0-9a-f]{64}$';
