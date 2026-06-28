#!/usr/bin/env python3
"""Smoke-test all business vertical demo tenants on production."""
import json
import urllib.request
import urllib.error
import ssl

API = "https://shop.clothing.api.hexalyte.com/api/v1"

TENANTS = [
    ("demo", "admin@demo.fashionerp.com", "CLOTHING", "shop.hexalyte.com"),
    ("grocery", "admin@grocery.demo.fashionerp.com", "GROCERY", "grocery.shop.hexalyte.com"),
    ("hardware", "admin@hardware.demo.fashionerp.com", "HARDWARE", "hardware.shop.hexalyte.com"),
    ("agri", "admin@agri.demo.fashionerp.com", "AGRICULTURE", "agri.shop.hexalyte.com"),
    ("spareparts", "admin@spareparts.demo.fashionerp.com", "SPARE_PARTS", "spareparts.shop.hexalyte.com"),
    ("tyres", "admin@tyres.demo.fashionerp.com", "TIRE_SHOP", "tyres.shop.hexalyte.com"),
]

PASSWORD = "Admin@123456"

CTX = ssl.create_default_context()


def req(method, path, tenant=None, token=None, body=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if tenant:
        headers["x-tenant-id"] = tenant
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=30) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode())
        except Exception:
            payload = {"raw": e.read().decode()[:200]}
        return e.code, payload


def check(name, ok, detail=""):
    mark = "OK" if ok else "FAIL"
    line = f"  [{mark}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


def main():
    print("=== All Business Verticals Audit ===\n")
    all_ok = True

    for subdomain, email, expected_type, host in TENANTS:
        print(f"--- {expected_type} ({subdomain} / {host}) ---")
        ok_tenant = True

        st, login = req("POST", "/auth/login", subdomain, body={"email": email, "password": PASSWORD})
        token = (login.get("data") or {}).get("accessToken") if st == 200 or st == 201 else None
        ok_tenant &= check("Login", token is not None, f"HTTP {st}")

        if not token:
            print()
            all_ok = False
            continue

        user = (login.get("data") or {}).get("user") or {}
        me_st, me = req("GET", "/tenants/me", subdomain, token)
        shop_type = (me.get("data") or {}).get("shopType") if me_st == 200 else None
        ok_tenant &= check("Shop type", shop_type == expected_type, f"got {shop_type}")

        endpoints = [
            ("GET", "/products?limit=5"),
            ("GET", "/dashboard/overview"),
            ("GET", "/pos/products?limit=5"),
            ("GET", "/purchases?limit=5"),
            ("GET", "/customers?limit=5"),
            ("GET", "/inventory?limit=5"),
            ("GET", "/sales?limit=5"),
            ("GET", "/returns?limit=5"),
        ]

        for method, path in endpoints:
            st, data = req(method, path, subdomain, token)
            success = data.get("success", False) if isinstance(data, dict) else False
            ok = st in (200, 201) and success
            ok_tenant &= check(path, ok, f"HTTP {st}")
            if not ok and isinstance(data, dict):
                msg = data.get("message") or data.get("error") or str(data)[:80]
                print(f"       {msg}")

        # Module-guarded endpoints per vertical
        module_checks = {
            "CLOTHING": [
                ("/promotions?limit=1", True),
                ("/collections?limit=1", True),
                ("/spare-parts/vehicle-brands", False),
            ],
            "GROCERY": [
                ("/promotions?limit=1", True),
                ("/spare-parts/vehicle-brands", False),
            ],
            "HARDWARE": [
                ("/spare-parts/quotations?limit=1", True),
                ("/promotions?limit=1", False),
            ],
            "AGRICULTURE": [
                ("/promotions?limit=1", False),
                ("/spare-parts/vehicle-brands", False),
            ],
            "SPARE_PARTS": [
                ("/spare-parts/quotations?limit=1", True),
                ("/spare-parts/vehicle-brands", True),
                ("/spare-parts/warranty-claims?limit=1", True),
            ],
            "TIRE_SHOP": [
                ("/spare-parts/quotations?limit=1", True),
                ("/spare-parts/vehicle-brands", True),
                ("/spare-parts/warranty-claims?limit=1", True),
            ],
        }
        for path, should_work in module_checks.get(expected_type, []):
            st, data = req("GET", path, subdomain, token)
            success = isinstance(data, dict) and data.get("success", False)
            if should_work:
                ok_tenant &= check(f"{path} (enabled)", st in (200, 201) and success, f"HTTP {st}")
            else:
                ok_tenant &= check(f"{path} (gated)", st in (403, 404) or not success, f"HTTP {st}")

        web_st, _ = req("GET", f"https://{host}/login", None)
        ok_tenant &= check("Web login page", web_st == 200, f"HTTP {web_st}")

        print(f"  => {'PASS' if ok_tenant else 'ISSUES FOUND'}\n")
        all_ok &= ok_tenant

    print("=== Summary ===")
    print("ALL PASS" if all_ok else "SOME CHECKS FAILED — review above")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
