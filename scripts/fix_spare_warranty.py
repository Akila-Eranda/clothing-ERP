#!/usr/bin/env python3
"""Set warranty months on spare parts demo products (production hotfix)."""
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


def login():
    code, d = req("POST", "/auth/login", "", "spareparts", body={
        "email": "admin@spareparts.demo.fashionerp.com",
        "password": "Admin@123456",
    })
    if code != 200:
        print("Login failed", code, d)
        sys.exit(1)
    u = d["data"]["user"]
    return d["data"]["accessToken"], u["tenantId"], u.get("branchId") or ""


tok, tid, bid = login()
code, res = req("GET", "/products?limit=100", tok, tid, bid)
products = res.get("data", res)
if isinstance(products, dict):
    products = products.get("data", [])
if not isinstance(products, list):
    products = []

updated = 0
for p in products:
    wm = p.get("warrantyMonths")
    if wm and wm > 0:
        continue
    name = (p.get("name") or "").lower()
    # Demo: filters and common warrantied parts get 12 months; accessories stay without
    if "filter" in name or "alternator" in name or "brake" in name or "spark" in name:
        months = 12
    else:
        continue
    code2, out = req("PUT", f"/products/{p['id']}", tok, tid, bid, {"warrantyMonths": months})
    if code2 in (200, 201):
        updated += 1
        print(f"  OK {p.get('name')} -> {months} months")
    else:
        print(f"  FAIL {p.get('name')}: {out.get('message', out)}")

print(f"\nUpdated {updated} product(s)")
