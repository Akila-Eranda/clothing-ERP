/** Shared Product type for list / detail flows */
export interface ProductVariantSummary {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  sellingPrice: number;
  costPrice: number;
  mrp: number;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  style?: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  shortDesc?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  hsn?: string | null;
  taxRate: number;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  status: string;
  images: string[];
  tags: string[];
  hasVariants: boolean;
  trackInventory: boolean;
  isFeatured: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug?: string } | null;
  brand?: { id: string; name: string; slug?: string } | null;
  _count?: { variants: number };
  variants?: ProductVariantSummary[];
}
