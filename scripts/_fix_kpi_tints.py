#!/usr/bin/env python3
import os
import re

root = r"E:\main ERP hexalyte\apps\web\src"

patterns = [
    (
        re.compile(
            r"border-(?:blue|violet|indigo|amber|orange|red|rose|teal|slate|emerald|primary)"
            r"(?:-\d+)?(?:/\d+)?\s+bg-gradient-to-br\s+from-[^\s\"]+\s+(?:to-[^\s\"]+\s+)?"
            r"(?:shadow-\[[^\]]+\]\s+)?"
            r"dark:border-[^\s\"]+\s+dark:from-[^\s\"]+\s+dark:to-transparent"
            r"(?:\s+col-span-\d+(?:\s+xl:col-span-\d+)?)?"
        ),
        "bg-card border-border",
    ),
    (
        re.compile(
            r"border-primary/20\s+bg-gradient-to-br\s+from-primary/5\s+to-(?:card|white)\s+"
            r"dark:border-primary/20\s+dark:from-primary/10\s+dark:to-transparent"
        ),
        "bg-card border-border",
    ),
]

count = 0
for dp, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith((".tsx", ".ts")):
            continue
        path = os.path.join(dp, f)
        with open(path, "r", encoding="utf-8") as fh:
            content = fh.read()
        original = content
        for rx, repl in patterns:
            content = rx.sub(repl, content)
        if content != original:
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(content)
            count += 1
            print(path)

print(f"updated {count}")
