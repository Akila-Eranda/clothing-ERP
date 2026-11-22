#!/usr/bin/env python3
from pathlib import Path

p = Path(r"E:\main ERP hexalyte\apps\web\src\app\(dashboard)\settings\page.tsx")
c = p.read_text(encoding="utf-8")
c = c.replace('variant="gradient"', "")
c = c.replace('className="mt-6"', 'className="mt-0"')
c = c.replace('className="mt-6 space-y-6"', 'className="mt-0 space-y-4"')
c = c.replace('className="mt-6 space-y-4"', 'className="mt-0 space-y-4"')
# tidy leftover double spaces after attribute removal
while "  size=" in c:
    c = c.replace("  size=", " size=")
while "<Button  " in c:
    c = c.replace("<Button  ", "<Button ")
p.write_text(c, encoding="utf-8", newline="")
print("patched")
