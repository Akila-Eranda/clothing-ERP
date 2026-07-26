/**
 * Cake House / Bakery demo tenant seed — run inside fashionerp_api container:
 *   node /app/seed_cakehouse.js
 *
 * Creates subdomain `cake` with admin + cashier, categories, brands,
 * products (with images), stock, customers, suppliers, and a sample sale.
 */
const { PrismaClient, ShopType, SubscriptionPlan, TenantStatus, UserStatus, RoleType, ProductStatus, SaleStatus, PaymentMethod, PaymentStatus, CustomerTier } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SUBDOMAIN = 'cake';
const ADMIN_EMAIL = 'admin@cake.demo.fashionerp.com';
const CASHIER_EMAIL = 'cashier@cake.demo.fashionerp.com';
const PASSWORD = 'Admin@123456';
const CASHIER_PASSWORD = 'Cashier@123456';

const PROFILE = {
  type: 'BAKERY',
  defaultUnit: 'pcs',
  units: ['pcs', 'kg', 'g', 'box', 'pack', 'L', 'ml'],
  modules: {
    brands: true,
    collections: false,
    hangTags: false,
    variants: true,
    returns: true,
    promotions: true,
    loyalty: true,
    expiry: true,
    batch: true,
    vehicles: false,
    warranty: false,
    quotations: true,
    workshop: false,
    appointments: false,
  },
  labelTemplates: ['sticker', 'shelf'],
  variantAttributes: [
    { name: 'Size', presets: ['500g', '1kg', '1.5kg', '2kg', 'Box of 6', 'Box of 12'], mapsTo: 'size' },
    { name: 'Flavour', presets: ['Chocolate', 'Vanilla', 'Strawberry', 'Red Velvet', 'Butter', 'Black Forest'], mapsTo: 'style' },
  ],
};

