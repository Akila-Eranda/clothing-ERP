"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Star, Plus, Search, MoreHorizontal, Package, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DUMMY_BRANDS = [
  { id: "BR001", name: "FabricFusion", slug: "fabricfusion", products: 84, country: "India", website: "fabricfusion.in", isActive: true, isFeatured: true },
  { id: "BR002", name: "UrbanThread", slug: "urbanthread", products: 126, country: "India", website: "urbanthread.com", isActive: true, isFeatured: true },
  { id: "BR003", name: "DesiStyle", slug: "desistyle", products: 67, country: "India", website: null, isActive: true, isFeatured: false },
  { id: "BR004", name: "KhakiKraft", slug: "khakikraft", products: 43, country: "India", website: "khakikraft.com", isActive: true, isFeatured: false },
  { id: "BR005", name: "SilkRoute", slug: "silkroute", products: 92, country: "India", website: "silkroute.in", isActive: true, isFeatured: true },
  { id: "BR006", name: "CottonCloud", slug: "cottoncloud", products: 55, country: "India", website: null, isActive: false, isFeatured: false },
  { id: "BR007", name: "WeaveMaster", slug: "weavemaster", products: 38, country: "India", website: "weavemaster.co.in", isActive: true, isFeatured: false },
  { id: "BR008", name: "StitchStar", slug: "stitchstar", products: 71, country: "India", website: null, isActive: true, isFeatured: false },
];

const BRAND_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-yellow-600",
  "from-emerald-500 to-green-600",
  "from-orange-500 to-red-600",
  "from-teal-500 to-cyan-600",
  "from-indigo-500 to-blue-600",
];

export default function BrandsPage() {
  const [search, setSearch] = React.useState("");
  const filtered = DUMMY_BRANDS.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) || b.slug.includes(search.toLowerCase())
  );

  const activeCount = DUMMY_BRANDS.filter((b) => b.isActive).length;
  const totalProducts = DUMMY_BRANDS.reduce((s, b) => s + b.products, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage product brands and manufacturers</p>
        </div>
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" /> Add Brand
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Brands</p>
          <p className="text-2xl font-bold mt-1">{DUMMY_BRANDS.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-2xl font-bold mt-1 text-emerald-500">{activeCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Products</p>
          <p className="text-2xl font-bold mt-1 text-primary">{totalProducts}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search brands..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((brand, i) => (
          <motion.div
            key={brand.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow ${!brand.isActive ? "opacity-60" : ""}`}
          >
            {/* Brand header */}
            <div className={`h-16 bg-gradient-to-br ${BRAND_COLORS[i % BRAND_COLORS.length]} flex items-center justify-center relative`}>
              <span className="text-xl font-black text-white">{brand.name[0]}</span>
              {brand.isFeatured && (
                <div className="absolute top-2 right-2">
                  <Star className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300" />
                </div>
              )}
              {!brand.isActive && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white/80 text-xs font-bold">INACTIVE</span>
                </div>
              )}
            </div>

            <div className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{brand.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">/{brand.slug}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit Brand</DropdownMenuItem>
                    <DropdownMenuItem>View Products</DropdownMenuItem>
                    <DropdownMenuItem>{brand.isActive ? "Deactivate" : "Activate"}</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" /> {brand.products} products
                </span>
                {brand.website && (
                  <a href={`https://${brand.website}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors">
                    <Globe className="h-3 w-3" />
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Add new brand card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: filtered.length * 0.05 }}
          className="rounded-xl border-2 border-dashed border-border bg-card/50 flex flex-col items-center justify-center gap-2 p-6 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors min-h-[140px]"
        >
          <Plus className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Add Brand</p>
        </motion.div>
      </div>
    </div>
  );
}
