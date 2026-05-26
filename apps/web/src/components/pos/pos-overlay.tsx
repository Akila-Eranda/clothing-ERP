"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, User, Tag, Receipt,
  Banknote, CreditCard, Smartphone, Wallet, PauseCircle, PlayCircle,
  Package, X, Check, Loader2, Star, RefreshCw, CheckCircle2,
  Printer, ChevronRight, Clock, Percent, Delete, Keyboard,
  Scan, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ProductItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  costPrice: number;
  stock: number;
  category: string;
  color?: string;
  size?: string;
}

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  tier?: string;
  loyaltyPoints: number;
  walletBalance: number;
}

interface SaleReceipt {
  invoiceNumber: string;
  total: number;
  changeDue: number;
  paymentMethod: string;
  customerName?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  cashTendered?: number;
}

const PAY_METHODS = [
  { value: "CASH",   label: "Cash",   icon: Banknote   },
  { value: "CARD",   label: "Card",   icon: CreditCard },
  { value: "UPI",    label: "UPI",    icon: Smartphone },
  { value: "WALLET", label: "Wallet", icon: Wallet     },
];

const SHORTCUTS = [
  { key: "/ or Ctrl+F", desc: "Focus product search" },
  { key: "F2",          desc: "Go to checkout" },
  { key: "F3",          desc: "Hold current bill" },
  { key: "F4",          desc: "Clear cart" },
  { key: "F5",          desc: "Refresh products" },
  { key: "F6",          desc: "Search customer" },
  { key: "F8",          desc: "Restore last held bill" },
  { key: " / ",       desc: "Navigate cart items" },
  { key: "+ / =",       desc: "Increase item quantity" },
  { key: "- / _",       desc: "Decrease item quantity" },
  { key: "Del",         desc: "Remove selected cart item" },
  { key: "Tab",         desc: "Cycle payment method" },
  { key: "0-9",         desc: "Cash numpad input" },
  { key: "Backspace",   desc: "Delete numpad digit" },
  { key: "Enter",       desc: "Confirm checkout" },
  { key: "? or F1",     desc: "Show / hide shortcuts" },
  { key: "Esc",         desc: "Back / close" },
  { key: "Barcode scan","desc": "Auto-detected via scanner" },
];

