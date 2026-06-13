#!/usr/bin/env python3
"""Test PO workflow on production (demo tenant)."""
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
        return e.code, json.loads(e.read())


def login(email, password, tenant):
    code, d = req("POST", "/auth/login", "", tenant, body={"email": email, "password": password})
    if code != 200:
        return None
    u = d["data"]["user"]
    return d["data"]["accessToken"], u["tenantId"], u.get("branchId") or "", u.get("roles", [])


def summarize_pos(token, tid, bid, label):
    code, pos = req("GET", "/purchases?limit=20", token, tid, bid)
    po_list = pos.get("data", pos)
    if isinstance(po_list, dict):
        po_list = po_list.get("data", [])
    by_status = {}
    for p in po_list or []:
        by_status[p.get("status", "?")] = by_status.get(p.get("status", "?"), 0) + 1
    print(f"{label}: {by_status or 'none'}")
    return po_list or []


print("=== PO Workflow Test (production) ===\n")

# 1) Approver users (need seed deploy)
for email in ["manager@demo.fashionerp.com", "accountant@demo.fashionerp.com"]:
    u = login(email, "Manager@123456", "demo")
    print(f"{email}: {'OK roles=' + str(u[3]) if u else 'NOT FOUND (seed not deployed)'}")

# 2) Admin — list POs + workflow catalog
admin = login("admin@demo.fashionerp.com", "Admin@123456", "demo")
if admin:
    tok, tid, bid, roles = admin
    print(f"\nAdmin roles={roles}")
    pos = summarize_pos(tok, tid, bid, "PO counts")
    pending = [p for p in pos if p.get("status") == "PENDING_APPROVAL"]
    print(f"PENDING_APPROVAL POs: {len(pending)}")
    code, cat = req("GET", "/workflows/catalog", tok, tid, bid)
    po_wf = [c for c in cat.get("data", []) if c.get("key") == "purchase_order"]
    if po_wf:
        steps = po_wf[0].get("steps", [])
        print("PO workflow steps:", " → ".join(f"{s.get('name')} ({s.get('approverRole')})" for s in steps))

# 3) Admin submit bypass test on first DRAFT
if admin:
    tok, tid, bid, roles = admin
    drafts = [p for p in summarize_pos(tok, tid, bid, "Recheck drafts") if p.get("status") == "DRAFT"]
    if drafts:
        po = drafts[0]
        code, res = req("POST", f"/purchases/{po['id']}/submit-approval", tok, tid, bid)
        print(f"Admin submit-approval on {po.get('poNumber')}: HTTP {code} → status={res.get('data', {}).get('status')}")
    else:
        print("No DRAFT PO on server to test submit")
