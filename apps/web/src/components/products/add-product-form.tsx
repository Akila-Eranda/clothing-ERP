"use client";

import { useShopProfile, isGroceryShop } from "@/lib/use-shop-profile";
import { GroceryProductForm, type EmbeddedProductFormProps } from "@/components/products/grocery-product-form";
import { StandardAddProductPage } from "@/components/products/standard-product-form";

export type { EmbeddedProductFormProps, CreatedProduct } from "@/components/products/grocery-product-form";

/** Full product create form for the current shop type (standalone page or embedded in a popup). */
export function AddProductForm({ embedded }: { embedded?: EmbeddedProductFormProps }) {
  const shopProfile = useShopProfile();
  if (isGroceryShop(shopProfile)) return <GroceryProductForm embedded={embedded} />;
  return <StandardAddProductPage embedded={embedded} />;
}
