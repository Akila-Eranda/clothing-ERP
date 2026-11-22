-- READ-ONLY. Which shops' standard roles are missing permissions that exist in the permission catalogue?
-- (the cause of 403 on bank-account / QR edits: Tenant Admin without accounting:update). Prints keys and counts only.
-- Then, per tenant:  review-system-roles.ts --tenant <id>   (dry run)  ->  --apply --confirm <id> --actor "<name>" --add-only
WITH catalogue AS (SELECT p.id, p.resource || ':' || p.action AS key FROM permissions p),
     have AS (
       SELECT rp."roleId", c.key
       FROM role_permissions rp JOIN catalogue c ON c.id = rp."permissionId"
     )
SELECT t.id AS tenant_id, t.subdomain, t.status, t.plan, r.name AS role,
       (SELECT count(*) FROM catalogue)                                    AS catalogue_size,
       (SELECT count(*) FROM have h WHERE h."roleId" = r.id)               AS granted,
       COALESCE((SELECT string_agg(c.key, ', ' ORDER BY c.key)
                 FROM catalogue c
                 WHERE NOT EXISTS (SELECT 1 FROM have h WHERE h."roleId" = r.id AND h.key = c.key)), '') AS missing_keys
FROM tenants t
JOIN roles r ON r."tenantId" = t.id AND r.type = 'TENANT_ADMIN'
ORDER BY (SELECT count(*) FROM catalogue) - (SELECT count(*) FROM have h WHERE h."roleId" = r.id) DESC, t.subdomain;
