"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, User, Tag, Receipt,
  Banknote, CreditCard, Smartphone, Wallet, PauseCircle,
  PlayCircle, Package, X, Check, Barcode, Loader2,
  Clock, Star, RefreshCw, CheckCircle2, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCartStore } from "@/stores/cart-store";
import { formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────
interface ProductItem {
  inventoryId: string; variantId: string;
  productName: string; variantName: string; sku: string;
  unitPrice: number; costPrice: number; stock: number;
  category: string; color?: string; size?: string;
}
interface CustomerItem {
  id: string; name: string; phone: string;
  tier?: string; loyaltyPoints: number; walletBalance: number;
}
interface SaleReceipt {
  invoiceNumber: string; total: number; changeDue: number;
  paymentMethod: string; customerName?: string;
}

const PAY_METHODS = [
  { value: "CASH", label: "Cash",  icon: Banknote },
  { value: "CARD", label: "Card",  icon: CreditCard },
  { value: "UPI",  label: "UPI",   icon: Smartphone },
  { value: "WALLET", label: "Wallet", icon: Wallet },
];

export default function POSPage() {
  // ── Products state ──────────────────────────────────────────────────────
  const [products, setProducts]         = React.useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(true);
  const [categories, setCategories]     = React.useState<string[]>(["All"]);
  const [search, setSearch]             = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("All");

  // ── Customer state ──────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [customers, setCustomers]       = React.useState<CustomerItem[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = React.useState(false);

  // ── Checkout state ──────────────────────────────────────────────────────
  const [activePayment, setActivePayment] = React.useState("CASH");
  const [cashTendered, setCashTendered] = React.useState("");
  const [showCheckout, setShowCheckout] = React.useState(false);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [receipt, setReceipt]           = React.useState<SaleReceipt | null>(null);

  const searchRef = React.useRef<HTMLInputElement>(null);

  const {
    items, customer, discount, taxRate,
    addItem, updateQuantity, setCustomer, setDiscount,
    clearCart, holdBill, heldBills, restoreHeldBill,
    subtotal, discountAmount, taxAmount, total, itemCount,
  } = useCartStore();

  // ── Load products ───────────────────────────────────────────────────────
  const loadProducts = React.useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await api.get<{ data: unknown[] }>("/inventory?limit=500");
      const raw = (res.data?.data ?? res.data ?? []) as Record<string, unknown>[];
      const mapped: ProductItem[] = raw.map((inv) => {
        const v = inv.variant as Record<string, unknown>;
        const p = v?.product as Record<string, unknown>;
        const cat = (p?.category as Record<string, unknown>)?.name as string ?? "Other";
        return {
          inventoryId: inv.id as string,
          variantId: v?.id as string ?? "",
          productName: p?.name as string ?? "",
          variantName: v?.name as string ?? "",
          sku: v?.sku as string ?? "",
          unitPrice: v?.sellingPrice as number ?? 0,
          costPrice: v?.costPrice as number ?? 0,
          stock: inv.quantity as number ?? 0,
          category: cat,
          color: v?.color as string | undefined,
          size: v?.size as string | undefined,
        };
      });
      setProducts(mapped);
      const cats = ["All", ...Array.from(new Set(mapped.map((p) => p.category).filter(Boolean)))];
      setCategories(cats);
    } catch { toast.error("Failed to load products"); }
    finally { setProductsLoading(false); }
  }, []);

  React.useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Customer search ─────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await api.get<{ data: CustomerItem[] }>(`/customers?search=${encodeURIComponent(customerSearch)}&limit=10`);
        setCustomers((res.data?.data ?? res.data ?? []) as CustomerItem[]);
      } catch { /* silent */ }
      finally { setCustomerLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F2") setShowCheckout(true);
      if (e.key === "Escape") { setShowCheckout(false); setShowCustomerSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────
  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.variantName.toLowerCase().includes(q);
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    return matchSearch && matchCat;
  });

  const totalAmt = total();
  const change = cashTendered ? Math.max(0, parseFloat(cashTendered) - totalAmt) : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAddProduct = (p: ProductItem) => {
    if (p.stock <= 0) { toast.error("Out of stock"); return; }
    addItem({
      variantId: p.variantId, productName: p.productName,
      variantName: p.variantName, sku: p.sku,
      unitPrice: p.unitPrice, quantity: 1, stock: p.stock,
      discountAmount: 0, discountType: "percentage", taxRate: 0,
    });
    toast.success(`${p.productName} added`, { duration: 1200 });
  };

  const handleCheckout = async () => {
    if (!items.length) return;
    if (activePayment === "CASH" && cashTendered && parseFloat(cashTendered) < totalAmt) {
      toast.error("Cash tendered is less than total"); return;
    }
    setCheckoutLoading(true);
    try {
      const productMap = new Map(products.map((p) => [p.variantId, p]));
      const payload = {
        customerId: customer?.id,
        items: items.map((item) => ({
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: productMap.get(item.variantId)?.costPrice ?? 0,
          discount: item.discountAmount ?? 0,
          discountType: item.discountType === "percentage" ? "PERCENTAGE" : "FIXED",
          taxRate: item.taxRate ?? 0,
        })),
        payments: [{ method: activePayment, amount: activePayment === "CASH" && cashTendered ? parseFloat(cashTendered) : totalAmt }],
        discountAmount: discountAmount(),
        notes: "",
      };
      const res = await api.post<{ invoiceNumber: string; total: number; changeDue: number }>("/pos/sale", payload);
      const sale = res.data;
      setReceipt({
        invoiceNumber: sale.invoiceNumber,
        total: sale.total,
        changeDue: sale.changeDue ?? change,
        paymentMethod: activePayment,
        customerName: customer?.name,
      });
      clearCart();
      setShowCheckout(false);
      setCashTendered("");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Checkout failed");
    } finally { setCheckoutLoading(false); }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left: Product catalog ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="p-4 border-b border-border space-y-3 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={searchRef} placeholder="Search products by name or SKU... (Ctrl+F)"
                className="pl-9 h-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" onClick={loadProducts} className="shrink-0 h-10 w-10">
              <RefreshCw className={`h-4 w-4 ${productsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-1.5 pb-1">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>{cat}</button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <ScrollArea className="flex-1">
          {productsLoading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => (
                <motion.button key={product.variantId} whileTap={{ scale: 0.97 }}
                  onClick={() => handleAddProduct(product)}
                  disabled={product.stock <= 0}
                  className={`group relative rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md hover:border-primary/30 ${
                    product.stock <= 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}>
                  <div className="aspect-square rounded-lg bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-2">
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs font-semibold leading-tight line-clamp-2 mb-0.5">{product.productName}</p>
                  {product.variantName && <p className="text-[10px] text-muted-foreground mb-0.5">{product.variantName}</p>}
                  <p className="text-[10px] text-muted-foreground font-mono">{product.sku}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-primary">₹{formatNumber(product.unitPrice)}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      product.stock === 0 ? "bg-red-500/15 text-red-500" :
                      product.stock < 5 ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
                    }`}>{product.stock === 0 ? "Out" : product.stock}</span>
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: Cart ── */}
      <div className="w-[380px] flex flex-col bg-background shrink-0 relative">
        {/* Cart header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-semibold">Cart</span>
            {itemCount() > 0 && (
              <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">{itemCount()}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {heldBills.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => restoreHeldBill(heldBills[0].id)}>
                <PlayCircle className="h-3.5 w-3.5" />{heldBills.length} held
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={holdBill} disabled={items.length === 0}>
              <PauseCircle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={clearCart} disabled={items.length === 0} className="text-destructive hover:text-destructive">
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
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0" onClick={() => setCustomer(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button onClick={() => setShowCustomerSearch(true)}
              className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground">
              <User className="h-4 w-4" /><span className="text-sm">Add Customer</span>
            </button>
          )}
        </div>

        {/* Customer search overlay */}
        <AnimatePresence>
          {showCustomerSearch && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-background flex flex-col border-l border-border">
              <div className="flex items-center gap-2 p-4 border-b border-border">
                <Input autoFocus placeholder="Search by name or phone…" value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)} className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => { setShowCustomerSearch(false); setCustomerSearch(""); setCustomers([]); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {customerLoading && (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  )}
                  {!customerLoading && customers.length === 0 && customerSearch && (
                    <p className="text-center text-sm text-muted-foreground py-8">No customers found</p>
                  )}
                  {!customerLoading && customers.map((c) => (
                    <button key={c.id}
                      onClick={() => {
                        setCustomer({ id: c.id, name: c.name, phone: c.phone, email: undefined,
                          membershipTier: (c.tier as string | undefined)?.toLowerCase() as "bronze" | undefined ?? "bronze",
                          loyaltyPoints: c.loyaltyPoints,
                          totalPurchases: 0, totalSpent: 0, creditLimit: 0, outstandingBalance: 0,
                          isActive: true, createdAt: new Date(),
                        });
                        setShowCustomerSearch(false); setCustomerSearch(""); setCustomers([]);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                        {c.name?.[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold capitalize text-amber-500">{c.tier}</p>
                        <p className="text-[10px] text-muted-foreground">{c.loyaltyPoints} pts</p>
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
                  <motion.div key={item.variantId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold line-clamp-1">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.variantName}</p>
                      <p className="text-xs font-bold text-primary mt-0.5">₹{formatNumber(item.unitPrice * item.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="h-6 w-6 rounded-md bg-background border border-border flex items-center justify-center hover:bg-muted transition-colors">
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
              <Input placeholder="Discount %" className="h-7 text-xs flex-1" type="number"
                value={discount || ""} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0, "percentage")} />
              <span className="text-xs text-muted-foreground shrink-0">%</span>
            </div>
          </div>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div className="px-4 py-3 space-y-1.5 border-t border-border bg-muted/20">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>₹{formatNumber(subtotal())}</span></div>
            {discountAmount() > 0 && <div className="flex justify-between text-sm text-emerald-500"><span>Discount</span><span>-₹{formatNumber(discountAmount())}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST ({taxRate}%)</span><span>₹{formatNumber(taxAmount())}</span></div>
            <Separator />
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-primary">₹{formatNumber(totalAmt)}</span></div>
          </div>
        )}

        {/* Checkout */}
        <div className="p-4 space-y-2 border-t border-border">
          {!showCheckout ? (
            <Button className="w-full h-12 text-base font-bold gap-2" disabled={items.length === 0} onClick={() => setShowCheckout(true)}>
              <Receipt className="h-5 w-5" />Checkout — ₹{items.length > 0 ? formatNumber(totalAmt) : "0"}
              <kbd className="ml-auto text-xs opacity-70 font-mono">F2</kbd>
            </Button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="grid grid-cols-4 gap-1.5">
                {PAY_METHODS.map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => setActivePayment(value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                      activePayment === value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                    }`}>
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
              {activePayment === "CASH" && (
                <div className="space-y-2">
                  <Input placeholder="Cash tendered" type="number" value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="text-center font-mono text-base h-10" autoFocus />
                  <div className="grid grid-cols-4 gap-1">
                    {[500, 1000, 2000, Math.ceil(totalAmt / 100) * 100].map((amt) => (
                      <button key={amt} onClick={() => setCashTendered(String(amt))}
                        className="py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 font-mono font-medium">
                        ₹{formatNumber(amt)}
                      </button>
                    ))}
                  </div>
                  {cashTendered && parseFloat(cashTendered) >= totalAmt && (
                    <div className="flex justify-between text-sm p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-emerald-600 font-medium">Change</span>
                      <span className="text-emerald-600 font-bold">₹{formatNumber(change)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckout(false)} disabled={checkoutLoading}>Cancel</Button>
                <Button className="flex-1 gap-1.5 font-bold" onClick={handleCheckout} disabled={checkoutLoading}>
                  {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Confirm
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Receipt modal ── */}
      <AnimatePresence>
        {receipt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-background rounded-2xl shadow-2xl border w-full max-w-sm p-6 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Sale Complete!</h2>
                <p className="text-sm text-muted-foreground font-mono mt-1">{receipt.invoiceNumber}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2 text-sm text-left">
                {receipt.customerName && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{receipt.customerName}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-medium capitalize">{receipt.paymentMethod.toLowerCase()}</span></div>
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">₹{formatNumber(receipt.total)}</span></div>
                {receipt.changeDue > 0 && (
                  <div className="flex justify-between text-emerald-500"><span>Change</span><span className="font-bold">₹{formatNumber(receipt.changeDue)}</span></div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => setReceipt(null)}>
                  <Printer className="h-4 w-4" />Print
                </Button>
                <Button className="flex-1" onClick={() => setReceipt(null)}>New Sale</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
