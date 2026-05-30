#!/bin/bash
echo "Testing akila tenant login..."
curl -s -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: akila" \
  -d '{"email":"akila@gmail.com","password":"test"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); print("status:", d.get("message") or "OK - token received" if "accessToken" in str(d) else d)'