const CATEGORIES = ['Cakes', 'Cupcakes', 'Pastries', 'Bread', 'Beverages', 'Ingredients', 'Custom Orders'];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Public cake/bakery images (Unsplash) — absolute URLs work in POS & product modals */
const PRODUCTS = [
  {
    sku: 'CK-CHOC-FUDGE',
    name: 'Chocolate Fudge Cake',
    shortDesc: 'Rich chocolate fudge layer cake',
    category: 'Cakes',
    brand: 'sweetnest',
    tags: ['Best Seller', 'Chocolate'],
    images: ['https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80'],
    variants: [
      { size: '500g', style: 'Chocolate', price: 2500, cost: 1400, stock: 18 },
      { size: '1kg', style: 'Chocolate', price: 4500, cost: 2600, stock: 24 },
      { size: '2kg', style: 'Chocolate', price: 8500, cost: 4800, stock: 10 },
    ],
  },
  {
    sku: 'CK-BDAY-BUTTER',
    name: 'Buttercream Birthday Cake',
    shortDesc: 'Classic buttercream birthday cake — custom message available',
    category: 'Cakes',
    brand: 'sweetnest',
    tags: ['Birthday', 'Custom'],
    images: ['https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80'],
    variants: [
      { size: '500g', style: 'Vanilla', price: 2800, cost: 1500, stock: 12 },
      { size: '1kg', style: 'Vanilla', price: 5200, cost: 2900, stock: 16 },
      { size: '1.5kg', style: 'Vanilla', price: 7200, cost: 4000, stock: 8 },
    ],
  },
  {
    sku: 'CK-RED-VELVET',
    name: 'Red Velvet Cake',
    shortDesc: 'Velvet sponge with cream cheese frosting',
    category: 'Cakes',
    brand: 'sweetnest',
    tags: ['Premium', 'Red Velvet'],
    images: ['https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=800&q=80'],
    variants: [
      { size: '500g', style: 'Red Velvet', price: 3200, cost: 1800, stock: 10 },
      { size: '1kg', style: 'Red Velvet', price: 5800, cost: 3200, stock: 14 },
    ],
  },
  {
    sku: 'CK-BLACK-FOREST',
    name: 'Black Forest Cake',
    shortDesc: 'Cherry & cream classic',
    category: 'Cakes',
    brand: 'bakehouse',
    tags: ['Classic'],
    images: ['https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80'],
    variants: [
      { size: '1kg', style: 'Black Forest', price: 4800, cost: 2700, stock: 15 },
      { size: '2kg', style: 'Black Forest', price: 9000, cost: 5100, stock: 6 },
    ],
  },
  {
    sku: 'CK-STRAW-CREAM',
    name: 'Fresh Strawberry Cream Cake',
    shortDesc: 'Seasonal strawberries with whipped cream',
    category: 'Cakes',
    brand: 'sweetnest',
    tags: ['Seasonal', 'Strawberry'],
    images: ['https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80'],
    variants: [
      { size: '500g', style: 'Strawberry', price: 3000, cost: 1700, stock: 9 },
      { size: '1kg', style: 'Strawberry', price: 5500, cost: 3100, stock: 11 },
    ],
  },
  {
    sku: 'CC-CHOC-BOX6',
    name: 'Chocolate Cupcakes',
    shortDesc: 'Moist chocolate cupcakes with frosting',
    category: 'Cupcakes',
    brand: 'sweetnest',
    tags: ['Cupcakes'],
    images: ['https://images.unsplash.com/photo-1614707267537-b85aaf00c0b7?w=800&q=80'],
    variants: [
      { size: 'Box of 6', style: 'Chocolate', price: 1800, cost: 900, stock: 30 },
      { size: 'Box of 12', style: 'Chocolate', price: 3200, cost: 1600, stock: 18 },
    ],
  },
  {
    sku: 'CC-MIX-BOX12',
    name: 'Assorted Cupcake Box',
    shortDesc: 'Mixed flavours — chocolate, vanilla, strawberry',
    category: 'Cupcakes',
    brand: 'bakehouse',
    tags: ['Assorted', 'Gift'],
    images: ['https://images.unsplash.com/photo-1486427944299-d1955d23b336?w=800&q=80'],
    variants: [
      { size: 'Box of 12', style: 'Assorted', price: 3600, cost: 1800, stock: 20 },
    ],
  },
  {
    sku: 'PS-CROISSANT',
    name: 'Butter Croissant',
    shortDesc: 'Flaky French-style croissant',
    category: 'Pastries',
    brand: 'bakehouse',
    tags: ['Fresh Daily'],
    images: ['https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80'],
    variants: [
      { size: 'pcs', style: 'Butter', price: 280, cost: 120, stock: 80 },
    ],
  },
  {
    sku: 'PS-DANISH',
    name: 'Fruit Danish Pastry',
    shortDesc: 'Danish pastry with fruit topping',
    category: 'Pastries',
    brand: 'bakehouse',
    tags: ['Pastry'],
    images: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80'],
    variants: [
      { size: 'pcs', style: 'Fruit', price: 320, cost: 140, stock: 45 },
    ],
  },
  {
    sku: 'PS-MACARON',
    name: 'French Macarons Box',
    shortDesc: 'Assorted macaron gift box',
    category: 'Pastries',
    brand: 'sweetnest',
    tags: ['Premium', 'Gift'],
    images: ['https://images.unsplash.com/photo-1569864358642-9d448a475480?w=800&q=80'],
    variants: [
      { size: 'Box of 6', style: 'Assorted', price: 2400, cost: 1200, stock: 22 },
      { size: 'Box of 12', style: 'Assorted', price: 4200, cost: 2100, stock: 12 },
    ],
  },
  {
    sku: 'BR-WHITE-LOAF',
    name: 'Soft White Bread Loaf',
    shortDesc: 'Freshly baked white sandwich loaf',
    category: 'Bread',
    brand: 'bakehouse',
    tags: ['Daily'],
    images: ['https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=800&q=80'],
    variants: [
      { size: '400g', style: 'White', price: 220, cost: 90, stock: 60 },
      { size: '800g', style: 'White', price: 380, cost: 160, stock: 40 },
    ],
  },
  {
    sku: 'BR-MULTI-LOAF',
    name: 'Multigrain Loaf',
    shortDesc: 'Healthy multigrain bread',
    category: 'Bread',
    brand: 'bakehouse',
    tags: ['Healthy'],
    images: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80'],
    variants: [
      { size: '500g', style: 'Multigrain', price: 450, cost: 200, stock: 35 },
    ],
  },
  {
    sku: 'BV-ICED-COFFEE',
    name: 'Iced Coffee',
    shortDesc: 'House iced coffee — takeaway',
    category: 'Beverages',
    brand: 'sweetnest',
    tags: ['Drinks'],
    images: ['https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&q=80'],
    variants: [
      { size: '350ml', style: 'Regular', price: 450, cost: 120, stock: 50 },
      { size: '500ml', style: 'Large', price: 550, cost: 150, stock: 40 },
    ],
  },
  {
    sku: 'BV-FRUIT-JUICE',
    name: 'Fresh Mixed Fruit Juice',
    shortDesc: 'Freshly squeezed seasonal fruit juice',
    category: 'Beverages',
    brand: 'sweetnest',
    tags: ['Fresh'],
    images: ['https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=80'],
    variants: [
      { size: '300ml', style: 'Mixed', price: 380, cost: 100, stock: 40 },
    ],
  },
  {
    sku: 'IN-CAKE-FLOUR',
    name: 'Cake Flour',
    shortDesc: 'Fine cake flour for baking',
    category: 'Ingredients',
    brand: 'bakehouse',
    tags: ['Ingredient'],
    images: ['https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&q=80'],
    variants: [
      { size: '1kg', style: 'Standard', price: 480, cost: 280, stock: 100 },
      { size: '5kg', style: 'Standard', price: 2100, cost: 1200, stock: 40 },
    ],
  },
  {
    sku: 'IN-FRESH-CREAM',
    name: 'Fresh Whipping Cream',
    shortDesc: 'Chilled whipping cream — keep refrigerated',
    category: 'Ingredients',
    brand: 'bakehouse',
    tags: ['Ingredient', 'Chilled'],
    images: ['https://images.unsplash.com/photo-1550583724-b2692b85b150?w=800&q=80'],
    variants: [
      { size: '500ml', style: 'Fresh', price: 650, cost: 380, stock: 55 },
      { size: '1L', style: 'Fresh', price: 1200, cost: 700, stock: 30 },
    ],
  },
  {
    sku: 'CO-CUSTOM-CAKE',
    name: 'Custom Celebration Cake',
    shortDesc: 'Made-to-order custom cake — quote on request',
    category: 'Custom Orders',
    brand: 'sweetnest',
    tags: ['Custom', 'Quote'],
    images: ['https://images.unsplash.com/photo-1535141192574-5a645c9d9d2f?w=800&q=80'],
    variants: [
      { size: '1kg', style: 'Custom', price: 6500, cost: 3500, stock: 5 },
      { size: '2kg', style: 'Custom', price: 12000, cost: 6500, stock: 3 },
    ],
  },
];

