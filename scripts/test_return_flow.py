#!/usr/bin/env python3
"""Test order return flow on production."""
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


def test_tenant(name, slug, email):
    print(f"\n=== {name} ({slug}) ===")
    sess = login(email, "Admin@123456", slug)
    if not sess:
        print("  Login FAILED")
        return
    tok, tid, bid = sess

    code, res = req("GET", "/returns?limit=5", tok, tid, bid)
    print(f"  GET /returns: HTTP {code} -> {res.get('message', 'ok')}")
    if code == 403:
        return

    code, sales = req("GET", "/sales?limit=5", tok, tid, bid)
    rows = sales.get("data", sales)
    if isinstance(rows, dict):
        rows = rows.get("data", [])
    if not rows:
        print("  No sales to test return")
        return

    sale = rows[0]
    sid = sale["id"]
    code2, detail = req("GET", f"/sales/{sid}", tok, tid, bid)
    s = detail.get("data", detail)
    items = s.get("items") or []
    if not items:
        print("  Sale has no items")
        return
    it = items[0]

    for reason in ["DEFECTIVE", "WRONG_ITEM", "SIZE_ISSUE", "WARRANTY", "WRONG_PART"]:
        payload = {
            "originalSaleId": sid,
            "reason": reason,
            "returnType": "RETURN",
            "restockItems": True,
            "items": [{"variantId": it["variantId"], "quantity": 1, "unitPrice": it["unitPrice"]}],
        }
        code3, created = req("POST", "/returns", tok, tid, bid, payload)
        msg = created.get("message", created)
        if isinstance(msg, list):
            msg = "; ".join(msg)
        print(f"  POST return reason={reason}: HTTP {code3} -> {msg if code3 not in (200, 201) else created.get('data', {}).get('returnNumber', 'ok')}")
        if code3 in (200, 201):
            ret = created.get("data", created)
            rid = ret.get("id")
            if rid:
                code4, appr = req("PUT", f"/returns/{rid}/status", tok, tid, bid, {"status": "APPROVED"})
                print(f"    Approve: HTTP {code4} -> {appr.get('message', appr.get('data', {}).get('status', 'ok'))}")
            break


print("=== Order Return Flow Test ===")
test_tenant("Clothing", "demo", "admin@demo.fashionerp.com")
test_tenant("Spare Parts", "spareparts", "admin@spareparts.demo.fashionerp.com")
