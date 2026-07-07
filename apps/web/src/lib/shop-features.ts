/** Marketing + capability matrix per shop vertical */

import { ShopType } from '@/lib/shop-profiles';

export interface ShopFeature {
  label: string;
  live: boolean;
}

export const COMMON_FEATURES: ShopFeature[] = [
  { label: 'Dashboard Analytics', live: true },
  { label: 'POS Billing', live: true },
  { label: 'Inventory Management', live: true },
  { label: 'Customer Management (CRM)', live: true },
  { label: 'Supplier Management', live: true },
  { label: 'Purchases & GRN', live: true },
  { label: 'Expenses Management', live: true },
  { label: 'Accounts Module', live: true },
  { label: 'SMS Notifications', live: true },
  { label: 'WhatsApp Integration', live: false },
  { label: 'Multi-User Access', live: true },
  { label: 'Role & Permission Management', live: true },
  { label: 'Mobile App', live: false },
  { label: 'Cloud Backup', live: true },
  { label: 'Barcode & QR Code Support', live: true },
];

export const VERTICAL_FEATURES: Record<ShopType, ShopFeature[]> = {
  [ShopType.CLOTHING]: [
    { label: 'POS Billing', live: true },
    { label: 'Barcode Scanning', live: true },
    { label: 'Size Management (S, M, L, XL)', live: true },
    { label: 'Color Management', live: true },
    { label: 'Brand Management', live: true },
    { label: 'Stock Management', live: true },
    { label: 'Customer Loyalty Points', live: true },
    { label: 'Exchange & Return Management', live: true },
    { label: 'Discount & Promotions', live: true },
    { label: 'Sales Reports', live: true },
  ],
  [ShopType.GROCERY]: [
    { label: 'Fast POS Billing', live: true },
    { label: 'Barcode Scanner Support', live: true },
    { label: 'Expiry Date Management', live: true },
    { label: 'Batch Number Tracking', live: true },
    { label: 'Supplier Management', live: true },
    { label: 'Purchase Management', live: true },
    { label: 'Stock Alerts', live: true },
    { label: 'Daily Sales Reports', live: true },
    { label: 'Profit Analysis', live: true },
    { label: 'Customer Credit Management', live: true },
  ],
  [ShopType.HARDWARE]: [
    { label: 'Item Management', live: true },
    { label: 'Unit Management (Kg, Feet, Meter, Piece)', live: true },
    { label: 'Purchase Orders', live: true },
    { label: 'Supplier Management', live: true },
    { label: 'Inventory Control', live: true },
    { label: 'Quotation Management', live: false },
    { label: 'Customer Credit Tracking', live: true },
    { label: 'Delivery Notes', live: false },
    { label: 'GRN Management', live: true },
    { label: 'Sales & Profit Reports', live: true },
  ],
  [ShopType.AGRICULTURE]: [
    { label: 'Fertilizer Management', live: true },
    { label: 'Agro Chemical Management', live: true },
    { label: 'Seed Management', live: true },
    { label: 'Batch Tracking', live: true },
    { label: 'Expiry Date Tracking', live: true },
    { label: 'Customer Management', live: true },
    { label: 'Farmer Credit Management', live: true },
    { label: 'Supplier Management', live: true },
    { label: 'Purchase & Sales Management', live: true },
    { label: 'Stock Alerts', live: true },
    { label: 'Sales Reports', live: true },
  ],
  [ShopType.SPARE_PARTS]: [
    { label: 'Vehicle Compatibility Mapping', live: true },
    { label: 'VIN / Chassis Search', live: true },
    { label: 'OEM & Part Number Tracking', live: true },
    { label: 'Warranty Management', live: true },
    { label: 'Quotation Management', live: true },
    { label: 'Barcode & QR Scanning', live: true },
    { label: 'Multi-Branch & Stock Transfer', live: true },
    { label: 'Customer Vehicle Records', live: true },
    { label: 'Credit Sales & Receivables', live: true },
    { label: 'Purchase Orders & GRN', live: true },
    { label: 'Low Stock & Reorder Alerts', live: true },
    { label: 'Sales & Profit Reports', live: true },
  ],
  [ShopType.TIRE_SHOP]: [
    { label: 'Tyre Size Variants (205/55R16)', live: true },
    { label: 'Vehicle Fitment Lookup', live: true },
    { label: 'Load Index & Speed Rating', live: true },
    { label: 'Tube / Tubeless Tracking', live: true },
    { label: 'DOT Batch on GRN & Labels', live: true },
    { label: 'Premium Tyre Serial Numbers', live: true },
    { label: 'Workshop Services (Fitting, Balancing)', live: true },
    { label: 'Job Cards & Technician Assignment', live: true },
    { label: 'Appointment Booking', live: true },
    { label: 'Service Reminders (SMS/WhatsApp)', live: true },
    { label: 'Fleet Customer Management', live: true },
    { label: 'Warranty & Fleet Quotations', live: true },
    { label: 'Best Selling Brand Reports', live: true },
    { label: 'Service Revenue & Tech Performance', live: true },
  ],
  [ShopType.GENERAL]: [
    { label: 'Mixed Product Catalog', live: true },
    { label: 'Barcode & QR POS Scanning', live: true },
    { label: 'Size / Variant Options', live: true },
    { label: 'Brand Management', live: true },
    { label: 'Customer Loyalty Points', live: true },
    { label: 'Returns & Exchanges', live: true },
    { label: 'Promotions & Discounts', live: true },
    { label: 'Quotations for Bulk Orders', live: true },
    { label: 'Multi-Branch Inventory', live: true },
    { label: 'Purchase Orders & GRN', live: true },
    { label: 'Sales & Profit Reports', live: true },
  ],
};

export function getVerticalFeatures(type: ShopType): ShopFeature[] {
  return VERTICAL_FEATURES[type] ?? VERTICAL_FEATURES[ShopType.CLOTHING];
}

export function getAllFeaturesForShop(type: ShopType): { vertical: ShopFeature[]; common: ShopFeature[] } {
  return { vertical: getVerticalFeatures(type), common: COMMON_FEATURES };
}