async function ensureBrand(tenantId, name, slug) {
  return prisma.brand.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: { isActive: true },
    create: { tenantId, name, slug, isActive: true },
  });
}

async function main() {
  console.log('🎂 Seeding Cake House demo tenant...');
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const cashierHash = await bcrypt.hash(CASHIER_PASSWORD, 12);

  const tenant = await prisma.tenant.upsert({
    where: { subdomain: SUBDOMAIN },
    update: {
      shopType: ShopType.BAKERY,
      name: 'SweetNest Cake House',
      status: TenantStatus.ACTIVE,
      maxProducts: 5000,
    },
    create: {
      name: 'SweetNest Cake House',
      subdomain: SUBDOMAIN,
      email: ADMIN_EMAIL,
      shopType: ShopType.BAKERY,
      plan: SubscriptionPlan.PROFESSIONAL,
      status: TenantStatus.ACTIVE,
      currency: 'LKR',
      country: 'LK',
      timezone: 'Asia/Colombo',
      maxBranches: 5,
      maxUsers: 50,
      maxProducts: 5000,
    },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: {
        shopProfile: PROFILE,
        businessName: 'SweetNest Cake House',
        tagline: 'Fresh cakes & bakery — Colombo',
      },
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HO-001' } },
    update: { name: 'Bambalapitiya Outlet', city: 'Colombo' },
    create: {
      tenantId: tenant.id,
      name: 'Bambalapitiya Outlet',
      code: 'HO-001',
      isDefault: true,
      city: 'Colombo',
      address: '42 Galle Road, Bambalapitiya',
      phone: '0112345678',
    },
  });

  await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'BR-002' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Nugegoda Outlet',
      code: 'BR-002',
      isDefault: false,
      city: 'Nugegoda',
      address: '15 High Level Road',
      phone: '0112789012',
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Tenant Admin' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Tenant Admin', type: RoleType.TENANT_ADMIN, isSystem: true },
  });
  const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Cashier' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Cashier', type: RoleType.CASHIER, isSystem: true },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL } },
    update: { status: UserStatus.ACTIVE, emailVerified: true, passwordHash },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: ADMIN_EMAIL,
      firstName: 'SweetNest',
      lastName: 'Admin',
      phone: '0771234567',
      passwordHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: CASHIER_EMAIL } },
    update: { status: UserStatus.ACTIVE, emailVerified: true, passwordHash: cashierHash },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: CASHIER_EMAIL,
      firstName: 'Nimali',
      lastName: 'Cashier',
      phone: '0777654321',
      passwordHash: cashierHash,
      emailVerified: true,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: cashierRole.id }] },
    },
  });

  // POS counters
  for (const [i, [code, name]] of [
    ['C1', 'Counter 1'],
    ['C2', 'Counter 2'],
    ['C3', 'Counter 3'],
  ].entries()) {
    const existing = await prisma.posCounter.findFirst({ where: { tenantId: tenant.id, branchId: branch.id, code } });
    if (!existing) {
      await prisma.posCounter.create({
        data: { tenantId: tenant.id, branchId: branch.id, name, code, sortOrder: i + 1, isActive: true },
      });
    }
  }

  // Default warehouse (inventory rows require warehouseId)
  let warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: tenant.id, branchId: branch.id, isDefault: true },
  });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: `${branch.name} Main`,
        code: 'HO-001-MAIN',
        isDefault: true,
        isActive: true,
      },
    });
  }

  // Cashier permissions from global Permission table
  const posPerms = await prisma.permission.findMany({
    where: {
      resource: { in: ['sales', 'customers', 'inventory', 'products', 'cash'] },
      NOT: { action: 'delete' },
    },
  });
  if (posPerms.length) {
    await prisma.rolePermission.deleteMany({ where: { roleId: cashierRole.id } });
    await prisma.rolePermission.createMany({
      data: posPerms.map((p) => ({ roleId: cashierRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  const catMap = {};
  for (const name of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: slugify(name) } },
      update: {},
      create: { tenantId: tenant.id, name, slug: slugify(name) },
    });
    catMap[name] = cat;
  }

  const sweetnest = await ensureBrand(tenant.id, 'SweetNest', 'sweetnest');
  const bakehouse = await ensureBrand(tenant.id, 'BakeHouse', 'bakehouse');
  const brandMap = { sweetnest, bakehouse };

  let productCount = 0;
  let variantCount = 0;
  const firstVariantIds = [];

  for (const p of PRODUCTS) {
    const brand = brandMap[p.brand];
    const category = catMap[p.category];
    if (!category) continue;

    let product = await prisma.product.findFirst({
      where: { tenantId: tenant.id, sku: p.sku },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          tenantId: tenant.id,
          name: p.name,
          slug: slugify(p.name),
          sku: p.sku,
          shortDesc: p.shortDesc,
          description: p.shortDesc,
          categoryId: category.id,
          brandId: brand?.id,
          status: ProductStatus.ACTIVE,
          images: p.images,
          tags: p.tags,
          hasVariants: true,
          trackInventory: true,
          sellingPrice: p.variants[0].price,
          costPrice: p.variants[0].cost,
          mrp: Math.round(p.variants[0].price * 1.1),
          taxRate: 0,
          unit: 'pcs',
          isFeatured: p.tags.includes('Best Seller') || p.tags.includes('Premium'),
        },
      });
      productCount += 1;
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          images: p.images,
          status: ProductStatus.ACTIVE,
          shortDesc: p.shortDesc,
          tags: p.tags,
        },
      });
    }

    for (const [vi, v] of p.variants.entries()) {
      const vSku = `${p.sku}-${slugify(v.size).toUpperCase().slice(0, 8)}`;
      let variant = await prisma.productVariant.findFirst({
        where: { productId: product.id, sku: vSku },
      });
      if (!variant) {
        variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: vSku,
            name: `${v.size} · ${v.style}`,
            size: v.size,
            style: v.style,
            sellingPrice: v.price,
            costPrice: v.cost,
            mrp: Math.round(v.price * 1.1),
            images: p.images,
            barcode: `890${String(productCount).padStart(4, '0')}${String(vi + 1).padStart(3, '0')}`,
            sortOrder: vi,
          },
        });
        variantCount += 1;
      } else {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { images: p.images, sellingPrice: v.price, costPrice: v.cost },
        });
      }

      await prisma.inventory.upsert({
        where: {
          warehouseId_variantId: {
            warehouseId: warehouse.id,
            variantId: variant.id,
          },
        },
        update: { quantity: v.stock, reorderPoint: 5 },
        create: {
          tenantId: tenant.id,
          branchId: branch.id,
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantity: v.stock,
          reservedQty: 0,
          reorderPoint: 5,
        },
      });

      if (firstVariantIds.length < 3) firstVariantIds.push({ variant, product: p, v });
    }
  }

  // Customers
  const customers = [
    { firstName: 'Kasun', lastName: 'Perera', phone: '0771111001', city: 'Colombo', tier: CustomerTier.GOLD, points: 420, spent: 28500 },
    { firstName: 'Dilani', lastName: 'Fernando', phone: '0771111002', city: 'Nugegoda', tier: CustomerTier.SILVER, points: 180, spent: 9200 },
    { firstName: 'Ruwan', lastName: 'Silva', phone: '0771111003', city: 'Dehiwala', tier: CustomerTier.BRONZE, points: 50, spent: 3100 },
    { firstName: 'Amaya', lastName: 'Jayawardena', phone: '0771111004', city: 'Colombo', tier: CustomerTier.PLATINUM, points: 980, spent: 67200 },
    { firstName: 'Hotel', lastName: 'Cinnamon', phone: '0112223333', city: 'Colombo', tier: CustomerTier.GOLD, points: 0, spent: 125000, tags: ['Corporate', 'Bulk'] },
  ];
  const customerRows = [];
  for (const c of customers) {
    const row = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: {
        firstName: c.firstName,
        lastName: c.lastName,
        tier: c.tier,
        loyaltyPoints: c.points,
        totalSpent: c.spent,
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        city: c.city,
        tier: c.tier,
        loyaltyPoints: c.points,
        totalSpent: c.spent,
        totalOrders: Math.max(1, Math.floor(c.spent / 5000)),
        tags: c.tags || [],
        email: `${c.firstName.toLowerCase()}@example.lk`,
        address: `${c.city}, Sri Lanka`,
      },
    });
    customerRows.push(row);
  }

  // Suppliers
  async function ensureSupplier(data) {
    const existing = await prisma.supplier.findFirst({
      where: { tenantId: tenant.id, name: data.name },
    });
    if (existing) {
      return prisma.supplier.update({
        where: { id: existing.id },
        data: { isActive: true, balance: data.balance, notes: data.notes },
      });
    }
    return prisma.supplier.create({ data: { tenantId: tenant.id, ...data } });
  }

  await ensureSupplier({
    code: 'SUP-DAIRY',
    name: 'Lanka Dairy Supplies',
    contactPerson: 'Sunil',
    phone: '0112555666',
    email: 'orders@lankadairy.lk',
    city: 'Colombo',
    address: 'Peliyagoda Market',
    creditDays: 14,
    creditLimit: 200000,
    balance: 45000,
    notes: 'Cream, butter, milk — weekly delivery',
  });

  await ensureSupplier({
    code: 'SUP-FLOUR',
    name: 'Golden Mills Flour Co.',
    contactPerson: 'Priya',
    phone: '0112777888',
    email: 'sales@goldenmills.lk',
    city: 'Kelaniya',
    creditDays: 30,
    creditLimit: 500000,
    balance: 128000,
    notes: 'Cake flour & baking ingredients',
  });

  await ensureSupplier({
    code: 'SUP-DECOR',
    name: 'Cake Decor Lanka',
    contactPerson: 'Meena',
    phone: '0778889900',
    email: 'hello@cakedecor.lk',
    city: 'Colombo',
    creditDays: 7,
    creditLimit: 100000,
    balance: 18500,
    notes: 'Toppers, boxes, candles',
  });

  // Sample completed sale so Sales / Reports modals have data
  if (firstVariantIds.length > 0 && customerRows[0]) {
    const inv = 'CAKE-DEMO-001';
    const existingSale = await prisma.sale.findUnique({
      where: { tenantId_invoiceNumber: { tenantId: tenant.id, invoiceNumber: inv } },
    });
    if (!existingSale) {
      const line = firstVariantIds[0];
      const qty = 1;
      const unitPrice = line.v.price;
      const total = unitPrice * qty;
      await prisma.sale.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          customerId: customerRows[0].id,
          cashierId: admin.id,
          invoiceNumber: inv,
          status: SaleStatus.COMPLETED,
          subtotal: total,
          taxAmount: 0,
          total,
          amountPaid: total,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.COMPLETED,
          notes: 'Demo birthday cake order',
          items: {
            create: [{
              variantId: line.variant.id,
              productName: line.product.name,
              variantName: `${line.v.size} · ${line.v.style}`,
              sku: line.variant.sku,
              quantity: qty,
              unitPrice,
              costPrice: line.v.cost,
              taxRate: 0,
              taxAmount: 0,
              total,
            }],
          },
          payments: {
            create: [{ method: PaymentMethod.CASH, amount: total }],
          },
        },
      });
    }
  }

  if (firstVariantIds.length > 1 && customerRows[1]) {
    const inv = 'CAKE-DEMO-002';
    const existingSale = await prisma.sale.findUnique({
      where: { tenantId_invoiceNumber: { tenantId: tenant.id, invoiceNumber: inv } },
    });
    if (!existingSale) {
      const line = firstVariantIds[1];
      const qty = 2;
      const unitPrice = line.v.price;
      const total = unitPrice * qty;
      await prisma.sale.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          customerId: customerRows[1].id,
          cashierId: admin.id,
          invoiceNumber: inv,
          status: SaleStatus.COMPLETED,
          subtotal: total,
          taxAmount: 0,
          total,
          amountPaid: total,
          paymentMethod: PaymentMethod.CARD,
          paymentStatus: PaymentStatus.COMPLETED,
          notes: 'Demo cupcake box order',
          items: {
            create: [{
              variantId: line.variant.id,
              productName: line.product.name,
              variantName: `${line.v.size} · ${line.v.style}`,
              sku: line.variant.sku,
              quantity: qty,
              unitPrice,
              costPrice: line.v.cost,
              taxRate: 0,
              taxAmount: 0,
              total,
            }],
          },
          payments: {
            create: [{ method: PaymentMethod.CARD, amount: total }],
          },
        },
      });
    }
  }

  console.log('✅ Cake House demo ready');
  console.log(`   URL:      https://${SUBDOMAIN}.shop.hexalyte.com`);
  console.log(`   Admin:    ${ADMIN_EMAIL} / ${PASSWORD}`);
  console.log(`   Cashier:  ${CASHIER_EMAIL} / ${CASHIER_PASSWORD}`);
  console.log(`   Products: ${productCount} new (+ updates), variants touched: ${variantCount}+`);
  console.log(`   Customers: ${customers.length}, Categories: ${CATEGORIES.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Cake house seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
