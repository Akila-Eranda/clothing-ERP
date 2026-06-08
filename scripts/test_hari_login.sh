#!/bin/bash
echo "Testing hari-cloth-shop login..."
curl -s -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: hari-cloth-shop" \
  -d '{"email":"Harithaweerasekara128@gmail.com","password":"Tenant@123456"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print("SUCCESS - Token received" if "accessToken" in str(d) else f"FAILED: {d.get(\"message\", d)}")'
