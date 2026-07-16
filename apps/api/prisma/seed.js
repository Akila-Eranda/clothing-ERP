var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// prisma/seed.ts
var import_client = require("@prisma/client");
var bcrypt = __toESM(require("bcryptjs"));

// src/shared/shop-profiles.ts
var SHOP_PROFILES = {
  ["CLOTHING" /* CLOTHING */]: {
    type: "CLOTHING" /* CLOTHING */,
    label: "Clothing Shop",
    labelSi: "\u0D87\u0DB3\u0DD4\u0DB8\u0DCA \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F455}",
    description: "Apparel, fashion, boutiques \u2014 sizes, colors, hang tags",
    defaultCategories: ["Men's Wear", "Women's Wear", "Kids' Wear", "Accessories", "Footwear"],
    variantAttributes: [
      { name: "Size", presets: ["XS", "S", "M", "L", "XL", "XXL"], mapsTo: "size" },
      { name: "Color", presets: ["Black", "White", "Navy", "Red", "Blue", "Green"], mapsTo: "color" }
    ],
    defaultUnit: "pcs",
    units: ["pcs"],
    modules: { brands: true, collections: true, hangTags: true, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: false, vehicles: false, warranty: false, quotations: false, workshop: false, appointments: false },
    labelTemplates: ["sticker", "hangtag"]
  },
  ["GROCERY" /* GROCERY */]: {
    type: "GROCERY" /* GROCERY */,
    label: "Grocery Shop",
    labelSi: "\u0DC3\u0DD2\u0DBD\u0DCA\u0DBD\u0DBB \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F6D2}",
    description: "Supermarket, mini-mart \u2014 weight, volume, expiry tracking",
    defaultCategories: ["Fresh Produce", "Dairy & Eggs", "Beverages", "Snacks", "Frozen Foods", "Household"],
    variantAttributes: [
      { name: "Weight", presets: ["250g", "500g", "1kg", "2kg", "5kg"], mapsTo: "size" },
      { name: "Pack", presets: ["Single", "6-Pack", "12-Pack", "Carton"], mapsTo: "style" }
    ],
    defaultUnit: "kg",
    units: ["pcs", "kg", "g", "L", "ml", "pack"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false, workshop: false, appointments: false },
    labelTemplates: ["sticker", "shelf"]
  },
  ["HARDWARE" /* HARDWARE */]: {
    type: "HARDWARE" /* HARDWARE */,
    label: "Hardware Shop",
    labelSi: "Hardware \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F527}",
    description: "Tools, plumbing, electrical \u2014 specs, SKU, bulk items",
    defaultCategories: ["Tools", "Electrical", "Plumbing", "Paint", "Building Materials", "Safety Gear"],
    variantAttributes: [
      { name: "Size", presets: ["Small", "Medium", "Large", "10mm", "12mm", "20mm"], mapsTo: "size" },
      { name: "Material", presets: ["Steel", "Brass", "PVC", "Copper", "Aluminium"], mapsTo: "material" }
    ],
    defaultUnit: "pcs",
    units: ["pcs", "piece", "kg", "feet", "meter", "box", "set", "roll"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true, workshop: false, appointments: false },
    labelTemplates: ["sticker", "shelf"]
  },
  ["AGRICULTURE" /* AGRICULTURE */]: {
    type: "AGRICULTURE" /* AGRICULTURE */,
    label: "Agriculture Shop",
    labelSi: "\u0D9A\u0DD8\u0DC2\u0DD2\u0D9A\u0DBB\u0DCA\u0DB8 \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F33E}",
    description: "Seeds, fertilizer, equipment \u2014 grade, batch, season",
    defaultCategories: ["Seeds", "Fertilizer", "Pesticides", "Equipment", "Animal Feed", "Irrigation"],
    variantAttributes: [
      { name: "Weight", presets: ["1kg", "5kg", "10kg", "25kg", "50kg"], mapsTo: "size" },
      { name: "Grade", presets: ["Grade A", "Grade B", "Premium", "Standard"], mapsTo: "style" }
    ],
    defaultUnit: "kg",
    units: ["kg", "bag", "pcs", "liter", "acre"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false, workshop: false, appointments: false },
    labelTemplates: ["sticker", "shelf"]
  },
  ["SPARE_PARTS" /* SPARE_PARTS */]: {
    type: "SPARE_PARTS" /* SPARE_PARTS */,
    label: "Spare Parts Shop",
    labelSi: "Spare Parts \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F697}",
    description: "Auto spare parts \u2014 vehicle compatibility, warranty, quotations",
    defaultCategories: ["Engine Parts", "Brakes & Suspension", "Filters", "Electrical", "Body Parts", "Lubricants", "Accessories"],
    variantAttributes: [
      { name: "OEM No", presets: [], mapsTo: "size" },
      { name: "Part Type", presets: ["OEM", "Aftermarket", "Genuine"], mapsTo: "style" }
    ],
    defaultUnit: "pcs",
    units: ["pcs", "set", "pair", "box", "liter"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true, workshop: false, appointments: false },
    labelTemplates: ["sticker", "shelf"]
  },
  ["TIRE_SHOP" /* TIRE_SHOP */]: {
    type: "TIRE_SHOP" /* TIRE_SHOP */,
    label: "Tyre Shop",
    labelSi: "Tyre Shop",
    emoji: "\u{1F6DE}",
    description: "Tyres & rims \u2014 fitment, workshop services, job cards, fleet",
    defaultCategories: ["Passenger Tyres", "SUV & 4x4 Tyres", "Commercial Tyres", "Rims & Wheels", "Accessories"],
    variantAttributes: [
      { name: "Tyre Size", presets: ["205/55R16", "195/65R15", "215/60R16", "265/65R17"], mapsTo: "size" },
      { name: "Season", presets: ["All Season", "Summer", "Winter"], mapsTo: "style" },
      { name: "Tube Type", presets: ["Tubeless", "Tube"], mapsTo: "material" }
    ],
    defaultUnit: "pcs",
    units: ["pcs", "set", "pair", "box"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true, workshop: true, appointments: true },
    labelTemplates: ["sticker", "shelf"]
  },
  ["GENERAL" /* GENERAL */]: {
    type: "GENERAL" /* GENERAL */,
    label: "General Shop",
    labelSi: "\u0DC3\u0DCF\u0DB8\u0DCF\u0DB1\u0DCA\u200D\u0DBA \u0D9A\u0DA9\u0DBA",
    emoji: "\u{1F3EA}",
    description: "General retail \u2014 mixed products, simple variants, POS & inventory",
    defaultCategories: ["General Merchandise", "Electronics", "Home & Living", "Health & Beauty", "Stationery", "Other"],
    variantAttributes: [
      { name: "Size", presets: ["Small", "Medium", "Large", "Standard"], mapsTo: "size" },
      { name: "Variant", presets: ["Standard", "Premium", "Economy"], mapsTo: "style" }
    ],
    defaultUnit: "pcs",
    units: ["pcs", "set", "pair", "box", "kg", "pack"],
    modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true, workshop: false, appointments: false },
    labelTemplates: ["sticker", "shelf"]
  }
};
var SHOP_TYPE_LIST = Object.values(SHOP_PROFILES);
function getShopProfile(type) {
  const key = type ?? "CLOTHING" /* CLOTHING */;
  return SHOP_PROFILES[key] ?? SHOP_PROFILES["CLOTHING" /* CLOTHING */];
}
function slugifyCategory(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// prisma/seed.ts
var prisma = new import_client.PrismaClient();
async function main() {
  console.log("\u{1F331} Seeding database...");
  const passwordHash = await bcrypt.hash("Admin@123456", 12);
  const platformTenant = await prisma.tenant.upsert({
    where: { subdomain: "platform" },
    update: {},
    create: {
      name: "Hexalyte Platform",
      subdomain: "platform",
      email: "admin@hexalyte.com",
      plan: import_client.SubscriptionPlan.ENTERPRISE,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo",
      maxBranches: 999,
      maxUsers: 999,
      maxProducts: 999999,
      shopType: "CLOTHING"
    }
  });
  console.log(`\u2705 Platform tenant: ${platformTenant.name}`);
  const platformBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: platformTenant.id, code: "HQ" } },
    update: {},
    create: {
      tenantId: platformTenant.id,
      name: "Headquarters",
      code: "HQ",
      isDefault: true,
      city: "Colombo",
      state: "Western"
    }
  });
  const platformSuperAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: platformTenant.id, name: "Platform Admin" } },
    update: { type: import_client.RoleType.SUPER_ADMIN },
    create: {
      tenantId: platformTenant.id,
      name: "Platform Admin",
      type: import_client.RoleType.SUPER_ADMIN,
      isSystem: true
    }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: platformTenant.id, email: "admin@hexalyte.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: platformTenant.id,
      branchId: platformBranch.id,
      email: "admin@hexalyte.com",
      firstName: "Platform",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: platformSuperAdminRole.id }] }
    }
  });
  console.log("\u2705 Platform admin: admin@hexalyte.com (password: Admin@123456) \u2014 admin3.hexalyte.com only");
    const tenant = await prisma.tenant.upsert({
    where: { subdomain: "demo" },
        update: {},
        create: {
      name: "Demo Fashion Store",
      subdomain: "demo",
      email: "admin@demo.fashionerp.com",
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "INR",
      country: "IN",
      timezone: "Asia/Kolkata",
      shopType: "CLOTHING"
    }
  });
  console.log(`\u2705 Tenant: ${tenant.name} (${tenant.id})`);
    const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "HO-001" } },
        update: {},
        create: {
            tenantId: tenant.id,
      name: "Main Store - Head Office",
      code: "HO-001",
            isDefault: true,
      city: "Mumbai",
      state: "Maharashtra"
    }
  });
  console.log(`\u2705 Branch: ${branch.name} (${branch.id})`);
    const permissionDefs = [
    // Products
    { resource: "products", action: "create" },
    { resource: "products", action: "read" },
    { resource: "products", action: "update" },
    { resource: "products", action: "delete" },
    // Inventory
    { resource: "inventory", action: "create" },
    { resource: "inventory", action: "read" },
    { resource: "inventory", action: "update" },
    // Sales
    { resource: "sales", action: "create" },
    { resource: "sales", action: "read" },
    { resource: "sales", action: "update" },
    // Customers
    { resource: "customers", action: "create" },
    { resource: "customers", action: "read" },
    { resource: "customers", action: "update" },
    { resource: "customers", action: "delete" },
    // Suppliers
    { resource: "suppliers", action: "create" },
    { resource: "suppliers", action: "read" },
    // Purchases
    { resource: "purchases", action: "create" },
    { resource: "purchases", action: "read" },
    { resource: "purchases", action: "update" },
    // Reports
    { resource: "reports", action: "read" },
    // Accounting
    { resource: "accounting", action: "create" },
    { resource: "accounting", action: "read" },
    // Cash management
    { resource: "cash", action: "create" },
    { resource: "cash", action: "read" },
    { resource: "cash", action: "update" },
    // HR
    { resource: "hr", action: "create" },
    { resource: "hr", action: "read" },
    { resource: "hr", action: "update" },
    // Users
    { resource: "users", action: "create" },
    { resource: "users", action: "read" },
    { resource: "users", action: "update" },
    { resource: "users", action: "delete" },
    // Roles
    { resource: "roles", action: "create" },
    { resource: "roles", action: "read" },
    { resource: "roles", action: "update" }
  ];
  const permissions = await Promise.all(
    permissionDefs.map(
      (p) => prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { resource: p.resource, action: p.action }
      })
    )
  );
  console.log(`\u2705 Seeded ${permissions.length} permissions`);
  const syncRolePermissions = async (roleId, permKeys) => {
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const ids = permissions.filter((p) => permKeys.includes(`${p.resource}:${p.action}`));
    if (ids.length) {
      await prisma.rolePermission.createMany({
        data: ids.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true
      });
    }
  };
    const superAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Super Admin" } },
        update: {},
    create: { tenantId: tenant.id, name: "Super Admin", type: import_client.RoleType.SUPER_ADMIN, isSystem: true }
    });
    const tenantAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Tenant Admin" } },
        update: {},
        create: {
      tenantId: tenant.id,
      name: "Tenant Admin",
      type: import_client.RoleType.TENANT_ADMIN,
      isSystem: true,
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) }
    }
    });
    const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Cashier" } },
        update: {},
        create: {
      tenantId: tenant.id,
      name: "Cashier",
      type: import_client.RoleType.CASHIER,
      isSystem: true,
            permissions: {
        create: permissions.filter((p) => ["sales", "customers", "inventory", "products"].includes(p.resource) && p.action !== "delete").map((p) => ({ permissionId: p.id }))
      }
    }
  });
  const permIds = (...keys) => permissions.filter((p) => keys.includes(`${p.resource}:${p.action}`)).map((p) => ({ permissionId: p.id }));
  const branchManagerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Branch Manager" } },
    update: { type: import_client.RoleType.BRANCH_MANAGER },
    create: {
      tenantId: tenant.id,
      name: "Branch Manager",
      type: import_client.RoleType.BRANCH_MANAGER,
      isSystem: true,
      permissions: {
        create: permIds(
          "inventory:read",
          "inventory:update",
          "purchases:read",
          "purchases:create",
          "purchases:update",
          "sales:read",
          "reports:read",
          "products:read"
        )
      }
    }
  });
  const inventoryManagerRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Inventory Manager" } },
    update: { type: import_client.RoleType.INVENTORY_MANAGER },
    create: {
      tenantId: tenant.id,
      name: "Inventory Manager",
      type: import_client.RoleType.INVENTORY_MANAGER,
      isSystem: true,
      permissions: {
        create: permIds(
          "inventory:read",
          "inventory:update",
          "inventory:create",
          "products:read",
          "products:update",
          "reports:read"
        )
      }
    }
  });
  const accountantRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Accountant" } },
    update: { type: import_client.RoleType.ACCOUNTANT },
    create: {
      tenantId: tenant.id,
      name: "Accountant",
      type: import_client.RoleType.ACCOUNTANT,
      isSystem: true,
      permissions: {
        create: permIds(
          "accounting:read",
          "accounting:create",
          "purchases:read",
          "purchases:update",
          "reports:read"
        )
      }
    }
  });
  const purchasingStaffRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Purchasing Staff" } },
    update: { type: import_client.RoleType.CUSTOM },
    create: {
      tenantId: tenant.id,
      name: "Purchasing Staff",
      type: import_client.RoleType.CUSTOM,
      isSystem: true,
      permissions: {
        create: permIds(
          "purchases:read",
          "purchases:create",
          "purchases:update",
          "suppliers:read",
          "products:read",
          "inventory:read"
        )
      }
    }
  });
  await syncRolePermissions(branchManagerRole.id, [
    "inventory:read",
    "inventory:update",
    "purchases:read",
    "purchases:create",
    "purchases:update",
    "sales:read",
    "reports:read",
    "products:read"
  ]);
  await syncRolePermissions(inventoryManagerRole.id, [
    "inventory:read",
    "inventory:update",
    "inventory:create",
    "products:read",
    "products:update",
    "reports:read"
  ]);
  await syncRolePermissions(accountantRole.id, [
    "accounting:read",
    "accounting:create",
    "purchases:read",
    "purchases:update",
    "reports:read"
  ]);
  await syncRolePermissions(purchasingStaffRole.id, [
    "purchases:read",
    "purchases:create",
    "purchases:update",
    "suppliers:read",
    "products:read",
    "inventory:read"
  ]);
  console.log("\u2705 Seeded roles: Super Admin, Tenant Admin, Cashier, Branch Manager, Inventory Manager, Accountant, Purchasing Staff");
    const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
      email: "admin@demo.fashionerp.com",
      firstName: "Admin",
      lastName: "User",
            passwordHash,
            emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: tenantAdminRole.id }] }
    }
  });
  await prisma.userRole.deleteMany({
    where: { userId: adminUser.id, roleId: superAdminRole.id }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: tenantAdminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: tenantAdminRole.id }
  });
  console.log(`\u2705 Shop admin: ${adminUser.email} (password: Admin@123456) \u2014 shop.hexalyte.com only`);
    const cashierUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "cashier@demo.fashionerp.com" } },
        update: {},
        create: {
            tenantId: tenant.id,
            branchId: branch.id,
      email: "cashier@demo.fashionerp.com",
      firstName: "Demo",
      lastName: "Cashier",
      passwordHash: await bcrypt.hash("Cashier@123456", 12),
            emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: cashierRole.id }] }
    }
  });
  console.log(`\u2705 Cashier user: ${cashierUser.email} (password: Cashier@123456)`);
  const managerPassword = await bcrypt.hash("Manager@123456", 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "manager@demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: "manager@demo.fashionerp.com",
      firstName: "Demo",
      lastName: "Branch Manager",
      passwordHash: managerPassword,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: branchManagerRole.id }] }
    }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "inventory@demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: "inventory@demo.fashionerp.com",
      firstName: "Demo",
      lastName: "Inventory Manager",
      passwordHash: managerPassword,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: inventoryManagerRole.id }] }
    }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "accountant@demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: "accountant@demo.fashionerp.com",
      firstName: "Demo",
      lastName: "Accountant",
      passwordHash: managerPassword,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: accountantRole.id }] }
    }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "purchasing@demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: "purchasing@demo.fashionerp.com",
      firstName: "Demo",
      lastName: "Purchasing",
      passwordHash: managerPassword,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: purchasingStaffRole.id }] }
    }
  });
  console.log("\u2705 Workflow users: manager@ / inventory@ / accountant@ / purchasing@demo.fashionerp.com (password: Manager@123456)");
  const clothingCategories = getShopProfile(import_client.ShopType.CLOTHING).defaultCategories;
  for (const name of clothingCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: tenant.id, name, slug: slugifyCategory(name) }
    });
  }
  console.log(`\u2705 Seeded ${clothingCategories.length} clothing categories`);
  const groceryProfile = getShopProfile(import_client.ShopType.GROCERY);
  const groceryTenant = await prisma.tenant.upsert({
    where: { subdomain: "grocery" },
    update: { shopType: import_client.ShopType.GROCERY },
    create: {
      name: "Demo Grocery Mart",
      subdomain: "grocery",
      email: "admin@grocery.demo.fashionerp.com",
      shopType: import_client.ShopType.GROCERY,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const groceryBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: groceryTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: groceryTenant.id,
      name: "Main Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const groceryAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: groceryTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: groceryTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: groceryTenant.id, email: "admin@grocery.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: groceryTenant.id,
      branchId: groceryBranch.id,
      email: "admin@grocery.demo.fashionerp.com",
      firstName: "Grocery",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: groceryAdminRole.id }] }
    }
  });
  for (const name of groceryProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: groceryTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: groceryTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  await prisma.tenant.update({
    where: { id: groceryTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: groceryProfile.type,
          defaultUnit: groceryProfile.defaultUnit,
          units: groceryProfile.units,
          modules: groceryProfile.modules,
          labelTemplates: groceryProfile.labelTemplates,
          variantAttributes: groceryProfile.variantAttributes
        }
      }
    }
  });
  console.log("\u2705 Grocery demo: grocery.shop.hexalyte.com \u2014 admin@grocery.demo.fashionerp.com / Admin@123456");
  const hardwareProfile = getShopProfile(import_client.ShopType.HARDWARE);
  const hardwareTenant = await prisma.tenant.upsert({
    where: { subdomain: "hardware" },
    update: { shopType: import_client.ShopType.HARDWARE },
    create: {
      name: "Demo Hardware Store",
      subdomain: "hardware",
      email: "admin@hardware.demo.fashionerp.com",
      shopType: import_client.ShopType.HARDWARE,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const hardwareBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: hardwareTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: hardwareTenant.id,
      name: "Main Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const hardwareAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: hardwareTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: hardwareTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: hardwareTenant.id, email: "admin@hardware.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: hardwareTenant.id,
      branchId: hardwareBranch.id,
      email: "admin@hardware.demo.fashionerp.com",
      firstName: "Hardware",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: hardwareAdminRole.id }] }
    }
  });
  for (const name of hardwareProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: hardwareTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: hardwareTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  await prisma.tenant.update({
    where: { id: hardwareTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: hardwareProfile.type,
          defaultUnit: hardwareProfile.defaultUnit,
          units: hardwareProfile.units,
          modules: hardwareProfile.modules,
          labelTemplates: hardwareProfile.labelTemplates,
          variantAttributes: hardwareProfile.variantAttributes
        }
      }
    }
  });
  console.log("\u2705 Hardware demo: hardware.shop.hexalyte.com \u2014 admin@hardware.demo.fashionerp.com / Admin@123456");
  const agriProfile = getShopProfile(import_client.ShopType.AGRICULTURE);
  const agriTenant = await prisma.tenant.upsert({
    where: { subdomain: "agri" },
    update: { shopType: import_client.ShopType.AGRICULTURE },
    create: {
      name: "Demo Agriculture Store",
      subdomain: "agri",
      email: "admin@agri.demo.fashionerp.com",
      shopType: import_client.ShopType.AGRICULTURE,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const agriBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: agriTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: agriTenant.id,
      name: "Main Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const agriAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: agriTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: agriTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: agriTenant.id, email: "admin@agri.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: agriTenant.id,
      branchId: agriBranch.id,
      email: "admin@agri.demo.fashionerp.com",
      firstName: "Agri",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: agriAdminRole.id }] }
    }
  });
  for (const name of agriProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: agriTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: agriTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  await prisma.tenant.update({
    where: { id: agriTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: agriProfile.type,
          defaultUnit: agriProfile.defaultUnit,
          units: agriProfile.units,
          modules: agriProfile.modules,
          labelTemplates: agriProfile.labelTemplates,
          variantAttributes: agriProfile.variantAttributes
        }
      }
    }
  });
  console.log("\u2705 Agriculture demo: agri.shop.hexalyte.com \u2014 admin@agri.demo.fashionerp.com / Admin@123456");
  const spareProfile = getShopProfile(import_client.ShopType.SPARE_PARTS);
  const spareTenant = await prisma.tenant.upsert({
    where: { subdomain: "spareparts" },
    update: { shopType: import_client.ShopType.SPARE_PARTS },
    create: {
      name: "Demo Spare Parts Store",
      subdomain: "spareparts",
      email: "admin@spareparts.demo.fashionerp.com",
      shopType: import_client.ShopType.SPARE_PARTS,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const spareBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: spareTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: spareTenant.id,
      name: "Main Parts Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const spareBranch2 = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: spareTenant.id, code: "BR-002" } },
    update: {},
    create: {
      tenantId: spareTenant.id,
      name: "Branch \u2014 Kandy",
      code: "BR-002",
      city: "Kandy"
    }
  });
  const spareAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: spareTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: spareTenant.id, email: "admin@spareparts.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: spareTenant.id,
      branchId: spareBranch.id,
      email: "admin@spareparts.demo.fashionerp.com",
      firstName: "Spare",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: spareAdminRole.id }] }
    }
  });
  for (const name of spareProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: spareTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: spareTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  const toyotaBrand = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: "Toyota" } },
    update: {},
    create: { tenantId: spareTenant.id, name: "Toyota" }
  });
  const hondaBrand = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: spareTenant.id, name: "Honda" } },
    update: {},
    create: { tenantId: spareTenant.id, name: "Honda" }
  });
  const toyotaAxio = await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: "Axio" } }) ?? await prisma.vehicleModel.create({
    data: { tenantId: spareTenant.id, brandId: toyotaBrand.id, name: "Axio", yearFrom: 2012, yearTo: 2020, engineCapacity: "1500cc" }
  });
  await prisma.vehicleModel.findFirst({ where: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: "Vezel" } }) ?? await prisma.vehicleModel.create({
    data: { tenantId: spareTenant.id, brandId: hondaBrand.id, name: "Vezel", yearFrom: 2014, yearTo: 2022, engineCapacity: "1500cc" }
  });
  void toyotaAxio;
  const warrantyCategoryNames = ["Engine Parts", "Brakes & Suspension", "Electrical", "Filters"];
  const warrantyCategories = await prisma.category.findMany({
    where: { tenantId: spareTenant.id, name: { in: warrantyCategoryNames } },
    select: { id: true }
  });
  if (warrantyCategories.length) {
    const { count } = await prisma.product.updateMany({
      where: {
        tenantId: spareTenant.id,
        categoryId: { in: warrantyCategories.map((c) => c.id) },
        OR: [{ warrantyMonths: null }, { warrantyMonths: 0 }]
      },
      data: { warrantyMonths: 12 }
    });
    if (count > 0) console.log(`\u2705 Spare parts: ${count} product(s) set to 12-month warranty`);
  }
  const { count: namedCount } = await prisma.product.updateMany({
    where: {
      tenantId: spareTenant.id,
      OR: [{ warrantyMonths: null }, { warrantyMonths: 0 }],
      name: { contains: "filter", mode: "insensitive" }
    },
    data: { warrantyMonths: 12 }
  });
  if (namedCount > 0) console.log(`\u2705 Spare parts: ${namedCount} filter product(s) set to 12-month warranty`);
  await prisma.tenant.update({
    where: { id: spareTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: spareProfile.type,
          defaultUnit: spareProfile.defaultUnit,
          units: spareProfile.units,
          modules: spareProfile.modules,
          labelTemplates: spareProfile.labelTemplates,
          variantAttributes: spareProfile.variantAttributes
        }
      }
    }
  });
  console.log("\u2705 Spare Parts demo: spareparts.shop.hexalyte.com \u2014 admin@spareparts.demo.fashionerp.com / Admin@123456");
  const tyreProfile = getShopProfile(import_client.ShopType.TIRE_SHOP);
  const tyreTenant = await prisma.tenant.upsert({
    where: { subdomain: "tyres" },
    update: { shopType: import_client.ShopType.TIRE_SHOP },
    create: {
      name: "Demo Tyre Shop",
      subdomain: "tyres",
      email: "admin@tyres.demo.fashionerp.com",
      shopType: import_client.ShopType.TIRE_SHOP,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const tyreBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tyreTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: tyreTenant.id,
      name: "Main Tyre Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const tyreAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tyreTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tyreTenant.id, email: "admin@tyres.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: tyreTenant.id,
      branchId: tyreBranch.id,
      email: "admin@tyres.demo.fashionerp.com",
      firstName: "Tyre",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: tyreAdminRole.id }] }
    }
  });
  for (const name of tyreProfile.defaultCategories) {
        await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tyreTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: tyreTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  const passengerTyresCat = await prisma.category.findFirst({
    where: { tenantId: tyreTenant.id, slug: slugifyCategory("Passenger Tyres") }
  });
  const michelinBrand = await prisma.brand.upsert({
    where: { tenantId_slug: { tenantId: tyreTenant.id, slug: "michelin" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Michelin", slug: "michelin", isActive: true }
  });
  const bridgestoneBrand = await prisma.brand.upsert({
    where: { tenantId_slug: { tenantId: tyreTenant.id, slug: "bridgestone" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Bridgestone", slug: "bridgestone", isActive: true }
  });
  const toyotaTyre = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: tyreTenant.id, name: "Toyota" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Toyota" }
  });
  const hondaTyre = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: tyreTenant.id, name: "Honda" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Honda" }
  });
  const suzukiTyre = await prisma.vehicleBrand.upsert({
    where: { tenantId_name: { tenantId: tyreTenant.id, name: "Suzuki" } },
    update: {},
    create: { tenantId: tyreTenant.id, name: "Suzuki" }
  });
  const axioModel = await prisma.vehicleModel.findFirst({
    where: { tenantId: tyreTenant.id, brandId: toyotaTyre.id, name: "Axio" }
  }) ?? await prisma.vehicleModel.create({
    data: { tenantId: tyreTenant.id, brandId: toyotaTyre.id, name: "Axio", yearFrom: 2012, yearTo: 2020, engineCapacity: "1500cc" }
  });
  const vezelModel = await prisma.vehicleModel.findFirst({
    where: { tenantId: tyreTenant.id, brandId: hondaTyre.id, name: "Vezel" }
  }) ?? await prisma.vehicleModel.create({
    data: { tenantId: tyreTenant.id, brandId: hondaTyre.id, name: "Vezel", yearFrom: 2014, yearTo: 2022, engineCapacity: "1500cc" }
  });
  const wagonRModel = await prisma.vehicleModel.findFirst({
    where: { tenantId: tyreTenant.id, brandId: suzukiTyre.id, name: "Wagon R" }
  }) ?? await prisma.vehicleModel.create({
    data: { tenantId: tyreTenant.id, brandId: suzukiTyre.id, name: "Wagon R", yearFrom: 2014, yearTo: 2023, engineCapacity: "1000cc" }
  });
  if (passengerTyresCat) {
    const existingTyreProduct = await prisma.product.findFirst({
      where: { tenantId: tyreTenant.id, sku: "TYR-MIC-PRIM4" }
    });
    if (!existingTyreProduct) {
      const primacy = await prisma.product.create({
        data: {
          tenantId: tyreTenant.id,
          name: "Michelin Primacy 4",
          slug: "michelin-primacy-4",
          sku: "TYR-MIC-PRIM4",
          categoryId: passengerTyresCat.id,
          brandId: michelinBrand.id,
          status: import_client.ProductStatus.ACTIVE,
          loadIndex: "91",
          speedRating: "H",
          warrantyMonths: 24,
          hasVariants: true,
          trackInventory: true,
          sellingPrice: 42e3,
          costPrice: 31e3,
          mrp: 45e3,
          taxRate: 18,
          tags: ["Premium", "Passenger"]
        }
      });
      const v2052 = await prisma.productVariant.create({
        data: {
          productId: primacy.id,
          sku: "TYR-MIC-2055516",
          name: "205/55R16 \xB7 All Season",
          size: "205/55R16",
          style: "All Season",
          barcode: "2288854718885000",
          sellingPrice: 42e3,
          costPrice: 31e3,
          mrp: 45e3
        }
      });
      const v1952 = await prisma.productVariant.create({
        data: {
          productId: primacy.id,
          sku: "TYR-MIC-1956515",
          name: "195/65R15 \xB7 All Season",
          size: "195/65R15",
          style: "All Season",
          barcode: "2288854718886000",
          sellingPrice: 38e3,
          costPrice: 28e3,
          mrp: 41e3
        }
      });
      await prisma.inventory.createMany({
        data: [
          { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v2052.id, quantity: 12 },
          { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v1952.id, quantity: 8 }
        ],
        skipDuplicates: true
      });
      await prisma.partCompatibility.createMany({
        data: [
          { tenantId: tyreTenant.id, vehicleModelId: axioModel.id, variantId: v2052.id, notes: "Factory size" },
          { tenantId: tyreTenant.id, vehicleModelId: vezelModel.id, variantId: v2052.id, notes: "Recommended upgrade" },
          { tenantId: tyreTenant.id, vehicleModelId: wagonRModel.id, variantId: v1952.id, notes: "Factory size" }
        ],
        skipDuplicates: true
      });
    }
    const existingBsProduct = await prisma.product.findFirst({
      where: { tenantId: tyreTenant.id, sku: "TYR-BS-TUR" }
    });
    if (!existingBsProduct) {
      const turanza = await prisma.product.create({
        data: {
          tenantId: tyreTenant.id,
          name: "Bridgestone Turanza T005",
          slug: "bridgestone-turanza-t005",
          sku: "TYR-BS-TUR",
          categoryId: passengerTyresCat.id,
          brandId: bridgestoneBrand.id,
          status: import_client.ProductStatus.ACTIVE,
          loadIndex: "94",
          speedRating: "V",
          warrantyMonths: 36,
          hasVariants: true,
          trackInventory: true,
          sellingPrice: 48e3,
          costPrice: 35e3,
          mrp: 52e3,
          taxRate: 18,
          tags: ["Premium", "Summer"]
        }
      });
      const v2152 = await prisma.productVariant.create({
        data: {
          productId: turanza.id,
          sku: "TYR-BS-2156016",
          name: "215/60R16 \xB7 Summer",
          size: "215/60R16",
          style: "Summer",
          barcode: "2288854718887000",
          sellingPrice: 48e3,
          costPrice: 35e3,
          mrp: 52e3
        }
      });
      await prisma.inventory.create({
        data: { tenantId: tyreTenant.id, branchId: tyreBranch.id, variantId: v2152.id, quantity: 6 }
      });
      await prisma.partCompatibility.create({
        data: { tenantId: tyreTenant.id, vehicleModelId: vezelModel.id, variantId: v2152.id, notes: "Optional wider fit" }
      }).catch(() => void 0);
    }
  }
  await prisma.tenant.update({
    where: { id: tyreTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: tyreProfile.type,
          defaultUnit: tyreProfile.defaultUnit,
          units: tyreProfile.units,
          modules: tyreProfile.modules,
          labelTemplates: tyreProfile.labelTemplates,
          variantAttributes: tyreProfile.variantAttributes
        }
      }
    }
  });
  const workshopDefaults = [
    { code: "FIT", name: "Tyre Fitting", category: "FITTING", defaultPrice: 1500, durationMinutes: 30 },
    { code: "BAL", name: "Wheel Balancing", category: "BALANCING", defaultPrice: 2e3, durationMinutes: 45 },
    { code: "ALN", name: "Wheel Alignment", category: "ALIGNMENT", defaultPrice: 3500, durationMinutes: 60 },
    { code: "ROT", name: "Tyre Rotation", category: "MAINTENANCE", defaultPrice: 2500, durationMinutes: 45 },
    { code: "NIT", name: "Nitrogen Filling", category: "MAINTENANCE", defaultPrice: 1e3, durationMinutes: 20 },
    { code: "PUN", name: "Puncture Repair", category: "REPAIR", defaultPrice: 800, durationMinutes: 30 }
  ];
  for (const s of workshopDefaults) {
    await prisma.workshopServiceCatalog.upsert({
      where: { tenantId_code: { tenantId: tyreTenant.id, code: s.code } },
      update: { name: s.name, defaultPrice: s.defaultPrice, durationMinutes: s.durationMinutes, category: s.category },
      create: { tenantId: tyreTenant.id, ...s }
    });
  }
  const v205 = await prisma.productVariant.findFirst({
    where: { sku: "TYR-MIC-2055516", product: { tenantId: tyreTenant.id } }
  });
  const v195 = await prisma.productVariant.findFirst({
    where: { sku: "TYR-MIC-1956515", product: { tenantId: tyreTenant.id } }
  });
  const v215 = await prisma.productVariant.findFirst({
    where: { sku: "TYR-BS-2156016", product: { tenantId: tyreTenant.id } }
  });
  if (v205) await prisma.productVariant.update({ where: { id: v205.id }, data: { dotCode: "2424" } });
  if (v195) await prisma.productVariant.update({ where: { id: v195.id }, data: { dotCode: "2323" } });
  if (v215) await prisma.productVariant.update({ where: { id: v215.id }, data: { dotCode: "2412" } });
  const svcFit = await prisma.workshopServiceCatalog.findUnique({
    where: { tenantId_code: { tenantId: tyreTenant.id, code: "FIT" } }
  });
  const svcBal = await prisma.workshopServiceCatalog.findUnique({
    where: { tenantId_code: { tenantId: tyreTenant.id, code: "BAL" } }
  });
  const svcAln = await prisma.workshopServiceCatalog.findUnique({
    where: { tenantId_code: { tenantId: tyreTenant.id, code: "ALN" } }
  });
  const svcRot = await prisma.workshopServiceCatalog.findUnique({
    where: { tenantId_code: { tenantId: tyreTenant.id, code: "ROT" } }
  });
  const tyreAdmin = await prisma.user.findFirst({
    where: { tenantId: tyreTenant.id, email: "admin@tyres.demo.fashionerp.com" }
  });
  if (tyreAdmin) {
    await prisma.supplier.findFirst({ where: { tenantId: tyreTenant.id, phone: "0112555000" } }) ?? await prisma.supplier.create({
      data: {
        tenantId: tyreTenant.id,
        code: "SUP-MIC",
        name: "Michelin Lanka Distributors",
        contactPerson: "Ravi Mendis",
        phone: "0112555000",
        email: "orders@michelin.lk",
        city: "Colombo",
        creditDays: 30,
        isActive: true
      }
    });
    const kamal = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tyreTenant.id, phone: "0771234567" } },
            update: {},
            create: {
        tenantId: tyreTenant.id,
        firstName: "Kamal",
        lastName: "Perera",
        phone: "0771234567",
        email: "kamal@example.com"
      }
    });
    const nimal = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tyreTenant.id, phone: "0772345678" } },
      update: {},
      create: {
        tenantId: tyreTenant.id,
        firstName: "Nimal",
        lastName: "Silva",
        phone: "0772345678",
        email: "nimal@example.com"
      }
    });
    const fleetCo = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tyreTenant.id, phone: "0112555123" } },
      update: { isFleet: true },
      create: {
        tenantId: tyreTenant.id,
        firstName: "Lanka",
        lastName: "Fleet Services",
        phone: "0112555123",
        email: "fleet@lankafleet.lk",
        isFleet: true
      }
    });
    const sasha = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tyreTenant.id, phone: "0773456789" } },
      update: {},
      create: {
        tenantId: tyreTenant.id,
        firstName: "Sasha",
        lastName: "Fernando",
        phone: "0773456789",
        email: "sasha@example.com"
      }
    });
    const upsertVehicle = async (customerId, registrationNo, vehicleModelId, make, model, year, isPrimary = false) => {
      const existing = await prisma.customerVehicle.findFirst({
        where: { tenantId: tyreTenant.id, customerId, registrationNo }
      });
      if (existing) return existing;
      return prisma.customerVehicle.create({
        data: {
          tenantId: tyreTenant.id,
          customerId,
          vehicleModelId,
          registrationNo,
          make,
          model,
          year,
          isPrimary
        }
      });
    };
    const kamalVeh = await upsertVehicle(kamal.id, "CAB-1234", axioModel.id, "Toyota", "Axio", 2018, true);
    const nimalVeh = await upsertVehicle(nimal.id, "CAR-5678", vezelModel.id, "Honda", "Vezel", 2019, true);
    const fleetVeh1 = await upsertVehicle(fleetCo.id, "VAN-1001", axioModel.id, "Toyota", "Hiace", 2017, true);
    const fleetVeh2 = await upsertVehicle(fleetCo.id, "VAN-1002", wagonRModel.id, "Suzuki", "Wagon R", 2020, false);
    const sashaVeh = await upsertVehicle(sasha.id, "CAB-9012", wagonRModel.id, "Suzuki", "Wagon R", 2021, true);
    const now = /* @__PURE__ */ new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 5);
    nextWeek.setHours(14, 30, 0, 0);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(9, 0, 0, 0);
    const inThreeDays = new Date(now);
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const upsertAppointment = async (data) => {
      const existing = await prisma.appointment.findUnique({
        where: { tenantId_appointmentNumber: { tenantId: tyreTenant.id, appointmentNumber: data.appointmentNumber } }
      });
      if (existing) return existing;
      return prisma.appointment.create({
        data: {
          tenantId: tyreTenant.id,
          branchId: tyreBranch.id,
          createdBy: tyreAdmin.id,
          durationMinutes: 60,
          ...data
        }
      });
    };
    await upsertAppointment({
      appointmentNumber: "DEMO-APT-001",
      customerId: kamal.id,
      customerVehicleId: kamalVeh.id,
      status: import_client.AppointmentStatus.SCHEDULED,
      scheduledAt: tomorrow,
      serviceTypes: ["Wheel Alignment", "Tyre Rotation"],
      notes: "Customer requested morning slot"
    });
    await upsertAppointment({
      appointmentNumber: "DEMO-APT-002",
      customerId: nimal.id,
      customerVehicleId: nimalVeh.id,
      status: import_client.AppointmentStatus.CONFIRMED,
      scheduledAt: nextWeek,
      serviceTypes: ["Tyre Fitting", "Wheel Balancing"],
      notes: "4 new tyres \u2014 Bridgestone Turanza"
    });
    const aptCompleted = await upsertAppointment({
      appointmentNumber: "DEMO-APT-003",
      customerId: kamal.id,
      customerVehicleId: kamalVeh.id,
      status: import_client.AppointmentStatus.COMPLETED,
      scheduledAt: lastWeek,
      serviceTypes: ["Tyre Fitting", "Wheel Balancing"],
      notes: "Completed \u2014 4\xD7 Michelin Primacy 205/55R16"
    });
    await upsertAppointment({
      appointmentNumber: "DEMO-APT-004",
      customerId: sasha.id,
      customerVehicleId: sashaVeh.id,
      status: import_client.AppointmentStatus.CANCELLED,
      scheduledAt: inThreeDays,
      serviceTypes: ["Puncture Repair"],
      notes: "Customer rescheduled \u2014 cancelled"
    });
    const lineTotal = (qty, price, taxRate = 18) => {
      const sub = qty * price;
      const tax = sub * (taxRate / 100);
      return { total: sub + tax, taxRate };
    };
    const upsertJobCard = async (data) => {
      const existing = await prisma.jobCard.findUnique({
        where: { tenantId_jobNumber: { tenantId: tyreTenant.id, jobNumber: data.jobNumber } },
        include: { lines: true }
      });
      if (existing) return existing;
      const { lines, ...jobData } = data;
      let subtotal = 0;
      let taxAmount = 0;
      const lineRows = lines.map((l) => {
        const { total, taxRate } = lineTotal(l.quantity, l.unitPrice);
        const preTax = l.quantity * l.unitPrice;
        subtotal += preTax;
        taxAmount += total - preTax;
        return { ...l, taxRate, total, discount: 0 };
      });
      return prisma.jobCard.create({
        data: {
          tenantId: tyreTenant.id,
          branchId: tyreBranch.id,
          createdBy: tyreAdmin.id,
          technicianId: tyreAdmin.id,
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          ...jobData,
          lines: { create: lineRows }
        },
        include: { lines: true }
      });
    };
    await upsertJobCard({
      jobNumber: "DEMO-JC-001",
      customerId: kamal.id,
      customerVehicleId: kamalVeh.id,
      status: import_client.JobCardStatus.OPEN,
      odometer: 68420,
      complaintNotes: "Front tyres worn \u2014 replace all four",
      lines: [
        ...v205 ? [{ lineType: import_client.ServiceLineType.PART, description: "Michelin Primacy 205/55R16", quantity: 4, unitPrice: 42e3, variantId: v205.id }] : [],
        ...svcFit ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Tyre Fitting", quantity: 4, unitPrice: 1500, serviceCatalogId: svcFit.id }] : []
      ].filter((l) => l.quantity > 0)
    });
    await upsertJobCard({
      jobNumber: "DEMO-JC-002",
      customerId: nimal.id,
      customerVehicleId: nimalVeh.id,
      status: import_client.JobCardStatus.IN_PROGRESS,
      odometer: 45200,
      complaintNotes: "Vibration above 80 km/h",
      startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1e3),
      lines: [
        ...svcBal ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Wheel Balancing", quantity: 4, unitPrice: 2e3, serviceCatalogId: svcBal.id }] : [],
        ...svcAln ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Wheel Alignment", quantity: 1, unitPrice: 3500, serviceCatalogId: svcAln.id }] : []
      ]
    });
    await upsertJobCard({
      jobNumber: "DEMO-JC-003",
      customerId: kamal.id,
      customerVehicleId: kamalVeh.id,
      status: import_client.JobCardStatus.COMPLETED,
      appointmentId: aptCompleted.id,
      odometer: 68100,
      complaintNotes: "Replace rear tyres",
      afterNotes: "All tyres fitted and balanced. Alignment checked \u2014 within spec.",
      startedAt: lastWeek,
      completedAt: new Date(lastWeek.getTime() + 2 * 60 * 60 * 1e3),
      lines: [
        ...v205 ? [{ lineType: import_client.ServiceLineType.PART, description: "Michelin Primacy 205/55R16", quantity: 2, unitPrice: 42e3, variantId: v205.id }] : [],
        ...svcFit ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Tyre Fitting", quantity: 2, unitPrice: 1500, serviceCatalogId: svcFit.id }] : [],
        ...svcBal ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Wheel Balancing", quantity: 2, unitPrice: 2e3, serviceCatalogId: svcBal.id }] : []
      ]
    });
    await upsertJobCard({
      jobNumber: "DEMO-JC-004",
      customerId: fleetCo.id,
      customerVehicleId: fleetVeh1.id,
      status: import_client.JobCardStatus.WAITING_PARTS,
      odometer: 125800,
      complaintNotes: "Bulk tyre order for fleet van \u2014 awaiting stock",
      lines: [
        ...v195 ? [{ lineType: import_client.ServiceLineType.PART, description: "Michelin Primacy 195/65R15", quantity: 4, unitPrice: 38e3, variantId: v195.id }] : [],
        ...svcRot ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Tyre Rotation", quantity: 1, unitPrice: 2500, serviceCatalogId: svcRot.id }] : []
      ]
    });
    const jcInvoiced = await upsertJobCard({
      jobNumber: "DEMO-JC-005",
      customerId: fleetCo.id,
      customerVehicleId: fleetVeh2.id,
      status: import_client.JobCardStatus.INVOICED,
      odometer: 34200,
      complaintNotes: "Seasonal tyre change",
      afterNotes: "Completed and invoiced to fleet account.",
      completedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1e3),
      lines: [
        ...v195 ? [{ lineType: import_client.ServiceLineType.PART, description: "Michelin Primacy 195/65R15", quantity: 4, unitPrice: 38e3, variantId: v195.id }] : [],
        ...svcFit ? [{ lineType: import_client.ServiceLineType.SERVICE, description: "Tyre Fitting", quantity: 4, unitPrice: 1500, serviceCatalogId: svcFit.id }] : []
      ]
    });
    if (v205) {
      for (const [serial, dot] of [["TYR-SN-001", "2424"], ["TYR-SN-002", "2424"], ["TYR-SN-003", "2323"]]) {
        await prisma.tyreSerial.upsert({
          where: { tenantId_serialNumber: { tenantId: tyreTenant.id, serialNumber: serial } },
          update: { dotCode: dot },
          create: {
            tenantId: tyreTenant.id,
            variantId: v205.id,
            serialNumber: serial,
            dotCode: dot,
            branchId: tyreBranch.id,
            status: import_client.TyreSerialStatus.IN_STOCK,
            notes: "Demo stock unit"
          }
        });
      }
      await prisma.tyreSerial.upsert({
        where: { tenantId_serialNumber: { tenantId: tyreTenant.id, serialNumber: "TYR-SN-SOLD-001" } },
        update: {},
        create: {
          tenantId: tyreTenant.id,
          variantId: v205.id,
          serialNumber: "TYR-SN-SOLD-001",
          dotCode: "2424",
          branchId: tyreBranch.id,
          status: import_client.TyreSerialStatus.SOLD,
          notes: "Sold on demo job card"
        }
      });
    }
    const upsertReminder = async (customerId, customerVehicleId, scheduledFor, message, status, channel = import_client.ServiceReminderChannel.SMS) => {
      const existing = await prisma.serviceReminder.findFirst({
        where: { tenantId: tyreTenant.id, customerId, message }
      });
      if (existing) return existing;
      return prisma.serviceReminder.create({
        data: {
          tenantId: tyreTenant.id,
          customerId,
          customerVehicleId,
          reminderType: "SERVICE_DUE",
          channel,
          scheduledFor,
          message,
          status,
          sentAt: status === import_client.ServiceReminderStatus.SENT ? new Date(scheduledFor.getTime() - 36e5) : void 0
        }
      });
    };
    await upsertReminder(
      kamal.id,
      kamalVeh.id,
      tomorrow,
      "Hi Kamal, your wheel alignment is due tomorrow at 10:00 AM. Reply YES to confirm.",
      import_client.ServiceReminderStatus.PENDING
    );
    await upsertReminder(
      nimal.id,
      nimalVeh.id,
      nextWeek,
      "Reminder: Tyre fitting appointment on " + nextWeek.toLocaleDateString("en-LK") + " at 2:30 PM.",
      import_client.ServiceReminderStatus.PENDING,
      import_client.ServiceReminderChannel.WHATSAPP
    );
    await upsertReminder(
      fleetCo.id,
      fleetVeh1.id,
      lastWeek,
      "Lanka Fleet: Your van VAN-1001 service is complete. Invoice DEMO-INV-001 attached.",
      import_client.ServiceReminderStatus.SENT,
      import_client.ServiceReminderChannel.EMAIL
    );
    if (v215) {
      const quoteSent = await prisma.quotation.findUnique({
        where: { tenantId_quoteNumber: { tenantId: tyreTenant.id, quoteNumber: "DEMO-QUO-001" } }
      }) ?? await prisma.quotation.create({
        data: {
          tenantId: tyreTenant.id,
          branchId: tyreBranch.id,
          customerId: nimal.id,
          quoteNumber: "DEMO-QUO-001",
          status: import_client.QuotationStatus.SENT,
          createdBy: tyreAdmin.id,
          validUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1e3),
          notes: "4\xD7 Bridgestone Turanza 215/60R16 + fitting",
          subtotal: 192e3,
          taxAmount: 34560,
          total: 226560,
          items: {
            create: [{
              variantId: v215.id,
              quantity: 4,
              unitPrice: 48e3,
              taxRate: 18,
              total: 226560
            }]
          }
        }
      });
      void quoteSent;
      await prisma.quotation.findUnique({
        where: { tenantId_quoteNumber: { tenantId: tyreTenant.id, quoteNumber: "DEMO-QUO-002" } }
      }) ?? await prisma.quotation.create({
        data: {
          tenantId: tyreTenant.id,
          branchId: tyreBranch.id,
          customerId: sasha.id,
          quoteNumber: "DEMO-QUO-002",
          status: import_client.QuotationStatus.DRAFT,
          createdBy: tyreAdmin.id,
          notes: "Budget option \u2014 4\xD7 Michelin 195/65R15",
          subtotal: v195 ? 152e3 : 0,
          taxAmount: v195 ? 27360 : 0,
          total: v195 ? 179360 : 0,
          items: v195 ? {
            create: [{
              variantId: v195.id,
              quantity: 4,
              unitPrice: 38e3,
              taxRate: 18,
              total: 179360
            }]
          } : void 0
        }
      });
    }
    const existingSale = await prisma.sale.findUnique({
      where: { tenantId_invoiceNumber: { tenantId: tyreTenant.id, invoiceNumber: "DEMO-INV-001" } }
    });
    if (!existingSale && v195 && jcInvoiced) {
      const saleTotal = jcInvoiced.total;
      await prisma.sale.create({
        data: {
          tenantId: tyreTenant.id,
          branchId: tyreBranch.id,
          customerId: fleetCo.id,
          cashierId: tyreAdmin.id,
          invoiceNumber: "DEMO-INV-001",
          status: import_client.SaleStatus.COMPLETED,
          subtotal: jcInvoiced.subtotal,
          taxAmount: jcInvoiced.taxAmount,
          total: saleTotal,
          amountPaid: saleTotal,
          paymentMethod: import_client.PaymentMethod.CASH,
          paymentStatus: import_client.PaymentStatus.COMPLETED,
          notes: "Fleet van seasonal tyre change \u2014 linked to DEMO-JC-005",
          items: {
            create: [{
              variantId: v195.id,
              productName: "Michelin Primacy 4",
              variantName: "195/65R15 \xB7 All Season",
              sku: "TYR-MIC-1956515",
              quantity: 4,
              unitPrice: 38e3,
              costPrice: 28e3,
              taxRate: 18,
              taxAmount: 4 * 38e3 * 0.18,
              total: 4 * 38e3 * 1.18
            }]
          },
          payments: {
            create: [{ method: import_client.PaymentMethod.CASH, amount: saleTotal }]
          }
        }
      });
    }
    if (v205) {
      await prisma.warrantyClaim.findUnique({
        where: { tenantId_claimNumber: { tenantId: tyreTenant.id, claimNumber: "DEMO-WC-001" } }
      }) ?? await prisma.warrantyClaim.create({
        data: {
          tenantId: tyreTenant.id,
          customerId: kamal.id,
          variantId: v205.id,
          claimNumber: "DEMO-WC-001",
          status: import_client.WarrantyClaimStatus.PENDING,
          warrantyMonths: 24,
          purchaseDate: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1e3),
          issueDescription: "Premature sidewall crack on rear left tyre \u2014 DOT 2424"
        }
      });
    }
    console.log("\u2705 Tyre Shop demo data: customers, vehicles, job cards, appointments, quotes, sales, warranty");
  }
  console.log("\u2705 Tyre Shop demo: tyres.shop.hexalyte.com \u2014 admin@tyres.demo.fashionerp.com / Admin@123456");
  const generalProfile = getShopProfile(import_client.ShopType.GENERAL);
  const generalTenant = await prisma.tenant.upsert({
    where: { subdomain: "general" },
    update: { shopType: import_client.ShopType.GENERAL },
    create: {
      name: "Demo General Store",
      subdomain: "general",
      email: "admin@general.demo.fashionerp.com",
      shopType: import_client.ShopType.GENERAL,
      plan: import_client.SubscriptionPlan.PROFESSIONAL,
      status: import_client.TenantStatus.ACTIVE,
      currency: "LKR",
      country: "LK",
      timezone: "Asia/Colombo"
    }
  });
  const generalBranch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: generalTenant.id, code: "HO-001" } },
    update: {},
    create: {
      tenantId: generalTenant.id,
      name: "Main Store",
      code: "HO-001",
      isDefault: true,
      city: "Colombo"
    }
  });
  const generalAdminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: generalTenant.id, name: "Tenant Admin" } },
    update: {},
    create: { tenantId: generalTenant.id, name: "Tenant Admin", type: import_client.RoleType.TENANT_ADMIN, isSystem: true }
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: generalTenant.id, email: "admin@general.demo.fashionerp.com" } },
    update: { status: import_client.UserStatus.ACTIVE, emailVerified: true },
    create: {
      tenantId: generalTenant.id,
      branchId: generalBranch.id,
      email: "admin@general.demo.fashionerp.com",
      firstName: "General",
      lastName: "Admin",
      passwordHash,
      emailVerified: true,
      status: import_client.UserStatus.ACTIVE,
      roles: { create: [{ roleId: generalAdminRole.id }] }
    }
  });
  for (const name of generalProfile.defaultCategories) {
    await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: generalTenant.id, slug: slugifyCategory(name) } },
      update: {},
      create: { tenantId: generalTenant.id, name, slug: slugifyCategory(name) }
    });
  }
  await prisma.tenant.update({
    where: { id: generalTenant.id },
    data: {
      settings: {
        shopProfile: {
          type: generalProfile.type,
          defaultUnit: generalProfile.defaultUnit,
          units: generalProfile.units,
          modules: generalProfile.modules,
          labelTemplates: generalProfile.labelTemplates,
          variantAttributes: generalProfile.variantAttributes
        }
      }
    }
  });
  console.log("\u2705 General Shop demo: general.shop.hexalyte.com \u2014 admin@general.demo.fashionerp.com / Admin@123456");
  await prisma.user.updateMany({
    where: { emailVerified: true, status: import_client.UserStatus.PENDING_VERIFICATION },
    data: { status: import_client.UserStatus.ACTIVE }
  });
  console.log("\n\u{1F389} Seeding completed successfully!\n");
  console.log("Company admin (admin3.hexalyte.com):");
  console.log("  admin@hexalyte.com / Admin@123456");
  console.log("Shop login (shop.hexalyte.com):");
  console.log("  Clothing demo: admin@demo.fashionerp.com / Admin@123456");
  console.log("  Grocery demo:  admin@grocery.demo.fashionerp.com / Admin@123456 (subdomain: grocery)");
  console.log("  Hardware demo: admin@hardware.demo.fashionerp.com / Admin@123456 (subdomain: hardware)");
  console.log("  Agri demo:     admin@agri.demo.fashionerp.com / Admin@123456 (subdomain: agri)");
  console.log("  Spare Parts:   admin@spareparts.demo.fashionerp.com / Admin@123456 (subdomain: spareparts)");
  console.log("  Tyre Shop:     admin@tyres.demo.fashionerp.com / Admin@123456 (subdomain: tyres)");
  console.log("  General Shop:  admin@general.demo.fashionerp.com / Admin@123456 (subdomain: general)");
  console.log("  Cashier:       cashier@demo.fashionerp.com / Cashier@123456");
  console.log("  Branch Mgr:    manager@demo.fashionerp.com / Manager@123456");
  console.log("  Inv. Manager:  inventory@demo.fashionerp.com / Manager@123456");
  console.log("  Accountant:    accountant@demo.fashionerp.com / Manager@123456");
  console.log("  Purchasing:    purchasing@demo.fashionerp.com / Manager@123456");
}
main().catch((e) => {
  console.error("\u274C Seeding failed:", e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