export function POSOverlay() {
  const { posOpen, closePos } = useUIStore();
  const { user } = useAuthStore();

  const [products, setProducts]               = React.useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(true);
  const [categories, setCategories]           = React.useState<string[]>(["All"]);
  const [search, setSearch]                   = React.useState("");
  const [activeCategory, setActiveCategory]   = React.useState("All");

  const [customerSearch, setCustomerSearch]     = React.useState("");
  const [customers, setCustomers]               = React.useState<CustomerItem[]>([]);
  const [customerLoading, setCustomerLoading]   = React.useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = React.useState(false);

  const [activePayment, setActivePayment]   = React.useState("CASH");
  const [numpad, setNumpad]                 = React.useState("");
  const [showCheckout, setShowCheckout]     = React.useState(false);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [receipt, setReceipt]               = React.useState<SaleReceipt | null>(null);
  const [now, setNow]                       = React.useState(new Date());
  const [showShortcuts, setShowShortcuts]   = React.useState(false);
  const [selectedCartIdx, setSelectedCartIdx] = React.useState(-1);
  const [scanFlash, setScanFlash]           = React.useState(false);

  const searchRef   = React.useRef<HTMLInputElement>(null);
  const cartScrollRef = React.useRef<HTMLDivElement>(null);

  // Barcode scanner detection
  const barcodeBuffer  = React.useRef("");
  const lastKeyTime    = React.useRef(0);
  const barcodeTimer   = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const {
    items, customer, discount, taxRate,
    addItem, updateQuantity, removeItem, setCustomer, setDiscount,
    clearCart, holdBill, heldBills, restoreHeldBill,
    subtotal, discountAmount, taxAmount, total, itemCount,
  } = useCartStore();

  //  Clock 
  React.useEffect(() => {
    if (!posOpen) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [posOpen]);

  //  Load products 
  const loadProducts = React.useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await api.get<ProductItem[]>("/pos/products");
      const raw = Array.isArray(res.data) ? res.data : [];
      setProducts(raw);
      setCategories(["All", ...Array.from(new Set(raw.map(p => p.category).filter(Boolean)))]);
    } catch { toast.error("Failed to load products"); }
    finally { setProductsLoading(false); }
  }, []);

  React.useEffect(() => { if (posOpen) loadProducts(); }, [posOpen, loadProducts]);

  //  Customer search 
  React.useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await api.get<{ data: CustomerItem[] }>(`/customers?search=${encodeURIComponent(customerSearch)}&limit=8`);
        setCustomers((res.data?.data ?? res.data ?? []) as CustomerItem[]);
      } catch { /* silent */ }
      finally { setCustomerLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  //  Handlers 
  const handleAddProduct = React.useCallback((p: ProductItem) => {
    if (p.stock <= 0) { toast.error(`${p.productName} is out of stock`); return; }
    addItem({
      variantId: p.variantId, productName: p.productName,
      variantName: p.variantName, sku: p.sku,
      unitPrice: p.unitPrice, quantity: 1, stock: p.stock,
      discountAmount: 0, discountType: "percentage", taxRate: 0,
    });
    toast.success(`${p.productName} added`, { duration: 800 });
  }, [addItem]);

  const handleNumpad = React.useCallback((key: string) => {
    if (key === "DEL") { setNumpad(prev => prev.slice(0, -1)); return; }
    if (key === "CLR") { setNumpad(""); return; }
    if (key === "." && numpad.includes(".")) return;
    setNumpad(prev => prev + key);
  }, [numpad]);

  //  Barcode + Keyboard handler 
  React.useEffect(() => {
    if (!posOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inInput = active?.tagName === "INPUT" || active?.tagName === "TEXTAREA";

      //  Barcode scanner detection 
      const nowMs = Date.now();
      const delta = nowMs - lastKeyTime.current;
      lastKeyTime.current = nowMs;

      if (e.key.length === 1 && delta < 60 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 120);
      } else if (e.key !== "Enter") {
        // Non-fast, non-Enter key resets barcode buffer
        if (delta > 60) {
          clearTimeout(barcodeTimer.current);
          barcodeBuffer.current = "";
        }
      }

      if (e.key === "Enter" && barcodeBuffer.current.length >= 3) {
        const sku = barcodeBuffer.current.trim();
        barcodeBuffer.current = "";
        clearTimeout(barcodeTimer.current);
        if (sku) {
          const found = products.find(p => p.sku.toLowerCase() === sku.toLowerCase());
          if (found) {
            handleAddProduct(found);
            setScanFlash(true);
            setTimeout(() => setScanFlash(false), 400);
          } else {
            toast.error(`SKU not found: ${sku}`);
          }
          e.preventDefault();
          return;
        }
      }

      //  Global shortcuts (don't fire when typing in inputs unless special) 

      // F1 / ?  shortcuts help (always)
      if (e.key === "F1" || (e.key === "?" && !inInput)) {
        e.preventDefault();
        setShowShortcuts(s => !s);
        return;
      }

      // Escape  back / close (always)
      if (e.key === "Escape") {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (receipt) { setReceipt(null); return; }
        if (showCheckout) { setShowCheckout(false); return; }
        if (showCustomerSearch) { setShowCustomerSearch(false); setCustomerSearch(""); setCustomers([]); return; }
        closePos();
        return;
      }

      if (inInput) return; // remaining shortcuts don't fire inside inputs

      // / or Ctrl+F  focus search
      if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // F2  checkout
      if (e.key === "F2") { e.preventDefault(); if (items.length > 0) setShowCheckout(true); return; }

      // F3  hold bill
      if (e.key === "F3") { e.preventDefault(); if (items.length > 0) { holdBill(); toast.success("Bill held"); } return; }

      // F4  clear cart
      if (e.key === "F4") { e.preventDefault(); if (items.length > 0) { clearCart(); setSelectedCartIdx(-1); toast.info("Cart cleared"); } return; }

      // F5  refresh products
      if (e.key === "F5") { e.preventDefault(); loadProducts(); return; }

      // F6  customer search
      if (e.key === "F6") { e.preventDefault(); setShowCustomerSearch(true); return; }

      // F8  restore last held bill
      if (e.key === "F8") { e.preventDefault(); if (heldBills.length > 0) { restoreHeldBill(heldBills[heldBills.length - 1].id); toast.success("Bill restored"); } return; }

      // Checkout-mode shortcuts
      if (showCheckout) {
        // Tab  cycle payment method
        if (e.key === "Tab") {
          e.preventDefault();
          const idx = PAY_METHODS.findIndex(m => m.value === activePayment);
          setActivePayment(PAY_METHODS[(idx + 1) % PAY_METHODS.length].value);
          return;
        }
        // Enter  confirm
        if (e.key === "Enter") { e.preventDefault(); handleCheckout(); return; }
        // 0-9 and .  numpad when CASH
        if (activePayment === "CASH") {
          if (/^\d$/.test(e.key)) { handleNumpad(e.key); return; }
          if (e.key === "." || e.key === ",") { handleNumpad("."); return; }
          if (e.key === "Backspace") { handleNumpad("DEL"); return; }
        }
        return;
      }

      // Cart navigation ()
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCartIdx(i => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCartIdx(i => Math.max(0, i - 1));
        return;
      }

      // + / =  increase qty of selected cart item
      if ((e.key === "+" || e.key === "=") && selectedCartIdx >= 0) {
        e.preventDefault();
        const item = items[selectedCartIdx];
        if (item) updateQuantity(item.variantId, item.quantity + 1);
        return;
      }

      // - / _  decrease qty
      if ((e.key === "-" || e.key === "_") && selectedCartIdx >= 0) {
        e.preventDefault();
        const item = items[selectedCartIdx];
        if (item) updateQuantity(item.variantId, item.quantity - 1);
        return;
      }

      // Delete  remove selected cart item
      if (e.key === "Delete" && selectedCartIdx >= 0) {
        e.preventDefault();
        const item = items[selectedCartIdx];
        if (item) { removeItem(item.variantId); setSelectedCartIdx(i => Math.max(-1, i - 1)); }
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posOpen, products, items, showCheckout, showCustomerSearch, showShortcuts, receipt,
      activePayment, selectedCartIdx, numpad, heldBills, handleAddProduct, handleNumpad]);

  //  Thermal print 
  const handleThermalPrint = () => {
    if (!receipt) return;
    const w = window.open("", "_blank", "width=400,height=700,scrollbars=yes");
    if (!w) { toast.error("Could not open print window. Allow popups."); return; }
    const itemRows = receipt.items.map(i => {
      const unitP = i.qty > 0 ? (i.price / i.qty).toFixed(2) : "0.00";
      return `<div class="item-name">${i.name}</div><div class="row"><span>${i.qty} x LKR ${unitP}</span><span>LKR ${i.price.toFixed(2)}</span></div>`;
    }).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${receipt.invoiceNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;padding:6mm;max-width:80mm;margin:0 auto}
  h1{font-size:18px;font-weight:900;text-align:center;letter-spacing:1px;margin-bottom:2px}
  .sub{font-size:10px;text-align:center;margin-bottom:2px}
  .divider{border:none;border-top:1px dashed #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;margin:2px 0;font-size:11px}
  .item-name{font-size:11px;font-weight:bold;margin-top:4px}
  .total-row{display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px}
  .change{color:#000;font-weight:bold}
  .footer{text-align:center;margin-top:10px;font-size:10px;line-height:1.6}
  @media print{@page{margin:0;size:80mm auto}body{padding:3mm}}
</style></head><body>
<h1>FashionERP</h1>
<div class="sub">Point of Sale Receipt</div>
<hr class="divider"/>
<div class="row"><span>Invoice:</span><span><b>${receipt.invoiceNumber}</b></span></div>
<div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
<div class="row"><span>Cashier:</span><span>${user?.name ?? "Admin"}</span></div>
${receipt.customerName ? `<div class="row"><span>Customer:</span><span>${receipt.customerName}</span></div>` : ""}
<hr class="divider"/>
<div style="font-size:10px;font-weight:bold;margin-bottom:2px">ITEMS</div>
${itemRows}
<hr class="divider"/>
<div class="row"><span>Subtotal</span><span>LKR ${receipt.subtotal.toFixed(2)}</span></div>
${receipt.discount > 0 ? `<div class="row"><span>Discount</span><span>-LKR ${receipt.discount.toFixed(2)}</span></div>` : ""}
<div class="row"><span>Tax</span><span>LKR ${receipt.tax.toFixed(2)}</span></div>
<div class="total-row"><span>TOTAL</span><span>LKR ${receipt.total.toFixed(2)}</span></div>
<hr class="divider"/>
<div class="row"><span>Payment</span><span><b>${receipt.paymentMethod}</b></span></div>
${receipt.cashTendered ? `<div class="row"><span>Cash Tendered</span><span>LKR ${receipt.cashTendered.toFixed(2)}</span></div>` : ""}
${receipt.changeDue > 0 ? `<div class="row change"><span>Change Due</span><span>LKR ${receipt.changeDue.toFixed(2)}</span></div>` : ""}
<hr class="divider"/>
<div class="footer">*** Thank You for Shopping! ***<br/>Powered by FashionERP</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 1000); }, 250);
  };

  //  Checkout 
  const totalAmt  = total();
  const changeAmt = numpad ? Math.max(0, parseFloat(numpad) - totalAmt) : 0;

  const handleCheckout = async () => {
    if (!items.length) return;
    if (checkoutLoading) return;
    if (activePayment === "CASH" && numpad && parseFloat(numpad) < totalAmt) {
      toast.error("Cash tendered is less than total"); return;
    }
    setCheckoutLoading(true);
    try {
      const productMap = new Map(products.map(p => [p.variantId, p]));
      const payload = {
        customerId: customer?.id,
        items: items.map(item => ({
          variantId: item.variantId, productName: item.productName,
          variantName: item.variantName, sku: item.sku,
          quantity: item.quantity, unitPrice: item.unitPrice,
          costPrice: productMap.get(item.variantId)?.costPrice ?? 0,
          discount: item.discountAmount ?? 0,
          discountType: item.discountType === "percentage" ? "PERCENTAGE" : "FIXED",
          taxRate: item.taxRate ?? 0,
        })),
        payments: [{ method: activePayment, amount: activePayment === "CASH" && numpad ? parseFloat(numpad) : totalAmt }],
        discountAmount: discountAmount(),
        notes: "",
      };
      const res = await api.post<{ invoiceNumber: string; total: number; changeDue: number }>("/pos/sale", payload);
      const sale = res.data;
      const newReceipt: SaleReceipt = {
        invoiceNumber: sale.invoiceNumber, total: sale.total,
        changeDue: sale.changeDue ?? changeAmt, paymentMethod: activePayment,
        customerName: customer?.name,
        items: items.map(i => ({ name: `${i.productName} ${i.variantName}`.trim(), qty: i.quantity, price: i.unitPrice * i.quantity })),
        subtotal: subtotal(), discount: discountAmount(), tax: taxAmount(),
        cashTendered: numpad ? parseFloat(numpad) : undefined,
      };
      setReceipt(newReceipt);
      clearCart();
      setShowCheckout(false);
      setNumpad("");
      setSelectedCartIdx(-1);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Checkout failed");
    } finally { setCheckoutLoading(false); }
  };

  //  Derived 
  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    return (
      (!q || p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.variantName.toLowerCase().includes(q)) &&
      (activeCategory === "All" || p.category === activeCategory)
    );
  });

  if (!posOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="pos-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={cn(
          "fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden transition-all",
          scanFlash && "ring-4 ring-inset ring-emerald-500/60"
        )}
      >
        {/*  Top Bar  */}
        <div className="flex h-12 items-center justify-between px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-primary shrink-0">
              <ShoppingCart className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-foreground">POS Terminal</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-xs text-muted-foreground">Cashier: <span className="font-medium text-foreground">{user?.name || "Admin"}</span></span>
            <Separator orientation="vertical" className="h-4" />
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all",
              scanFlash ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" : "bg-muted/50 text-muted-foreground border border-border"
            )}>
              <Scan className="h-3 w-3" />
              {scanFlash ? "Scanned!" : "Scanner ready"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {heldBills.length > 0 && (
              <button
                onClick={() => { restoreHeldBill(heldBills[heldBills.length - 1].id); toast.success("Bill restored"); }}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {heldBills.length} Held
                <kbd className="text-[10px] opacity-60 font-mono">F8</kbd>
              </button>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span>{now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <button
              onClick={() => setShowShortcuts(s => !s)}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground border border-border transition-colors"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <kbd className="text-[10px] opacity-60 font-mono">F1</kbd>
            </button>
            <button
              onClick={closePos}
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground border border-border transition-colors"
            >
              <X className="h-3.5 w-3.5" />Close
              <kbd className="text-[10px] opacity-60 font-mono">ESC</kbd>
            </button>
          </div>
        </div>

        {/*  Main Content  */}
        <div className="flex flex-1 overflow-hidden">

          {/*  Left: Product Catalog  */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
            <div className="p-3 border-b border-border space-y-2 bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    placeholder="Search by name or SKU"
                    className="pl-9 h-9 bg-background"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono opacity-40 bg-muted border border-border rounded px-1">/</kbd>
                </div>
                <Button variant="outline" size="icon" onClick={loadProducts} className="h-9 w-9 shrink-0" title="Refresh (F5)">
                  <RefreshCw className={cn("h-4 w-4", productsLoading && "animate-spin")} />
                </Button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0",
                      activeCategory === cat
                        ? "gradient-primary text-white shadow-sm"
                        : "bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1">
              {productsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">No products found</p>
                </div>
              ) : (
                <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {filteredProducts.map(product => (
                    <motion.button
                      key={product.variantId}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAddProduct(product)}
                      disabled={product.stock <= 0}
                      className={cn(
                        "group relative flex flex-col rounded-xl border bg-card text-left transition-all hover:shadow-md hover:border-primary/40 overflow-hidden",
                        product.stock <= 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:-translate-y-0.5"
                      )}
                    >
                      <div className="h-1.5 w-full gradient-primary" />
                      <div className="p-2.5 flex flex-col gap-1.5">
                        <div className="aspect-square rounded-lg bg-muted/50 flex items-center justify-center">
                          <Package className="h-7 w-7 text-muted-foreground/30" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold leading-tight line-clamp-2">{product.productName}</p>
                          {product.variantName && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{product.variantName}</p>}
                          <p className="text-[9px] text-muted-foreground/50 font-mono truncate">{product.sku}</p>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-primary truncate">LKR {formatNumber(product.unitPrice)}</span>
                          <span className={cn(
                            "text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                            product.stock === 0 ? "bg-red-500/15 text-red-500" :
                            product.stock < 5  ? "bg-amber-500/15 text-amber-500" :
                                                  "bg-emerald-500/15 text-emerald-600"
                          )}>
                            {product.stock === 0 ? "Out" : product.stock}
                          </span>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-xl" />
                    </motion.button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/*  Right: Order Panel  */}
          <div className="w-[400px] flex flex-col bg-background shrink-0 relative">

            {/* Customer */}
            <div className="px-3 py-2 border-b border-border shrink-0">
              {customer ? (
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center shrink-0 text-white text-xs font-bold">
                    {customer.name?.[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{customer.name}</p>
                    <div className="flex items-center gap-1.5">
                      <Star className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-muted-foreground capitalize">{customer.membershipTier}</span>
                      <span className="text-[10px] text-muted-foreground"> {customer.loyaltyPoints} pts</span>
                    </div>
                  </div>
                  <button onClick={() => setCustomer(null)} className="p-1 rounded hover:bg-muted transition-colors shrink-0">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomerSearch(true)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground"
                >
                  <User className="h-4 w-4" />
                  <span className="text-sm">Add Customer</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  <kbd className="text-[10px] opacity-40 font-mono bg-muted border border-border rounded px-1">F6</kbd>
                </button>
              )}
            </div>

            {/* Customer search overlay */}
            <AnimatePresence>
              {showCustomerSearch && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-0 left-0 right-0 z-50 bg-background border-b border-border shadow-xl"
                >
                  <div className="flex items-center gap-2 p-3 border-b border-border">
                    <Input
                      autoFocus
                      placeholder="Search by name or phone"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="flex-1 h-9"
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setShowCustomerSearch(false); setCustomerSearch(""); setCustomers([]); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                    {customerLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!customerLoading && customers.length === 0 && customerSearch && (
                      <p className="text-center text-sm text-muted-foreground py-6">No customers found</p>
                    )}
                    {customers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCustomer({
                            id: c.id, name: c.name, phone: c.phone, email: undefined,
                            membershipTier: (c.tier?.toLowerCase() as "bronze") ?? "bronze",
                            loyaltyPoints: c.loyaltyPoints, totalPurchases: 0,
                            totalSpent: 0, creditLimit: 0, outstandingBalance: 0,
                            isActive: true, createdAt: new Date(),
                          });
                          setShowCustomerSearch(false); setCustomerSearch(""); setCustomers([]);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {c.name?.[0] ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
                        </div>
                        <span className="text-xs text-amber-500 font-semibold capitalize shrink-0">{c.tier}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cart header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Order</span>
                {itemCount() > 0 && <Badge className="h-5 w-5 p-0 text-[10px] flex items-center justify-center">{itemCount()}</Badge>}
                {selectedCartIdx >= 0 && <span className="text-[10px] text-muted-foreground">#{selectedCartIdx + 1} selected</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { if (items.length > 0) { holdBill(); toast.success("Bill held"); } }}
                  disabled={items.length === 0}
                  title="Hold bill (F3)"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
                >
                  <PauseCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { clearCart(); setSelectedCartIdx(-1); }}
                  disabled={items.length === 0}
                  title="Clear cart (F4)"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Cart items */}
            <ScrollArea className="flex-1" ref={cartScrollRef}>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mb-3 opacity-10" />
                  <p className="text-sm font-medium">Order is empty</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">Click products or scan barcode</p>
                </div>
              ) : (
                <div className="px-2 py-1.5 space-y-0.5">
                  <AnimatePresence>
                    {items.map((item, idx) => (
                      <motion.div
                        key={item.variantId}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={() => setSelectedCartIdx(idx)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer group",
                          selectedCartIdx === idx
                            ? "bg-primary/10 border border-primary/25"
                            : "hover:bg-muted/30"
                        )}
                      >
                        {selectedCartIdx === idx && (
                          <div className="w-1 h-8 rounded-full bg-primary shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold line-clamp-1">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.variantName}  LKR {formatNumber(item.unitPrice)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); updateQuantity(item.variantId, item.quantity - 1); }}
                            className="h-6 w-6 rounded-md bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                          <button
                            onClick={e => { e.stopPropagation(); updateQuantity(item.variantId, item.quantity + 1); }}
                            className="h-6 w-6 rounded-md bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="w-20 text-right shrink-0">
                          <p className="text-xs font-bold">LKR {formatNumber(item.unitPrice * item.quantity)}</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); removeItem(item.variantId); if (selectedCartIdx === idx) setSelectedCartIdx(-1); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>

            {/* Discount row */}
            {items.length > 0 && (
              <div className="px-3 py-2 border-t border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Cart discount %"
                    className="h-7 text-xs flex-1 bg-muted/30"
                    type="number"
                    value={discount || ""}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0, "percentage")}
                  />
                </div>
              </div>
            )}

            {/* Totals */}
            {items.length > 0 && (
              <div className="px-3 py-2 border-t border-border space-y-1 bg-muted/10 shrink-0">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span><span className="font-mono">LKR {formatNumber(subtotal())}</span>
                </div>
                {discountAmount() > 0 && (
                  <div className="flex justify-between text-xs text-emerald-500">
                    <span>Discount</span><span className="font-mono">-LKR {formatNumber(discountAmount())}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tax ({taxRate}%)</span><span className="font-mono">LKR {formatNumber(taxAmount())}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary font-mono">LKR {formatNumber(totalAmt)}</span>
                </div>
              </div>
            )}

            {/* Checkout section */}
            <div className="border-t border-border shrink-0">
              {!showCheckout ? (
                <div className="p-3">
                  <Button
                    className="w-full h-11 text-sm font-bold gap-2"
                    disabled={items.length === 0}
                    onClick={() => setShowCheckout(true)}
                  >
                    <Receipt className="h-4 w-4" />
                    Checkout  LKR {items.length > 0 ? formatNumber(totalAmt) : "0.00"}
                    <kbd className="ml-auto text-[10px] opacity-60 font-mono">F2</kbd>
                  </Button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 space-y-2.5">
                  {/* Payment method tabs */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAY_METHODS.map(({ value, label, icon: Icon }, i) => (
                      <button
                        key={value}
                        onClick={() => setActivePayment(value)}
                        title={`Tab to cycle`}
                        className={cn(
                          "flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-all relative",
                          activePayment === value
                            ? "gradient-primary text-white border-transparent shadow-sm"
                            : "border-border hover:bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {activePayment === value && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center">{i + 1}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Cash numpad */}
                  {activePayment === "CASH" && (
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">LKR</span>
                        <Input
                          value={numpad}
                          readOnly
                          placeholder="0.00"
                          className="text-center font-mono text-lg font-bold h-10 pl-12 bg-muted/30"
                        />
                        {numpad && (
                          <button onClick={() => setNumpad("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>

                      {/* Quick amounts */}
                      <div className="grid grid-cols-4 gap-1">
                        {[500, 1000, 2000, Math.ceil(totalAmt / 100) * 100].map(amt => (
                          <button
                            key={amt}
                            onClick={() => setNumpad(String(amt))}
                            className="py-1.5 text-[11px] rounded-lg bg-muted hover:bg-muted/80 font-mono font-semibold transition-colors"
                          >
                            {formatNumber(amt)}
                          </button>
                        ))}
                      </div>

                      {/* Numpad grid */}
                      <div className="grid grid-cols-3 gap-1">
                        {["7","8","9","4","5","6","1","2","3",".","0","DEL"].map(key => (
                          <button
                            key={key}
                            onClick={() => handleNumpad(key)}
                            className={cn(
                              "h-9 rounded-xl text-sm font-semibold transition-all active:scale-95",
                              key === "DEL"
                                ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                : "bg-muted hover:bg-accent hover:text-foreground"
                            )}
                          >
                            {key === "DEL" ? <Delete className="h-4 w-4 mx-auto" /> : key}
                          </button>
                        ))}
                      </div>

                      {numpad && parseFloat(numpad) >= totalAmt && (
                        <div className="flex justify-between text-sm px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <span className="text-emerald-600 font-medium">Change</span>
                          <span className="text-emerald-600 font-bold font-mono">LKR {formatNumber(changeAmt)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1 h-9" onClick={() => setShowCheckout(false)} disabled={checkoutLoading}>
                      Back
                    </Button>
                    <Button className="flex-1 h-9 gap-1.5 font-bold" onClick={handleCheckout} disabled={checkoutLoading}>
                      {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirm
                      <kbd className="ml-auto text-[10px] opacity-60 font-mono"></kbd>
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/*  Receipt Modal  */}
        <AnimatePresence>
          {receipt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.92, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 16 }}
                className="bg-background rounded-2xl shadow-2xl border w-full max-w-sm overflow-hidden"
              >
                <div className="gradient-primary p-5 text-white text-center">
                  <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-bold">Sale Complete!</h2>
                  <p className="text-white/80 text-xs font-mono mt-0.5">{receipt.invoiceNumber}</p>
                </div>

                <div className="p-4 space-y-3 font-mono text-sm">
                  {receipt.customerName && (
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Customer</span><span className="font-semibold">{receipt.customerName}</span></div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-semibold capitalize">{receipt.paymentMethod.toLowerCase()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Date</span>
                    <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  <div className="border-t border-dashed border-border pt-2 space-y-1">
                    {receipt.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate flex-1 mr-2">{item.name} ×{item.qty}</span>
                        <span>LKR {formatNumber(item.price)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-border pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal</span><span>LKR {formatNumber(receipt.subtotal)}</span></div>
                    {receipt.discount > 0 && <div className="flex justify-between text-xs text-emerald-500"><span>Discount</span><span>-LKR {formatNumber(receipt.discount)}</span></div>}
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Tax</span><span>LKR {formatNumber(receipt.tax)}</span></div>
                    <div className="flex justify-between text-base font-bold border-t border-border pt-1 mt-1">
                      <span>TOTAL</span><span className="text-primary">LKR {formatNumber(receipt.total)}</span>
                    </div>
                    {receipt.cashTendered && (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground"><span>Cash Tendered</span><span>LKR {formatNumber(receipt.cashTendered)}</span></div>
                        <div className="flex justify-between text-xs font-semibold text-emerald-500"><span>Change</span><span>LKR {formatNumber(receipt.changeDue)}</span></div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 p-4 pt-0">
                  <Button variant="outline" className="flex-1 gap-1.5 h-9 text-sm" onClick={handleThermalPrint}>
                    <Printer className="h-4 w-4" />Thermal Print
                  </Button>
                  <Button className="flex-1 h-9 text-sm font-semibold" onClick={() => setReceipt(null)}>
                    New Sale
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/*  Keyboard Shortcuts Modal  */}
        <AnimatePresence>
          {showShortcuts && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowShortcuts(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 12 }}
                onClick={e => e.stopPropagation()}
                className="bg-background rounded-2xl border shadow-2xl w-full max-w-md p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-base">Keyboard Shortcuts</h3>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-[65vh] overflow-y-auto pr-1">
                  {SHORTCUTS.map(({ key, desc }) => (
                    <div key={key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50">
                      <kbd className="bg-muted border border-border rounded-lg px-2 py-0.5 text-xs font-mono font-semibold shrink-0">{key}</kbd>
                      <span className="text-sm text-muted-foreground ml-3">{desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-4">Press <kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> or click outside to close</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
