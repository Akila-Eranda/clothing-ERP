export const APP_NAME = "ShopERP";
export const APP_VERSION = "2.0.0";
export const APP_DESCRIPTION = "Multi-Shop ERP — Clothing, Grocery, Hardware & Agriculture";

export const CURRENCY = "LKR";
export const CURRENCY_SYMBOL = "LKR";
export const LOCALE = "en-LK";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const TAX_RATES = [
  { label: "No Tax (0%)", value: 0 },
  { label: "GST 5%", value: 5 },
  { label: "GST 12%", value: 12 },
  { label: "GST 18%", value: 18 },
  { label: "GST 28%", value: 28 },
];

export const SIZES = {
  clothing: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"],
  footwear: ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
  kids: ["0-3M", "3-6M", "6-12M", "1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y"],
  numeric: ["28", "30", "32", "34", "36", "38", "40", "42", "44"],
  free: ["Free Size"],
};

export const COLORS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#EF4444" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#10B981" },
  { name: "Yellow", hex: "#F59E0B" },
  { name: "Purple", hex: "#8B5CF6" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Orange", hex: "#F97316" },
  { name: "Brown", hex: "#92400E" },
  { name: "Grey", hex: "#6B7280" },
  { name: "Navy", hex: "#1E3A5F" },
  { name: "Maroon", hex: "#7F1D1D" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Beige", hex: "#D4A574" },
  { name: "Cream", hex: "#FFFDD0" },
];

export const PAYMENT_METHODS = [
  { label: "Cash", value: "cash", icon: "Banknote" },
  { label: "Card", value: "card", icon: "CreditCard" },
  { label: "UPI", value: "upi", icon: "Smartphone" },
  { label: "Bank Transfer", value: "bank_transfer", icon: "Building2" },
  { label: "Wallet", value: "wallet", icon: "Wallet" },
  { label: "Customer Credit", value: "credit", icon: "UserCheck" },
];

export const MEMBERSHIP_TIERS = {
  bronze: { label: "Bronze", minPoints: 0, discount: 2, color: "#CD7F32" },
  silver: { label: "Silver", minPoints: 1000, discount: 5, color: "#C0C0C0" },
  gold: { label: "Gold", minPoints: 5000, discount: 8, color: "#FFD700" },
  platinum: { label: "Platinum", minPoints: 15000, discount: 12, color: "#E5E4E2" },
};

export const LOYALTY_RATE = 1; // 1 point per LKR 1 spent
export const LOYALTY_REDEMPTION_RATE = 0.5; // LKR 0.5 per point

export const ORDER_STATUSES = [
  { label: "Pending", value: "pending", color: "amber" },
  { label: "Processing", value: "processing", color: "blue" },
  { label: "Completed", value: "completed", color: "emerald" },
  { label: "Cancelled", value: "cancelled", color: "red" },
  { label: "Refunded", value: "refunded", color: "purple" },
];

export const STOCK_ALERT_THRESHOLD = 10;

export const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Analytics", href: "/analytics", icon: "BarChart3" },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "POS Terminal", href: "/pos", icon: "ShoppingCart", highlight: true },
      { label: "Sales", href: "/sales", icon: "Receipt" },
      { label: "Returns", href: "/returns", icon: "RotateCcw" },
    ],
  },
  {
    group: "Products",
    items: [
      { label: "Products", href: "/products", icon: "Package" },
      { label: "Categories", href: "/categories", icon: "Tag" },
      { label: "Brands", href: "/brands", icon: "Star" },
      { label: "Inventory", href: "/inventory", icon: "Warehouse" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Customers", href: "/customers", icon: "Users" },
      { label: "Suppliers", href: "/suppliers", icon: "Truck" },
      { label: "Purchases", href: "/purchases", icon: "ShoppingBag" },
      { label: "HR & Payroll", href: "/hr", icon: "UserCog" },
    ],
  },
  {
    group: "Finance",
    items: [
      { label: "Accounting", href: "/accounting", icon: "BookOpen" },
      { label: "Expenses", href: "/expenses", icon: "TrendingDown" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "Branches", href: "/branches", icon: "Building2" },
      { label: "Reports", href: "/reports", icon: "FileBarChart" },
      { label: "Promotions", href: "/promotions", icon: "Zap" },
      { label: "Notifications", href: "/notifications", icon: "Bell" },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Settings", href: "/settings", icon: "Settings" },
      { label: "Users & Roles", href: "/users", icon: "Shield" },
    ],
  },
];

export const CHART_COLORS = {
  primary: "hsl(239, 84%, 67%)",
  secondary: "hsl(280, 65%, 60%)",
  success: "hsl(160, 60%, 45%)",
  warning: "hsl(30, 80%, 55%)",
  danger: "hsl(0, 72%, 51%)",
  info: "hsl(199, 89%, 48%)",
  chart1: "#6366f1",
  chart2: "#8b5cf6",
  chart3: "#06b6d4",
  chart4: "#10b981",
  chart5: "#f59e0b",
  chart6: "#ef4444",
};

export const DUMMY_REVENUE_DATA = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const base = 150000 + Math.random() * 100000;
  return {
    date: date.toLocaleDateString("en-LK", { day: "2-digit", month: "short" }),
    revenue: Math.round(base),
    profit: Math.round(base * 0.28),
    orders: Math.round(20 + Math.random() * 60),
  };
});

export const DUMMY_CATEGORY_DATA = [
  { category: "T-Shirts", revenue: 450000, percentage: 28, color: "#6366f1" },
  { category: "Jeans", revenue: 380000, percentage: 23, color: "#8b5cf6" },
  { category: "Dresses", revenue: 320000, percentage: 20, color: "#06b6d4" },
  { category: "Shirts", revenue: 250000, percentage: 16, color: "#10b981" },
  { category: "Footwear", revenue: 200000, percentage: 13, color: "#f59e0b" },
];

