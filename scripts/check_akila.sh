#!/bin/bash
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
SELECT u.id, u.email, u.status, u.\"firstName\", u.\"lastName\"
FROM users u
JOIN tenants t ON t.id = u.\"tenantId\"
WHERE t.subdomain = 'akila';
"
