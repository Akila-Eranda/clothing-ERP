#!/bin/bash
# Update password in local DB
NEW_HASH='$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8.LewKyYJ1yy1Y8/xqG'  # 'Tenant@123456'
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
UPDATE users 
SET \"passwordHash\" = '$NEW_HASH', \"passwordChangedAt\" = NOW()
WHERE email = 'Harithaweerasekara128@gmail.com';
"
echo "Password reset to: Tenant@123456"
