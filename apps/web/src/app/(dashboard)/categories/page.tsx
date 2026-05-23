"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Tag, Plus, Search, MoreHorizontal, Package, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DUMMY_CATEGORIES = [
  { id: "C001", name: "Men's Wear", slug: "mens-wear", products: 124, image: null, parent: null, subcategories: ["T-Shirts", "Jeans", "Formal Shirts", "Shorts"] },
  { id: "C002", name: "Women's Wear", slug: "womens-wear", products: 186, image: null, parent: null, subcategories: ["Tops", "Sarees", "Kurtis", "Dresses"] },
  { id: "C003", name: "Kids' Wear", slug: "kids-wear", products: 72, image: null, parent: null, subcategories: ["Boys", "Girls", "Infants"] },
  { id: "C004", name: "Accessories", slug: "accessories", products: 54, image: null, parent: null, subcategories: ["Belts", "Wallets", "Bags", "Scarves"] },
  { id: "C005", name: "Footwear", slug: "footwear", products: 38, image: null, parent: null, subcategories: ["Casual", "Formal", "Sports"] },
  { id: "C006", name: "Ethnic Wear", slug: "ethnic-wear", products: 93, image: null, parent: null, subcategories: ["Kurtas", "Sherwanis", "Lehengas"] },
];

const COLORS = ["from-blue-500 to-indigo-600", "from-pink-500 to-rose-600", "from-amber-500 to-orange-600", "from-emerald-500 to-teal-600", "from-purple-500 to-violet-600", "from-cyan-500 to-blue-600"];

export default function CategoriesPage() {
  const [search, setSearch] = React.useState("");
  const filtered = DUMMY_CATEGORIES.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize products into categories and subcategories</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Category
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search categories..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className={`h-20 bg-gradient-to-br ${COLORS[i % COLORS.length]} flex items-center justify-center`}>
              <Tag className="h-8 w-8 text-white/80" />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{cat.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">/{cat.slug}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>Add Subcategory</DropdownMenuItem>
                    <DropdownMenuItem>View Products</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-1.5 mt-3">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{cat.products} products</span>
              </div>

              <div className="mt-3 pt-3 border-t flex flex-wrap gap-1">
                {cat.subcategories.slice(0, 3).map((sub) => (
                  <span key={sub} className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">{sub}</span>
                ))}
                {cat.subcategories.length > 3 && (
                  <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">+{cat.subcategories.length - 3}</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: filtered.length * 0.07 }}
          className="rounded-xl border-2 border-dashed border-border bg-card/50 flex flex-col items-center justify-center gap-2 p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors min-h-[180px]"
        >
          <Plus className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">New Category</p>
        </motion.div>
      </div>
    </div>
  );
}
