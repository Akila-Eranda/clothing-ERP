"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, User, Tag, Receipt,
  Banknote, CreditCard, Smartphone, Wallet, RotateCcw, PauseCircle,
  PlayCircle, Package, Zap, ChevronDown, X, Check, Barcode,
  Calculator, Clock, Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCartStore } from "@/stores/cart-store";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { DUMMY_PRODUCTS, DUMMY_CUSTOMERS, PAYMENT_METHODS } from "@/lib/constants";

const QUICK_CATEGORIES = ["All", "T-Shirts", "Jeans", "Dresses", "Shirts", "Footwear", "Jackets", "Activewear", "Ethnic"];

export default function POSPage() {
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("All");
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [showCustomerSearch, setShowCustomerSearch] = React.useState(false);
  const [activePayment, setActivePayment] = React.useState("cash");
  const [cashTendered, setCashTendered] = React.useState("");
  const [showCheckout, setShowCheckout] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const {
    items, customer, discount, taxRate,
    addItem, removeItem, updateQuantity, setCustomer, setDiscount,
    clearCart, holdBill, heldBills, restoreHeldBill,
    subtotal, discountAmount, taxAmount, total, itemCount,
  } = useCartStore();

  const filteredProducts = DUMMY_PRODUCTS.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomers = DUMMY_CUSTOMERS.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  );

  const change = cashTendered ? Math.max(0, parseFloat(cashTendered) - total()) : 0;

  const handleQuickAmount = (amount: number) => {
    setCashTendered(String(amount));
  };

  const handleCheckout = () => {
    toast.success(`Sale completed! ₹${formatNumber(total())} charged via ${activePayment.toUpperCase()}`, {
      description: `Invoice #INV-${Date.now().toString().slice(-6)}`,
    });
    clearCart();
    setShowCheckout(false);
    setCashTendered("");
  };

  const handleAddProduct = (product: typeof DUMMY_PRODUCTS[0]) => {
    if (product.status === "out_of_stock") {
      toast.error("Product is out of stock");
      return;
    }
    addItem({
      variantId: product.id,
      productName: product.name,
      variantName: `${product.name}`,
      sku: product.sku,
      unitPrice: product.price,
      quantity: 1,
      stock: product.stock,
      image: product.image,
      discountAmount: 0,
      discountType: "percentage",
      taxRate: 0,
    });
    toast.success(`${product.name} added to cart`, { duration: 1500 });
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "F2") setShowCheckout(true);
      if (e.key === "Escape") {
        setShowCheckout(false);
        setShowCustomerSearch(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: Product catalog */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Search & category bar */}
        <div className="p-4 border-b border-border space-y-3 bg-background/50 backdrop-blur-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search products by name or SKU... (Ctrl+F)"
              className="pl-9 pr-24 h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                Ctrl+F
              </kbd>
              <Button variant="ghost" size="icon-sm" className="h-6 w-6">
                <Barcode className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 pb-1">
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAddProduct(product)}
                disabled={product.status === "out_of_stock"}
                className={`pos-key group relative rounded-xl border bg-card p-3 text-left transition-all duration-200 hover:shadow-md hover:border-primary/30 ${
                  product.status === "out_of_stock"
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <div className="aspect-square rounded-lg bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-2 overflow-hidden">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 mb-1">
                  {product.name}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-bold text-primary">₹{formatNumber(product.price)}</span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      product.stock === 0
                        ? "bg-red-500/15 text-red-500"
                        : product.stock < 10
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-emerald-500/15 text-emerald-500"
                    }`}
                  >
                    {product.stock === 0 ? "Out" : `${product.stock}`}
                  </span>
                </div>
                <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Cart */}
      <div className="w-[380px] flex flex-col bg-background shrink-0">
        {/* Cart header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-semibold">Cart</span>
            {itemCount() > 0 && (
              <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {itemCount()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {heldBills.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => restoreHeldBill(heldBills[0].id)}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {heldBills.length} held
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={holdBill}
              disabled={items.length === 0}
            >
              <PauseCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearCart}
              disabled={items.length === 0}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Customer selector */}
        <div className="px-4 py-2 border-b border-border">
          {customer ? (
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{customer.name}</p>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] text-muted-foreground capitalize">{customer.membershipTier}</span>
                    <span className="text-[10px] text-muted-foreground">· {customer.loyaltyPoints} pts</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 shrink-0"
                onClick={() => setCustomer(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomerSearch(true)}
              className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground"
            >
              <User className="h-4 w-4" />
              <span className="text-sm">Add Customer</span>
            </button>
          )}
        </div>

        {/* Customer search overlay */}
        <AnimatePresence>
          {showCustomerSearch && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 right-0 top-0 bottom-0 z-50 bg-background flex flex-col"
              style={{ width: 380, right: 0, left: "auto" }}
            >
              <div className="flex items-center gap-2 p-4 border-b border-border">
                <Input
                  autoFocus
                  placeholder="Search customer by name or phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCustomerSearch(false);
                    setCustomerSearch("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomer({
                          ...c,
                          membershipTier: c.tier as any,
                          loyaltyPoints: c.points,
                          totalPurchases: c.spent,
                          totalSpent: c.spent,
                          creditLimit: 0,
                          outstandingBalance: 0,
                          isActive: true,
                          createdAt: new Date(),
                        });
                        setShowCustomerSearch(false);
                        setCustomerSearch("");
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                        {c.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold capitalize text-amber-500">{c.tier}</p>
                        <p className="text-[10px] text-muted-foreground">{c.points} pts</p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cart items */}
        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="text-xs mt-1">Click products to add them</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.div
                    key={item.variantId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold line-clamp-1">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                      <p className="text-xs font-bold text-primary mt-0.5">
                        ₹{formatNumber(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>

        {/* Discount */}
        {items.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Discount % or ₹ amount"
                className="h-7 text-xs flex-1"
                type="number"
                value={discount || ""}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0, "percentage")}
              />
              <span className="text-xs text-muted-foreground shrink-0">%</span>
            </div>
          </div>
        )}

        {/* Order summary */}
        {items.length > 0 && (
          <div className="px-4 py-3 space-y-2 border-t border-border bg-muted/20">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{formatNumber(subtotal())}</span>
            </div>
            {discountAmount() > 0 && (
              <div className="flex justify-between text-sm text-emerald-500">
                <span>Discount</span>
                <span>-₹{formatNumber(discountAmount())}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST ({taxRate}%)</span>
              <span>₹{formatNumber(taxAmount())}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">₹{formatNumber(total())}</span>
            </div>
          </div>
        )}

        {/* Checkout */}
        <div className="p-4 space-y-2 border-t border-border">
          {!showCheckout ? (
            <Button
              className="w-full h-12 text-base font-bold gap-2"
              variant="gradient"
              disabled={items.length === 0}
              onClick={() => setShowCheckout(true)}
            >
              <Receipt className="h-5 w-5" />
              Checkout — ₹{items.length > 0 ? formatNumber(total()) : "0"}
              <kbd className="ml-auto text-xs opacity-70 font-mono">F2</kbd>
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* Payment methods */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.slice(0, 3).map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setActivePayment(method.value)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                      activePayment === method.value
                        ? "bg-primary text-primary-foreground border-primary shadow-glow"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {method.value === "cash" && <Banknote className="h-4 w-4" />}
                    {method.value === "card" && <CreditCard className="h-4 w-4" />}
                    {method.value === "upi" && <Smartphone className="h-4 w-4" />}
                    {method.label}
                  </button>
                ))}
              </div>

              {/* Cash tendered */}
              {activePayment === "cash" && (
                <div className="space-y-2">
                  <Input
                    placeholder="Cash tendered"
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="text-center font-mono text-base h-10"
                  />
                  <div className="grid grid-cols-4 gap-1">
                    {[500, 1000, 2000, Math.ceil(total() / 100) * 100].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => handleQuickAmount(amt)}
                        className="py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 font-mono font-medium transition-colors"
                      >
                        ₹{formatNumber(amt)}
                      </button>
                    ))}
                  </div>
                  {cashTendered && parseFloat(cashTendered) >= total() && (
                    <div className="flex justify-between text-sm p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-emerald-600 font-medium">Change</span>
                      <span className="text-emerald-600 font-bold">₹{formatNumber(change)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCheckout(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="gradient"
                  className="flex-2 flex-1 gap-1.5 font-bold"
                  onClick={handleCheckout}
                >
                  <Check className="h-4 w-4" />
                  Confirm
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
