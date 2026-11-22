#!/usr/bin/env python3
"""Import MrDeal Excel products into SL Deen supermarket tenant (with image URLs)."""
from __future__ import annotations

import json
import re
import time
import secrets
from pathlib import Path

import openpyxl
import paramiko

HOST, USER, PASS = "95.217.14.198", "root", "FrCnCXMdTgiu"
TID = "cmrbqxbfe000h5bfdh4ntxtva"
XLSX = Path(r"c:\Users\Akila\Downloads\MrDeal_ALL_Products_Removed_OldPrice_ProductURL (1).xlsx")
LOCAL_JSON = Path(r"e:\clothing shop\scripts\_deen_products.json")
LOCAL_JS = Path(r"e:\clothing shop\scripts\_import_deen_products.js")
PLACEHOLDER = "https://mart.mrdeal.lk/assets/images/homepage-one/product-img/p-img-1.webp"


def cuid() -> str:
    # Prisma-like cuid: c + timestamp + entropy
    return "c" + secrets.token_hex(12)


def slugify(text: str) -> str:
    s = (text or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "item"


def build_payload() -> dict:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb.active
    rows = []
    seen_sku: dict[str, int] = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        name = str(r[1] or "").strip()
        if not name:
            continue
        raw_sku = str(r[2] or "").strip()
        if not raw_sku:
            continue
        brand = str(r[3] or "").strip() or "NO BRAND"
        category = str(r[4] or "").strip() or "UNCATEGORIZED"
        try:
            price = float(r[5] or 0)
        except (TypeError, ValueError):
            price = 0.0
        img = str(r[6] or "").strip()
        # keep placeholder too so UI has something; real URLs preferred
        images = [img] if img else []

        count = seen_sku.get(raw_sku, 0)
        seen_sku[raw_sku] = count + 1
        sku = raw_sku if count == 0 else f"{raw_sku}-{count + 1}"

        weighted = brand.upper() == "SCALE ITEMS"
        rows.append(
            {
                "name": name[:200],
                "sku": sku[:64],
                "barcode": raw_sku[:64],
                "brand": brand[:120],
                "category": category[:120],
                "price": price,
                "images": images,
                "weighted": weighted,
            }
        )
    wb.close()
    return {"tenantId": TID, "products": rows}


IMPORT_JS = r"""
const fs = require('fs');
const { PrismaClient, ProductStatus, ProductKind, BarcodeMode } = require('@prisma/client');

const prisma = new PrismaClient();
const data = JSON.parse(fs.readFileSync('/app/deen_products.json', 'utf8'));
const TID = data.tenantId;

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function cuid() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
}

async function main() {
  console.log('products in file:', data.products.length);

  await prisma.tenant.update({
    where: { id: TID },
    data: { maxProducts: 20000 },
  });
  console.log('maxProducts -> 20000');

  // Categories
  const catNames = [...new Set(data.products.map((p) => p.category))];
  const brandNames = [...new Set(data.products.map((p) => p.brand))];
  const catMap = {};
  const brandMap = {};

  for (const name of catNames) {
    let slug = slugify(name);
    let base = slug;
    let n = 1;
    while (true) {
      const existing = await prisma.category.findFirst({ where: { tenantId: TID, slug } });
      if (!existing) break;
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        catMap[name] = existing.id;
        break;
      }
      slug = `${base}-${n++}`;
    }
    if (catMap[name]) continue;
    const created = await prisma.category.create({
      data: { id: cuid(), tenantId: TID, name, slug, isActive: true },
    });
    catMap[name] = created.id;
  }
  console.log('categories:', Object.keys(catMap).length);

  for (const name of brandNames) {
    let slug = slugify(name);
    let base = slug;
    let n = 1;
    while (true) {
      const existing = await prisma.brand.findFirst({ where: { tenantId: TID, slug } });
      if (!existing) break;
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        brandMap[name] = existing.id;
        break;
      }
      slug = `${base}-${n++}`;
    }
    if (brandMap[name]) continue;
    const created = await prisma.brand.create({
      data: { id: cuid(), tenantId: TID, name, slug, isActive: true },
    });
    brandMap[name] = created.id;
  }
  console.log('brands:', Object.keys(brandMap).length);

  // Skip SKUs already present
  const existing = await prisma.product.findMany({
    where: { tenantId: TID },
    select: { sku: true },
  });
  const existingSkus = new Set(existing.map((e) => e.sku));

  const toInsert = data.products.filter((p) => !existingSkus.has(p.sku));
  console.log('to insert:', toInsert.length, 'skip existing:', data.products.length - toInsert.length);

  const slugUsed = new Set();
  const existingSlugs = await prisma.product.findMany({
    where: { tenantId: TID },
    select: { slug: true },
  });
  for (const e of existingSlugs) slugUsed.add(e.slug);

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const productRows = [];
    const variantRows = [];

    for (const p of chunk) {
      const id = cuid();
      let slug = slugify(p.name);
      let base = slug;
      let n = 1;
      while (slugUsed.has(slug)) {
        slug = `${base}-${n++}`;
      }
      slugUsed.add(slug);

      const kind = p.weighted ? ProductKind.WEIGHTED : ProductKind.STANDARD;
      productRows.push({
        id,
        tenantId: TID,
        name: p.name,
        slug,
        sku: p.sku,
        barcode: p.barcode || null,
        categoryId: catMap[p.category] || null,
        brandId: brandMap[p.brand] || null,
        sellingPrice: p.price,
        costPrice: 0,
        mrp: p.price,
        wholesalePrice: 0,
        taxRate: 0,
        status: ProductStatus.ACTIVE,
        images: p.images || [],
        tags: [],
        hasVariants: false,
        trackInventory: true,
        productKind: kind,
        barcodeMode: BarcodeMode.UNIQUE,
        unit: p.weighted ? 'kg' : 'pcs',
        allowNegativeStock: false,
        allowDecimalSelling: !!p.weighted,
        weightScaleReady: !!p.weighted,
        updatedAt: new Date(),
      });

      variantRows.push({
        id: cuid(),
        productId: id,
        sku: p.sku,
        name: 'Default',
        barcode: p.barcode || null,
        sellingPrice: p.price,
        costPrice: 0,
        mrp: p.price,
        isActive: true,
        sortOrder: 0,
        updatedAt: new Date(),
      });
    }

    await prisma.product.createMany({ data: productRows });
    await prisma.productVariant.createMany({ data: variantRows });
    inserted += productRows.length;
    console.log(`inserted ${inserted}/${toInsert.length}`);
  }

  const counts = {
    products: await prisma.product.count({ where: { tenantId: TID } }),
    variants: await prisma.productVariant.count({
      where: { product: { tenantId: TID } },
    }),
    categories: await prisma.category.count({ where: { tenantId: TID } }),
    brands: await prisma.brand.count({ where: { tenantId: TID } }),
    withImages: await prisma.product.count({
      where: { tenantId: TID, NOT: { images: { equals: [] } } },
    }),
  };
  console.log('DONE', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
"""


def main():
    print("Building product JSON from Excel...")
    payload = build_payload()
    LOCAL_JSON.write_text(json.dumps(payload), encoding="utf-8")
    LOCAL_JS.write_text(IMPORT_JS, encoding="utf-8")
    print(f"products: {len(payload['products'])} -> {LOCAL_JSON}")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=60)

    print("Uploading files...")
    sftp = ssh.open_sftp()
    sftp.put(str(LOCAL_JSON), "/tmp/deen_products.json")
    sftp.put(str(LOCAL_JS), "/tmp/import_deen_products.js")
    sftp.close()

    cmds = [
        "docker cp /tmp/deen_products.json fashionerp_api:/app/deen_products.json",
        "docker cp /tmp/import_deen_products.js fashionerp_api:/app/import_deen_products.js",
    ]
    for c in cmds:
        _, o, e = ssh.exec_command(c)
        o.channel.recv_exit_status()
        err = e.read().decode()
        if err:
            print("ERR", c, err)

    print("Running import inside API container (this may take a few minutes)...")
    # long timeout — 6139 products; run from /app so @prisma/client resolves
    _, o, e = ssh.exec_command(
        "docker exec -w /app fashionerp_api node /app/import_deen_products.js",
        timeout=600,
    )
    # stream-ish
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    print(out)
    if err:
        print("STDERR:", err)
    ssh.close()


if __name__ == "__main__":
    main()
