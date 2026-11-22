
const fs = require('fs');
const { PrismaClient, ProductStatus, ProductKind, BarcodeMode } = require('@prisma/client');

const prisma = new PrismaClient();
const data = JSON.parse(fs.readFileSync('/app/grocery_products.json', 'utf8'));
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
  console.log('tenant:', TID);

  await prisma.tenant.update({
    where: { id: TID },
    data: { maxProducts: 999999 },
  });

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
  console.log('categories ready:', Object.keys(catMap).length);

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
  console.log('brands ready:', Object.keys(brandMap).length);

  const existing = await prisma.product.findMany({
    where: { tenantId: TID },
    select: { sku: true },
  });
  const existingSkus = new Set(existing.map((e) => e.sku));
  const toInsert = data.products.filter((p) => !existingSkus.has(p.sku));
  console.log('to insert:', toInsert.length, 'skip existing sku:', data.products.length - toInsert.length);

  const slugUsed = new Set(
    (await prisma.product.findMany({ where: { tenantId: TID }, select: { slug: true } })).map((e) => e.slug)
  );

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
      while (slugUsed.has(slug)) slug = `${base}-${n++}`;
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
    variants: await prisma.productVariant.count({ where: { product: { tenantId: TID } } }),
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
