#!/usr/bin/env python3
"""Test warranty flow on spare parts tenant (production)."""
import json
import urllib.request
import urllib.error
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = "https://shop.clothing.api.hexalyte.com/api/v1"


def req(method, path, token, tenant, branch="", body=None):
    h = {"Content-Type": "application/json", "Authorization": f"Bearer {token}", "x-tenant-id": tenant}
    if branch:
        h["x-branch-id"] = branch
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body.decode("utf-8", errors="replace")}


def login(email, password, tenant_slug):
    code, d = req("POST", "/auth/login", "", tenant_slug, body={"email": email, "password": password})
    if code != 200:
        return None
    u = d["data"]["user"]
    return d["data"]["accessToken"], u["tenantId"], u.get("branchId") or ""


print("=== Warranty Flow Test ===\n")

# 1) Clothing tenant — should block warranty module
cloth = login("admin@demo.fashionerp.com", "Admin@123456", "demo")
if cloth:
    tok, tid, bid = cloth
    code, res = req("GET", "/spare-parts/warranty-claims", tok, tid, bid)
    print(f"Clothing demo GET warranty-claims: HTTP {code} → {res.get('message', res.get('data', 'ok')[:80] if isinstance(res.get('data'), str) else res.get('success'))}")

# 2) Spare parts tenant
sp = login("admin@spareparts.demo.fashionerp.com", "Admin@123456", "spareparts")
if not sp:
    print("Spare parts login FAILED")
    sys.exit(1)

tok, tid, bid = sp
print(f"Spare parts login OK tenant={tid[:12]}...")

code, claims = req("GET", "/spare-parts/warranty-claims", tok, tid, bid)
claim_list = claims.get("data", claims)
if isinstance(claim_list, dict):
    claim_list = claim_list.get("data", [])
print(f"List claims: HTTP {code} count={len(claim_list) if isinstance(claim_list, list) else '?'}")

code, cust = req("GET", "/customers?limit=5", tok, tid, bid)
customers = cust.get("data", cust)
if isinstance(customers, dict):
    customers = customers.get("data", [])
print(f"Customers: {len(customers) if isinstance(customers, list) else 0}")

code, prods = req("GET", "/pos/products", tok, tid, bid)
variants = prods.get("data", prods)
if not isinstance(variants, list):
    variants = []
print(f"Products/variants: {len(variants)}")

if customers and variants:
    c0 = customers[0]
    v0 = variants[0]
    vid = v0.get("variantId") or v0.get("id")
    payload = {
        "customerId": c0["id"],
        "variantId": vid,
        "warrantyMonths": 12,
        "purchaseDate": "2025-06-01",
        "issueDescription": "Test claim - defective part",
    }
    code, created = req("POST", "/spare-parts/warranty-claims", tok, tid, bid, payload)
    print(f"Create claim: HTTP {code}")
    if code == 201 or code == 200:
        claim = created.get("data", created)
        cid = claim.get("id")
        cnum = claim.get("claimNumber")
        print(f"  Created {cnum} status={claim.get('status')}")
        code2, approved = req("PUT", f"/spare-parts/warranty-claims/{cid}", tok, tid, bid, {"status": "APPROVED"})
        print(f"  Approve: HTTP {code2}")
        code3, replaced = req("PUT", f"/spare-parts/warranty-claims/{cid}", tok, tid, bid, {"status": "REPLACED", "resolution": "Replaced under warranty"})
        print(f"  Replace: HTTP {code3} status={replaced.get('data', {}).get('status')}")
    else:
        print(f"  Error: {created.get('message', created)}")
else:
    print("Skip create test — need customers and products in spare parts tenant")
