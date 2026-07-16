// ============================================
// FASHION ERP - TYPE DEFINITIONS
// ============================================

export type UserRole = "super_admin" | "admin" | "manager" | "cashier" | "warehouse" | "hr";

export type PaymentMethod = "cash" | "card" | "upi" | "bank_transfer" | "wallet" | "credit";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type OrderStatus = "pending" | "processing" | "completed" | "cancelled" | "refunded";

export type PaymentStatus = "pending" | "paid" | "partial" | "overdue" | "refunded";

export type Gender = "male" | "female" | "unisex" | "kids";

export type Season = "spring" | "summer" | "autumn" | "winter" | "all_season";

// ============================================
// USER & AUTH
// ============================================
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  branchId?: string;
  branch?: Branch;
  permissions: string[];
  isActive: boolean;
  lastLogin?: Date;
  twoFactorEnabled: boolean;
  createdAt: Date;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ============================================
// TENANT & BRANCH
// ============================================
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "professional" | "enterprise";
  logo?: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  trialEndsAt?: Date;
  createdAt: Date;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email?: string;
  managerId?: string;
  isActive: boolean;
  createdAt: Date;
}

// ============================================
// PRODUCT & VARIANTS
// ============================================
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  image?: string;
  description?: string;
  isActive: boolean;
  productCount?: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  isActive: boolean;
  productCount?: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryId: string;
  category?: Category;
  brandId?: string;
  brand?: Brand;
  gender: Gender;
  season?: Season;
  tags: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary: boolean;
  variantId?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  size?: string;
  color?: string;
  material?: string;
  style?: string;
  costPrice: number;
  sellingPrice: number;
  mrp?: number;
  stock: number;
  minStock: number;
  maxStock?: number;
  weight?: number;
  images?: ProductImage[];
  isActive: boolean;
}

// ============================================
// INVENTORY
// ============================================
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  branchId?: string;
  branch?: Branch;
  address: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  variantId: string;
  variant?: ProductVariant;
  warehouseId: string;
  warehouse?: Warehouse;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  rack?: string;
  shelf?: string;
  lastUpdated: Date;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  variant?: ProductVariant;
  warehouseId: string;
  type: "purchase" | "sale" | "transfer" | "adjustment" | "return" | "damage";
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reference?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

export interface StockTransfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: "pending" | "approved" | "in_transit" | "completed" | "cancelled";
  items: StockTransferItem[];
  requestedBy: string;
  approvedBy?: string;
  notes?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface StockTransferItem {
  id: string;
  transferId: string;
  variantId: string;
  variant?: ProductVariant;
  requestedQuantity: number;
  transferredQuantity?: number;
}

// ============================================
// SALES & POS
// ============================================
export interface Sale {
  id: string;
  invoiceNumber: string;
  branchId: string;
  branch?: Branch;
  customerId?: string;
  customer?: Customer;
  cashierId: string;
  cashier?: User;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  payments: Payment[];
  status: OrderStatus;
  notes?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  createdAt: Date;
}

export interface SaleItem {
  id: string;
  saleId: string;
  variantId: string;
  variant?: ProductVariant;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface CartItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  image?: string;
  unitPrice: number;
  /** List / MRP price — used for “You saved” on receipts when above unitPrice */
  mrp?: number;
  quantity: number;
  discountAmount: number;
  discountType: "percentage" | "fixed";
  taxRate: number;
  stock: number;
}

export interface Payment {
  id: string;
  saleId?: string;
  purchaseId?: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  status: PaymentStatus;
  createdAt: Date;
}

// ============================================
// CUSTOMER & CRM
// ============================================
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  gender?: Gender;
  dateOfBirth?: Date;
  anniversary?: Date;
  loyaltyPoints: number;
  walletBalance?: number;
  totalPurchases: number;
  totalSpent: number;
  membershipTier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  creditLimit: number;
  outstandingBalance: number;
  referralCode?: string;
  referredBy?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  type: "earned" | "redeemed" | "expired" | "adjusted";
  points: number;
  reference?: string;
  notes?: string;
  expiresAt?: Date;
  createdAt: Date;
}

// ============================================
// SUPPLIER & PURCHASE
// ============================================
export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  gstNumber?: string;
  paymentTerms?: number;
  creditLimit?: number;
  outstandingBalance: number;
  totalPurchases: number;
  isActive: boolean;
  createdAt: Date;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplier?: Supplier;
  warehouseId: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  status: "draft" | "sent" | "confirmed" | "partial" | "completed" | "cancelled";
  expectedDate?: Date;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  variantId: string;
  variant?: ProductVariant;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxRate: number;
  total: number;
}

// ============================================
// EMPLOYEE & HR
// ============================================
export interface Employee {
  id: string;
  userId?: string;
  employeeCode: string;
  name: string;
  phone: string;
  email?: string;
  department: string;
  designation: string;
  branchId: string;
  branch?: Branch;
  joiningDate: Date;
  salary: number;
  commissionRate?: number;
  isActive: boolean;
  avatar?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employee?: Employee;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  status: "present" | "absent" | "half_day" | "late" | "on_leave";
  notes?: string;
}

// ============================================
// PROMOTION
// ============================================
export interface Promotion {
  id: string;
  name: string;
  code?: string;
  type: "percentage" | "fixed" | "bogo" | "free_item" | "happy_hour";
  value: number;
  minPurchase?: number;
  maxDiscount?: number;
  categoryIds?: string[];
  productIds?: string[];
  customerTiers?: string[];
  usageLimit?: number;
  usageCount: number;
  startDate: Date;
  endDate: Date;
  happyHourStart?: string;
  happyHourEnd?: string;
  isActive: boolean;
}

// ============================================
// NOTIFICATION
// ============================================
export interface Notification {
  id: string;
  type: "info" | "warning" | "error" | "success";
  category: "stock" | "sales" | "order" | "payment" | "system" | "hr";
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

// ============================================
// ANALYTICS & REPORTS
// ============================================
export interface DashboardStats {
  revenue: { today: number; yesterday: number; change: number };
  orders: { today: number; yesterday: number; change: number };
  customers: { today: number; yesterday: number; change: number };
  profit: { today: number; yesterday: number; change: number };
  avgOrderValue: { today: number; yesterday: number; change: number };
  stockValue: { total: number; change: number };
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface CategorySalesData {
  category: string;
  revenue: number;
  percentage: number;
  color: string;
}

export interface TopProduct {
  id: string;
  name: string;
  sku: string;
  image?: string;
  sold: number;
  revenue: number;
  stock: number;
}

// ============================================
// TABLE & PAGINATION
// ============================================
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SortState {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterState {
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  branchId?: string;
  categoryId?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  pagination?: PaginationState;
}

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}
