#!/usr/bin/env python3
"""Diagnose warranty flow blockers on spare parts tenant."""
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
print("=== Spare Parts Warranty Diagnostics ===\n")

code, prods = req("GET", "/pos/products", tok, tid, bid)
variants = prods.get("data", prods)
if not isinstance(variants, list):
    variants = []
print(f"POS products: {len(variants)}")
with_w = [v for v in variants if (v.get("warrantyMonths") or 0) > 0]
print(f"  With warrantyMonths > 0: {len(with_w)}")
for v in variants[:8]:
    wm = v.get("warrantyMonths")
    print(f"  - {v.get('productName','?')} / {v.get('sku','?')} warrantyMonths={wm!r}")

code, sales = req("GET", "/sales?limit=3", tok, tid, bid)
rows = sales.get("data", sales)
if isinstance(rows, dict):
    rows = rows.get("data", [])
print(f"\nRecent sales: {len(rows) if isinstance(rows, list) else 0}")
if isinstance(rows, list) and rows:
    sid = rows[0]["id"]
    code2, sale = req("GET", f"/sales/{sid}", tok, tid, bid)
    s = sale.get("data", sale)
    items = s.get("items") or []
    print(f"  Sale {s.get('invoiceNumber')} items={len(items)} customerId={s.get('customerId')!r}")
    for it in items[:5]:
        var = it.get("variant") or {}
        prod = var.get("product") or {}
        wm = prod.get("warrantyMonths")
        print(f"    item {it.get('productName')} variant.product.warrantyMonths={wm!r}")

    if items and (s.get("customerId") or s.get("customer", {}).get("id")):
        it0 = items[0]
        vid = it0.get("variantId")
        cid = s.get("customerId") or s.get("customer", {}).get("id")
        payload = {
            "customerId": cid,
            "variantId": vid,
            "saleId": sid,
            "purchaseDate": (s.get("invoiceDate") or "")[:10],
            "issueDescription": "Diagnostic test claim",
        }
        code3, created = req("POST", "/spare-parts/warranty-claims", tok, tid, bid, payload)
        print(f"\n  POS-style claim (no warrantyMonths in payload): HTTP {code3}")
        print(f"    {created.get('message') or created.get('data', {}).get('claimNumber', 'ok')}")
