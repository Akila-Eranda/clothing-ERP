#!/bin/bash
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
SELECT t.id, t.name, t.subdomain, t.status FROM tenants t WHERE t.subdomain = 'hari-cloth-shop';
"
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
SELECT u.email, u.status, u.\"firstName\"
FROM users u
JOIN tenants t ON t.id = u.\"tenantId\"
WHERE t.subdomain = 'hari-cloth-shop';
"