export const DUMMY_TOP_PRODUCTS = [
  { id: "1", name: "Premium Cotton T-Shirt", sku: "TSH-COT-M-BLK-1234", sold: 248, revenue: 123520, stock: 45, image: "" },
  { id: "2", name: "Slim Fit Denim Jeans", sku: "JNS-DEN-32-BLU-5678", sold: 186, revenue: 186000, stock: 23, image: "" },
  { id: "3", name: "Floral Summer Dress", sku: "DRS-FLR-M-MUL-9012", sold: 174, revenue: 139200, stock: 12, image: "" },
  { id: "4", name: "Oxford Formal Shirt", sku: "SHT-OXF-L-WHT-3456", sold: 156, revenue: 109200, stock: 34, image: "" },
  { id: "5", name: "Running Sports Shoes", sku: "SHO-RUN-9-BLK-7890", sold: 143, revenue: 214500, stock: 8, image: "" },
];

export const DUMMY_RECENT_SALES = [
  { id: "INV-001", customer: "Rahul Sharma", amount: 3450, items: 3, method: "upi", time: "2 min ago", status: "completed" },
  { id: "INV-002", customer: "Priya Singh", amount: 7800, items: 5, method: "card", time: "15 min ago", status: "completed" },
  { id: "INV-003", customer: "Walk-in", amount: 1200, items: 1, method: "cash", time: "28 min ago", status: "completed" },
  { id: "INV-004", customer: "Anita Kumar", amount: 12500, items: 7, method: "upi", time: "45 min ago", status: "completed" },
  { id: "INV-005", customer: "Suresh Patel", amount: 890, items: 1, method: "cash", time: "1h ago", status: "completed" },
  { id: "INV-006", customer: "Meera Nair", amount: 5600, items: 4, method: "card", time: "2h ago", status: "refunded" },
];

export const DUMMY_LOW_STOCK = [
  { id: "1", name: "Premium Cotton T-Shirt", variant: "M / Black", stock: 3, minStock: 10, sku: "TSH-COT-M-BLK" },
  { id: "2", name: "Running Sports Shoes", variant: "Size 9 / Black", stock: 2, minStock: 5, sku: "SHO-RUN-9-BLK" },
  { id: "3", name: "Floral Summer Dress", variant: "M / Multicolor", stock: 5, minStock: 8, sku: "DRS-FLR-M-MUL" },
  { id: "4", name: "Kids Cartoon Tee", variant: "5Y / Red", stock: 1, minStock: 10, sku: "TSH-KDS-5Y-RED" },
];

export const DUMMY_PRODUCTS = [
  {
    id: "1", name: "Premium Cotton T-Shirt", sku: "TSH-001", category: "T-Shirts", brand: "StylePro",
    price: 599, stock: 145, status: "active", image: "", variants: 12,
  },
  {
    id: "2", name: "Slim Fit Denim Jeans", sku: "JNS-001", category: "Jeans", brand: "DenimCo",
    price: 1299, stock: 87, status: "active", image: "", variants: 15,
  },
  {
    id: "3", name: "Floral Summer Dress", sku: "DRS-001", category: "Dresses", brand: "StylePro",
    price: 1899, stock: 34, status: "active", image: "", variants: 8,
  },
  {
    id: "4", name: "Oxford Formal Shirt", sku: "SHT-001", category: "Shirts", brand: "FormalEdge",
    price: 1499, stock: 56, status: "active", image: "", variants: 10,
  },
  {
    id: "5", name: "Running Sports Shoes", sku: "SHO-001", category: "Footwear", brand: "SportsFit",
    price: 2499, stock: 23, status: "active", image: "", variants: 7,
  },
  {
    id: "6", name: "Wool Winter Jacket", sku: "JKT-001", category: "Jackets", brand: "WinterWear",
    price: 3999, stock: 18, status: "active", image: "", variants: 6,
  },
  {
    id: "7", name: "Yoga Pants", sku: "PNT-001", category: "Activewear", brand: "SportsFit",
    price: 899, stock: 67, status: "active", image: "", variants: 9,
  },
  {
    id: "8", name: "Ethnic Kurta Set", sku: "KRT-001", category: "Ethnic", brand: "TraditionPlus",
    price: 2299, stock: 0, status: "out_of_stock", image: "", variants: 12,
  },
];

export const DUMMY_CUSTOMERS = [
  { id: "1", name: "Rahul Sharma", phone: "+91 98765 43210", email: "rahul@email.com", tier: "gold", points: 5820, spent: 58200, orders: 24, visits: 24, lastVisit: "2 days ago" },
  { id: "2", name: "Priya Singh", phone: "+91 87654 32109", email: "priya@email.com", tier: "platinum", points: 18400, spent: 184000, orders: 67, visits: 67, lastVisit: "Today" },
  { id: "3", name: "Anita Kumar", phone: "+91 76543 21098", email: "anita@email.com", tier: "silver", points: 2100, spent: 21000, orders: 12, visits: 12, lastVisit: "1 week ago" },
  { id: "4", name: "Suresh Patel", phone: "+91 65432 10987", email: "suresh@email.com", tier: "bronze", points: 450, spent: 4500, orders: 5, visits: 5, lastVisit: "1 month ago" },
  { id: "5", name: "Meera Nair", phone: "+91 54321 09876", email: "meera@email.com", tier: "gold", points: 7300, spent: 73000, orders: 31, visits: 31, lastVisit: "3 days ago" },
];
