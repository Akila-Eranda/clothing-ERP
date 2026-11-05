-- Permission catalogue (audit F-06). The API checks 43 permissions; the seed created 35, so 8 used by
-- ~60 endpoints (accounting:update/delete, suppliers:update/delete, returns:create/read/update,
-- settings:read) existed nowhere and could be granted to nobody — shop admins got 403 on journal
-- approval, supplier payments and returns.
--
-- Data safety: INSERT only, into the global permissions catalogue. Existing rows are untouched
-- (ON CONFLICT DO NOTHING) and NO role is granted anything here (role_permissions is not touched).
-- Existing shops receive new permissions only through the reviewed per-tenant step
-- (scripts/review-system-roles.ts); the automatic role sync on login was removed in the same change.
-- Source of truth: apps/api/src/shared/security/permission-catalogue.ts (kept in sync by its spec).

INSERT INTO "permissions" ("id", "resource", "action", "description")
SELECT 'perm_' || v.resource || '_' || v.action, v.resource, v.action, NULL
FROM (VALUES
  ('accounting', 'create'),
  ('accounting', 'read'),
  ('accounting', 'update'),
  ('accounting', 'delete'),
  ('cash', 'create'),
  ('cash', 'read'),
  ('cash', 'update'),
  ('customers', 'create'),
  ('customers', 'read'),
  ('customers', 'update'),
  ('customers', 'delete'),
  ('hr', 'create'),
  ('hr', 'read'),
  ('hr', 'update'),
  ('inventory', 'create'),
  ('inventory', 'read'),
  ('inventory', 'update'),
  ('products', 'create'),
  ('products', 'read'),
  ('products', 'update'),
  ('products', 'delete'),
  ('purchases', 'create'),
  ('purchases', 'read'),
  ('purchases', 'update'),
  ('reports', 'read'),
  ('returns', 'create'),
  ('returns', 'read'),
  ('returns', 'update'),
  ('roles', 'create'),
  ('roles', 'read'),
  ('roles', 'update'),
  ('sales', 'create'),
  ('sales', 'read'),
  ('sales', 'update'),
  ('settings', 'read'),
  ('suppliers', 'create'),
  ('suppliers', 'read'),
  ('suppliers', 'update'),
  ('suppliers', 'delete'),
  ('users', 'create'),
  ('users', 'read'),
  ('users', 'update'),
  ('users', 'delete')
) AS v(resource, action)
ON CONFLICT ("resource", "action") DO NOTHING;
