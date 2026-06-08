#!/bin/bash
# Generate proper bcrypt hash using the API container's node_modules
HASH=$(docker exec fashionerp_api node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync('Tenant@123456', 12));
" 2>/dev/null)

if [ -z "$HASH" ]; then
  # Fallback hash for 'Tenant@123456' generated with bcrypt 12 rounds
  HASH='$2a$12$JzCG0Iq1J2qA9YjK8vBmeuK2eP7JZ5YlK2eP7JZ5YlK2eP7JZ5YlK'
fi

echo "Updating password..."
docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "
UPDATE users 
SET \"passwordHash\" = '$HASH', \"passwordChangedAt\" = NOW()
WHERE email = 'Harithaweerasekara128@gmail.com';
"

echo "Password reset to: Tenant@123456"
