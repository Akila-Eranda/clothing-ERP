"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, Plus, Minus, Trash2, User, Tag, Receipt, Banknote, CreditCard, Smartphone, Wallet, PauseCircle, PlayCircle, Package, X, Check, Loader2, Star, CheckCircle2, Printer, Clock, Delete, Keyboard, Scan, BarChart2, RotateCcw, Settings, Lock, Users, FileText, ShoppingBag, Heart, RefreshCw, TrendingUp, Menu, Wifi, ChevronRight, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useReceiptSettings, type ReceiptSettings } from "@/lib/use-receipt-settings";

interface ProductItem { variantId: string; productName: string; variantName: string; sku: string; barcode?: string; unitPrice: number; costPrice: number; stock: number; category: string; color?: string; size?: string; imageUrl?: string; }
interface CustomerItem { id: string; name: string; phone: string; email?: string; tier?: string; loyaltyPoints: number; walletBalance: number; }
interface SaleReceipt { invoiceNumber: string; total: number; changeDue: number; paymentMethod: string; customerName?: string; items: { name: string; qty: number; price: number }[]; subtotal: number; discount: number; tax: number; cashTendered?: number; }
interface RecentScan { id: string; variantId: string; name: string; variant: string; price: number; time: Date; }
interface SaleRow { id: string; invoiceNumber: string; total: number; invoiceDate: string; status: string; customer?: { name: string } | null; _count?: { items: number }; payments?: { method: string }[]; }
interface SaleItemDetail { id: string; variantId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number; total: number; }
interface SaleDetail { id: string; invoiceNumber: string; total: number; invoiceDate: string; status: string; customer?: { name: string; phone: string } | null; items: SaleItemDetail[]; }
interface ReturnItemSel { qty: number; unitPrice: number; name: string; maxQty: number; }

const PAY_METHODS = [{ value:"CASH", label:"Cash", icon: Banknote }, { value:"CARD", label:"Card", icon: CreditCard }, { value:"UPI", label:"UPI", icon: Smartphone }, { value:"WALLET", label:"Wallet", icon: Wallet }];
const NAV_ITEMS = [{ id:"products", label:"Products", icon: ShoppingBag }, { id:"cart", label:"Cart", icon: ShoppingCart, badge:true }, { id:"customers", label:"Customers", icon: Users }, { id:"hold-bills", label:"Hold Bills", icon: PauseCircle }, { id:"orders", label:"Orders", icon: FileText }, { id:"returns", label:"Returns", icon: RotateCcw }, { id:"discounts", label:"Discounts", icon: Tag }, { id:"reports", label:"Reports", icon: BarChart2 }, { id:"settings", label:"Settings", icon: Settings }];
const SIZE_ORDER = ["XS","S","M","L","XL","XXL","XXXL","28","30","32","34","36","38","40","42","44"];
const COLOR_HEX: Record<string,string> = { black:"#1a1a1a", white:"#f0f0ef", navy:"#1e3a5f", maroon:"#7f1d1d", red:"#dc2626", blue:"#2563eb", "sky blue":"#38bdf8", beige:"#d4c5a9", green:"#16a34a", gray:"#6b7280", pink:"#ec4899", yellow:"#eab308", orange:"#f97316", brown:"#92400e", purple:"#7c3aed" };
function getColorHex(c="") { return COLOR_HEX[c.toLowerCase()] ?? "#6b7280"; }
function getCardBg(c="") { const m: Record<string,string> = { black:"linear-gradient(135deg,#1a1a2e,#16213e)", white:"linear-gradient(135deg,#e8eaf6,#c5cae9)", navy:"linear-gradient(135deg,#1a237e,#283593)", maroon:"linear-gradient(135deg,#4a0010,#880e4f)", red:"linear-gradient(135deg,#b71c1c,#c62828)", blue:"linear-gradient(135deg,#0d47a1,#1565c0)", "sky blue":"linear-gradient(135deg,#0277bd,#0288d1)", beige:"linear-gradient(135deg,#8d6e63,#a1887f)", green:"linear-gradient(135deg,#1b5e20,#2e7d32)", gray:"linear-gradient(135deg,#37474f,#455a64)", pink:"linear-gradient(135deg,#880e4f,#ad1457)", yellow:"linear-gradient(135deg,#f57f17,#f9a825)" }; return m[c.toLowerCase()] ?? "linear-gradient(135deg,#1a237e,#283593)"; }
const STATUS_STYLE: Record<string,{bg:string;color:string}> = { COMPLETED:{bg:"rgba(16,185,129,0.15)",color:"#10b981"}, PENDING:{bg:"rgba(245,158,11,0.15)",color:"#f59e0b"}, CANCELLED:{bg:"rgba(239,68,68,0.15)",color:"#ef4444"}, REFUNDED:{bg:"rgba(139,92,246,0.15)",color:"#8b5cf6"} };
const TIER_COLOR: Record<string,string> = { bronze:"#cd7f32", silver:"#9ca3af", gold:"#f59e0b", platinum:"#8b5cf6" };

export function POSOverlay() {
  const { posOpen, closePos } = useUIStore();
  const { user } = useAuthStore();
  const [products, setProducts] = React.useState<ProductItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<string[]>(["All"]);
  const [activeCategory, setActiveCategory] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [activeNav, setActiveNav] = React.useState("products");
  const [activePayment, setActivePayment] = React.useState("CASH");
  const [numpad, setNumpad] = React.useState("");
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [customers, setCustomers] = React.useState<CustomerItem[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [selectedCartIdx, setSelectedCartIdx] = React.useState(-1);
  const [scanFlash, setScanFlash] = React.useState(false);
  const [recentScans, setRecentScans] = React.useState<RecentScan[]>([]);
  const [selectedProductName, setSelectedProductName] = React.useState<string | null>(null);
  const [selColor, setSelColor] = React.useState<string | null>(null);
  const [selSize, setSelSize] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(new Date());
  const [todayStats, setTodayStats] = React.useState({ sales: 0, orders: 0, items: 0 });
  const [liked, setLiked] = React.useState<Set<string>>(new Set());
  const [orders, setOrders] = React.useState<SaleRow[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [inlineCustomerSearch, setInlineCustomerSearch] = React.useState("");
  const [inlineCustomers, setInlineCustomers] = React.useState<CustomerItem[]>([]);
  const [inlineCustLoading, setInlineCustLoading] = React.useState(false);
  const [cartNotes, setCartNotes] = React.useState("");
  const [discountInput, setDiscountInput] = React.useState("");
  const [showNewCust, setShowNewCust] = React.useState(false);
  const [newCustFirst, setNewCustFirst] = React.useState("");
  const [newCustLast, setNewCustLast] = React.useState("");
  const [newCustPhone, setNewCustPhone] = React.useState("");
  const [newCustEmail, setNewCustEmail] = React.useState("");
  const [newCustSaving, setNewCustSaving] = React.useState(false);
  const [returnStep, setReturnStep] = React.useState<"search"|"items"|"confirm"|"done">("search");
  const [returnQuery, setReturnQuery] = React.useState("");
  const [returnSearchRes, setReturnSearchRes] = React.useState<SaleRow[]>([]);
  const [returnSearchLoading, setReturnSearchLoading] = React.useState(false);
  const [returnSale, setReturnSale] = React.useState<SaleDetail | null>(null);
  const [returnSaleLoading, setReturnSaleLoading] = React.useState(false);
  const [returnItems, setReturnItems] = React.useState<Map<string, ReturnItemSel>>(new Map());
  const [returnReason, setReturnReason] = React.useState("");
  const [returnNotes, setReturnNotes] = React.useState("");
  const [returnRestock, setReturnRestock] = React.useState(true);
  const [returnSubmitting, setReturnSubmitting] = React.useState(false);
  const [returnResult, setReturnResult] = React.useState<{returnNumber:string;refundAmount:number}|null>(null);
  const [returnType, setReturnType] = React.useState<"RETURN"|"EXCHANGE">("RETURN");
  const [exchangeItems, setExchangeItems] = React.useState<Map<string, ReturnItemSel>>(new Map());
  const [exchangeSearch, setExchangeSearch] = React.useState("");
  const [pinLocked, setPinLocked] = React.useState(false);
  const [pinEntry, setPinEntry] = React.useState("");
  const [pinError, setPinError] = React.useState(false);
  const [settingNewPin, setSettingNewPin] = React.useState("");
  const [settingConfirmPin, setSettingConfirmPin] = React.useState("");
  const [dayEndLoading, setDayEndLoading] = React.useState(false);
  const [showDayEnd, setShowDayEnd] = React.useState(false);
  const [dayEndSummary, setDayEndSummary] = React.useState<{date:string;totalSales:number;totalRevenue:number;totalTax:number;totalDiscount:number;byPaymentMethod:Record<string,number>}|null>(null);
  const { settings: receiptSettings } = useReceiptSettings();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const barcodeBuffer = React.useRef(""); const lastKeyTime = React.useRef(0); const barcodeTimer = React.useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const { items, customer, discount, taxRate, addItem, updateQuantity, removeItem, setCustomer, setDiscount, setTaxRate, clearCart, holdBill, heldBills, restoreHeldBill, deleteHeldBill, subtotal, discountAmount, taxAmount, total, itemCount } = useCartStore();

  React.useEffect(() => { if (!posOpen) return; const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, [posOpen]);

  const loadProducts = React.useCallback(async () => {
    setLoading(true);
    try { const r = await api.get<ProductItem[]>("/pos/products"); const raw = Array.isArray(r.data) ? r.data : []; setProducts(raw); setCategories(["All",...Array.from(new Set(raw.map(p=>p.category).filter(Boolean)))]); }
    catch { toast.error("Failed to load products"); } finally { setLoading(false); }
  }, []);

  const loadOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const r = await api.get<{data?: SaleRow[]}>("/sales?limit=30");
      setOrders(r.data?.data ?? []);
    } catch { toast.error("Failed to load sales"); } finally { setOrdersLoading(false); }
  }, []);

  React.useEffect(() => { if (posOpen) loadProducts(); }, [posOpen, loadProducts]);
  React.useEffect(() => { if (activeNav === "orders" && posOpen) loadOrders(); }, [activeNav, posOpen, loadOrders]);
  React.useEffect(() => {
    if (posOpen) {
      const stored = typeof window !== "undefined" ? localStorage.getItem("pos_pin") : null;
      if (stored) { setPinLocked(true); setPinEntry(""); setPinError(false); }
      else setPinLocked(false);
    }
  }, [posOpen]);

  React.useEffect(() => { if (activeNav !== "returns") { setReturnStep("search"); setReturnQuery(""); setReturnSearchRes([]); setReturnSale(null); setReturnItems(new Map()); setReturnReason(""); setReturnNotes(""); setReturnRestock(true); setReturnResult(null); setReturnType("RETURN"); setExchangeItems(new Map()); setExchangeSearch(""); } }, [activeNav]);

  React.useEffect(() => {
    if (!customerSearch.trim()) { setCustomers([]); return; }
    const t = setTimeout(async () => { setCustomerLoading(true); try { const r = await api.get<{data:CustomerItem[]}>(`/customers?search=${encodeURIComponent(customerSearch)}&limit=8`); setCustomers((r.data?.data??r.data??[]) as CustomerItem[]); } catch{} finally { setCustomerLoading(false); } }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  React.useEffect(() => {
    if (!inlineCustomerSearch.trim()) { setInlineCustomers([]); return; }
    const t = setTimeout(async () => { setInlineCustLoading(true); try { const r = await api.get<{data:CustomerItem[]}>(`/customers?search=${encodeURIComponent(inlineCustomerSearch)}&limit=12`); setInlineCustomers((r.data?.data??r.data??[]) as CustomerItem[]); } catch{} finally { setInlineCustLoading(false); } }, 300);
    return () => clearTimeout(t);
  }, [inlineCustomerSearch]);

  const productGroups = React.useMemo(() => { const m = new Map<string,ProductItem[]>(); for (const p of products) m.set(p.productName,[...(m.get(p.productName)||[]),p]); return m; }, [products]);
  const getVariants = React.useCallback((n:string)=>productGroups.get(n)||[], [productGroups]);
  const getColors = React.useCallback((n:string)=>[...new Set(getVariants(n).map(v=>v.color).filter(Boolean))] as string[], [getVariants]);
  const getSizes = React.useCallback((n:string)=>{ const s=[...new Set(getVariants(n).map(v=>v.size).filter(Boolean))] as string[]; return s.sort((a,b)=>{const ai=SIZE_ORDER.indexOf(a.toUpperCase()),bi=SIZE_ORDER.indexOf(b.toUpperCase());return(ai===-1?99:ai)-(bi===-1?99:bi);});}, [getVariants]);
  const findVariant = React.useCallback((n:string,c?:string,s?:string)=>getVariants(n).find(v=>(!c||v.color===c)&&(!s||v.size===s))??getVariants(n)[0], [getVariants]);
  const activeVariant = React.useMemo(()=>selectedProductName?findVariant(selectedProductName,selColor??undefined,selSize??undefined):null, [selectedProductName,selColor,selSize,findVariant]);
  const totalAmt = total(); const changeAmt = numpad ? Math.max(0,parseFloat(numpad)-totalAmt) : 0;
  const popularItems = React.useMemo(()=>products.slice(0,5),[products]);
  const filteredProducts = React.useMemo(()=>products.filter(p=>{const q=search.toLowerCase();return (!q||p.productName.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||p.variantName.toLowerCase().includes(q)||p.color?.toLowerCase().includes(q)||p.size?.toLowerCase().includes(q))&&(activeCategory==="All"||p.category===activeCategory);}),[products,search,activeCategory]);

  const handleAddProduct = React.useCallback((p:ProductItem)=>{ if(p.stock<=0){toast.error(`${p.productName} (${p.variantName}) — Out of stock`);return;} addItem({variantId:p.variantId,productName:p.productName,variantName:p.variantName,sku:p.sku,unitPrice:p.unitPrice,quantity:1,stock:p.stock,discountAmount:0,discountType:"percentage",taxRate:0}); setRecentScans(prev=>[{id:Date.now().toString(),variantId:p.variantId,name:p.productName,variant:p.variantName,price:p.unitPrice,time:new Date()},...prev].slice(0,8)); toast.success(`${p.productName} · ${p.variantName} added  (Stock: ${p.stock})`,{duration:900}); }, [addItem]);
  const handleCardClick = React.useCallback((p:ProductItem)=>{ const c=getColors(p.productName),s=getSizes(p.productName); if(c.length<=1&&s.length<=1){handleAddProduct(p);return;} setSelectedProductName(p.productName);setSelColor(p.color??null);setSelSize(p.size??null); },[getColors,getSizes,handleAddProduct]);
  const handleNumpad = React.useCallback((k:string)=>{ if(k==="DEL"){setNumpad(p=>p.slice(0,-1));return;} if(k==="."&&numpad.includes("."))return; setNumpad(p=>p+k); },[numpad]);

  const handlePinEntry = React.useCallback((digit: string) => {
    if (digit === "DEL") { setPinEntry(p => p.slice(0,-1)); setPinError(false); return; }
    const next = pinEntry + digit;
    if (next.length > 4) return;
    setPinEntry(next);
    if (next.length === 4) {
      const stored = localStorage.getItem("pos_pin");
      if (next === stored) { setPinLocked(false); setPinEntry(""); setPinError(false); }
      else { setPinError(true); setPinEntry(""); }
    }
  }, [pinEntry]);



  const handleDayEnd = React.useCallback(async()=>{
    if(dayEndLoading)return;
    setDayEndLoading(true);
    try{
      const r=await api.post<{date:string;totalSales:number;totalRevenue:number;totalTax:number;totalDiscount:number;byPaymentMethod:Record<string,number>}>("/pos/day-end",{});
      setDayEndSummary(r.data);
      setShowDayEnd(true);
      toast.success("Day closed successfully");
    }catch(e:unknown){toast.error((e as Error).message??"Day end failed");}
    finally{setDayEndLoading(false);}
  },[dayEndLoading]);

  const buildReceiptHtml = React.useCallback((r: SaleReceipt): string => {
    const s: ReceiptSettings = receiptSettings;
    const pw = s.paperWidth==="58mm"?"58mm":"80mm";
    const fs = s.fontSize==="small"?"11px":s.fontSize==="large"?"14px":"12px";
    const rows=r.items.map(i=>`<div class="iname">${i.name}</div><div class="row"><span>${i.qty} x LKR ${i.qty>0?(i.price/i.qty).toFixed(2):"0.00"}</span><span>LKR ${i.price.toFixed(2)}</span></div>`).join("");
    const logoHtml=s.logoUrl?`<img src="${s.logoUrl}" style="max-width:80px;display:block;margin:0 auto 4px"/>`:"";
    const addr=[s.address1,s.address2].filter(Boolean).map(a=>`<sub>${a}</sub>`).join("");
    const contactHtml=[s.phone&&`<sub>${s.phone}</sub>`,s.email&&`<sub>${s.email}</sub>`,s.website&&`<sub>${s.website}</sub>`].filter(Boolean).join("");
    const headerMsg=s.headerText?`<sub style="font-style:italic">${s.headerText}</sub>`:"";
    const cashierHtml=s.showCashier?`<div class="row"><span>Cashier:</span><span>${user?.name??"Admin"}</span></div>`:"";
    const customerHtml=(s.showCustomer&&r.customerName)?`<div class="row"><span>Customer:</span><span>${r.customerName}</span></div>`:"";
    const discountHtml=(s.showDiscount&&r.discount>0)?`<div class="row"><span>Discount</span><span>-LKR ${r.discount.toFixed(2)}</span></div>`:"";
    const taxHtml=(s.showTax&&r.tax>0)?`<div class="row"><span>Tax</span><span>LKR ${r.tax.toFixed(2)}</span></div>`:"";
    const barcodeHtml=s.showBarcode?`<div style="text-align:center;font-family:monospace;letter-spacing:2px;font-size:9px;margin:4px 0">${r.invoiceNumber}</div>`:"";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:${fs};padding:6mm;max-width:${pw};margin:0 auto}h1{font-size:1.4em;font-weight:900;text-align:center}sub{font-size:0.85em;display:block;text-align:center;margin-bottom:1px}.d{border:none;border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:0.9em}.iname{font-size:0.9em;font-weight:bold;margin-top:4px}.tot{display:flex;justify-content:space-between;font-size:1.15em;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px}.foot{text-align:center;margin-top:10px;font-size:0.8em;line-height:1.6}@media print{@page{margin:0;size:${pw} auto}body{padding:3mm}}</style></head><body>${logoHtml}<h1>${s.shopName||"FashionERP"}</h1>${s.tagline?`<sub>${s.tagline}</sub>`:""}${addr}${contactHtml}${headerMsg}<hr class="d"/><div class="row"><span>Invoice:</span><span><b>${r.invoiceNumber}</b></span></div><div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div>${cashierHtml}${customerHtml}<hr class="d"/><div style="font-size:0.8em;font-weight:bold;margin-bottom:2px">ITEMS</div>${rows}<hr class="d"/><div class="row"><span>Subtotal</span><span>LKR ${r.subtotal.toFixed(2)}</span></div>${discountHtml}${taxHtml}<div class="tot"><span>TOTAL</span><span>LKR ${r.total.toFixed(2)}</span></div><hr class="d"/><div class="row"><span>Payment</span><span><b>${r.paymentMethod}</b></span></div>${r.cashTendered?`<div class="row"><span>Cash Tendered</span><span>LKR ${r.cashTendered.toFixed(2)}</span></div><div class="row"><span>Change</span><span>LKR ${r.changeDue.toFixed(2)}</span></div>`:""}<hr class="d"/>${barcodeHtml}<div class="foot">${s.footerText||"Thank you for shopping!"}</div></body></html>`;
  },[user, receiptSettings]);

  const handleCheckout = React.useCallback(async()=>{
    if(!items.length||checkoutLoading)return;
    if(activePayment==="CASH"&&numpad&&parseFloat(numpad)<totalAmt){toast.error("Cash tendered less than total");return;}
    setCheckoutLoading(true);
    try {
      const pm=new Map(products.map(p=>[p.variantId,p]));
      const payload={customerId:customer?.id,items:items.map(i=>({variantId:i.variantId,productName:i.productName,variantName:i.variantName,sku:i.sku,quantity:i.quantity,unitPrice:i.unitPrice,costPrice:pm.get(i.variantId)?.costPrice??0,discount:i.discountAmount??0,discountType:i.discountType==="percentage"?"PERCENTAGE":"FIXED",taxRate:i.taxRate??0})),payments:[{method:activePayment,amount:activePayment==="CASH"&&numpad?parseFloat(numpad):totalAmt}],discountAmount:discountAmount(),notes:cartNotes};
      const res=await api.post<{invoiceNumber:string;total:number;changeDue:number}>("/pos/sale",payload);
      const s=res.data;
      setTodayStats(prev=>({sales:prev.sales+s.total,orders:prev.orders+1,items:prev.items+items.reduce((a,i)=>a+i.quantity,0)}));
      clearCart();setNumpad("");setSelectedCartIdx(-1);setCartNotes("");setDiscountInput("");
      setActiveNav("products");setTimeout(()=>searchRef.current?.focus(),100);
      toast.success(`? ${s.invoiceNumber} — LKR ${s.total.toLocaleString()}`,{duration:3500});
    } catch(e:unknown){toast.error((e as Error).message??"Checkout failed");} finally{setCheckoutLoading(false);}
  },[items,checkoutLoading,activePayment,numpad,totalAmt,products,customer,discountAmount,changeAmt,subtotal,taxAmount,clearCart,cartNotes]);

  React.useEffect(() => {
    if (!posOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const inInput=["INPUT","TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName??"");
      if(pinLocked){if(/^\d$/.test(e.key)){handlePinEntry(e.key);return;}if(e.key==="Backspace"){handlePinEntry("DEL");return;}if(e.key==="Escape"){closePos();return;}return;}
      const ms=Date.now();const delta=ms-lastKeyTime.current;lastKeyTime.current=ms;
      if(e.key.length===1&&delta<60&&!e.ctrlKey&&!e.altKey){barcodeBuffer.current+=e.key;clearTimeout(barcodeTimer.current);barcodeTimer.current=setTimeout(()=>{barcodeBuffer.current="";},120);}else if(e.key!=="Enter"&&delta>60){clearTimeout(barcodeTimer.current);barcodeBuffer.current="";}
      if(e.key==="Enter"&&barcodeBuffer.current.length>=3){const code=barcodeBuffer.current.trim();barcodeBuffer.current="";clearTimeout(barcodeTimer.current);if(code){const found=products.find(p=>(p.barcode&&p.barcode===code)||p.sku.toLowerCase()===code.toLowerCase());if(found){handleAddProduct(found);setScanFlash(true);setTimeout(()=>setScanFlash(false),500);}else toast.error(`Barcode/SKU not found: ${code}`);e.preventDefault();return;}}
      if(e.key==="F1"||(e.key==="?"&&!inInput)){e.preventDefault();setShowShortcuts(s=>!s);return;}
      if(e.key==="Escape"){if(showShortcuts){setShowShortcuts(false);return;}if(selectedProductName){setSelectedProductName(null);return;}if(showCustomerSearch){setShowCustomerSearch(false);setCustomerSearch("");return;}closePos();return;}
      if(inInput&&e.key==="Enter"&&document.activeElement===searchRef.current){const first=filteredProducts[0];if(first){e.preventDefault();handleAddProduct(first);setScanFlash(true);setTimeout(()=>setScanFlash(false),500);}return;}
      if(inInput)return;
      if(e.key==="p"||e.key==="P"){e.preventDefault();setActiveNav("products");setTimeout(()=>searchRef.current?.focus(),50);return;}
      if(e.key==="c"||e.key==="C"){e.preventDefault();setActiveNav("cart");return;}
      if(e.key==="r"||e.key==="R"){e.preventDefault();setActiveNav("returns");return;}
      if(e.key==="h"||e.key==="H"){e.preventDefault();setActiveNav("hold-bills");return;}
      if(e.key==="u"||e.key==="U"){e.preventDefault();setActiveNav("customers");return;}
      if(e.key==="/"||((e.ctrlKey||e.metaKey)&&e.key==="f")){e.preventDefault();searchRef.current?.focus();return;}
      if(e.key==="F2"){e.preventDefault();searchRef.current?.focus();setActiveNav("products");return;}
      if(e.key==="F3"){e.preventDefault();if(items.length>0){holdBill();toast.success("Bill held");}return;}
      if(e.key==="F4"){e.preventDefault();setShowCustomerSearch(true);return;}
      if(e.key==="F5"){e.preventDefault();loadProducts();return;}
      if(e.key==="F8"){e.preventDefault();if(heldBills.length>0){restoreHeldBill(heldBills[heldBills.length-1].id);toast.success("Bill restored");}return;}
      if(e.key==="F9"){e.preventDefault();handleCheckout();return;}
      if(e.key==="F12"){e.preventDefault();const st=localStorage.getItem("pos_pin");if(st){setPinLocked(true);setPinEntry("");setPinError(false);}else closePos();return;}
      if(e.key==="Tab"){e.preventDefault();const i=PAY_METHODS.findIndex(m=>m.value===activePayment);setActivePayment(PAY_METHODS[(i+1)%PAY_METHODS.length].value);return;}
      if(e.key==="Enter"){e.preventDefault();handleCheckout();return;}
      if(activePayment==="CASH"){if(/^\d$/.test(e.key)){handleNumpad(e.key);return;}if(e.key==="."){handleNumpad(".");return;}if(e.key==="Backspace"){handleNumpad("DEL");return;}}
      if(e.key==="ArrowDown"){e.preventDefault();setSelectedCartIdx(i=>Math.min(items.length-1,i+1));return;}
      if(e.key==="ArrowUp"){e.preventDefault();setSelectedCartIdx(i=>Math.max(0,i-1));return;}
      if((e.key==="+"||e.key==="=")&&selectedCartIdx>=0){const it=items[selectedCartIdx];if(it)updateQuantity(it.variantId,it.quantity+1);return;}
      if((e.key==="-"||e.key==="_")&&selectedCartIdx>=0){const it=items[selectedCartIdx];if(it)updateQuantity(it.variantId,it.quantity-1);return;}
      if(e.key==="Delete"&&selectedCartIdx>=0){const it=items[selectedCartIdx];if(it){removeItem(it.variantId);setSelectedCartIdx(i=>Math.max(-1,i-1));}return;}
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[posOpen,products,items,activePayment,selectedCartIdx,numpad,heldBills,showShortcuts,showCustomerSearch,selectedProductName,handleAddProduct,handleNumpad,handleCheckout,pinLocked,handlePinEntry,filteredProducts]);

  const saveNewCustomer = React.useCallback(async () => {
    if (!newCustFirst.trim() || !newCustPhone.trim()) { toast.error("First name and phone are required"); return; }
    setNewCustSaving(true);
    try {
      const res = await api.post<any>("/customers", { firstName: newCustFirst.trim(), lastName: newCustLast.trim()||undefined, phone: newCustPhone.trim(), email: newCustEmail.trim()||undefined });
      const c = res.data;
      const item: CustomerItem = { id:c.id, name:`${c.firstName} ${c.lastName??""}`.trim(), phone:c.phone, email:c.email, tier:c.tier?.toLowerCase(), loyaltyPoints:c.loyaltyPoints??0, walletBalance:c.walletBalance??0 };
      applyCustomer(item);
      setShowNewCust(false); setNewCustFirst(""); setNewCustLast(""); setNewCustPhone(""); setNewCustEmail("");
      setInlineCustomerSearch(""); setInlineCustomers([]);
    } catch(e:unknown){ toast.error((e as Error).message??"Failed to register customer"); }
    finally { setNewCustSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCustFirst, newCustLast, newCustPhone, newCustEmail]);

  //  Helper: set customer from CustomerItem 
  const applyCustomer = (c: CustomerItem) => {
    setCustomer({ id:c.id, name:c.name, phone:c.phone, email:c.email, membershipTier:(c.tier?.toLowerCase() as "bronze")??"bronze", loyaltyPoints:c.loyaltyPoints, totalPurchases:0, totalSpent:0, creditLimit:0, outstandingBalance:0, isActive:true, createdAt:new Date() });
    toast.success(`${c.name} added to bill`);
  };

  //  Center content per nav 
  const renderCenter = () => {
    // PRODUCTS
    if (activeNav === "products") return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b overflow-x-auto shrink-0 scrollbar-none" style={{borderColor:"#1e3356"}}>
          {categories.map(cat=>(
            <button key={cat} onClick={()=>setActiveCategory(cat)} className="px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-all" style={{background:activeCategory===cat?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"#1a2b4a",color:activeCategory===cat?"#fff":"#6a8ab8"}}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading?(<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):filteredProducts.length===0?(<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><Package className="h-12 w-12 mb-2 opacity-30"/><p className="text-sm">No products found</p></div>):(
            <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(165px,1fr))"}}>
              {filteredProducts.map(p=>{
                const varStock=p.stock;const lowStock=varStock>0&&varStock<=5;
                return (
                  <motion.div key={p.variantId} whileTap={{scale:0.96}} onClick={()=>handleCardClick(p)} className="rounded-xl overflow-hidden cursor-pointer group relative border transition-all hover:border-blue-500/50" style={{background:"#162338",borderColor:selectedProductName===p.productName?"#4f6ef7":"#1e3356"}}>
                    <div className="relative" style={{aspectRatio:"4/3",background:p.imageUrl?"#162338":getCardBg(p.color)}}>
                      {p.imageUrl?<img src={p.imageUrl} alt={p.productName} className="absolute inset-0 w-full h-full object-cover opacity-90"/>:<Package className="absolute inset-0 m-auto h-10 w-10 text-white/20"/>}
                      <div className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{background:varStock===0?"#dc2626":varStock<=5?"#d97706":"#16a34a"}}>{varStock}</div>
                      {varStock===0&&<div className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:"rgba(220,38,38,0.85)",color:"#fff"}}>Out of Stock</div>}{lowStock&&varStock>0&&<div className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:"rgba(217,119,6,0.9)",color:"#fff"}}>Low Stock</div>}
                      <button onClick={e=>{e.stopPropagation();setLiked(s=>{const n=new Set(s);n.has(p.variantId)?n.delete(p.variantId):n.add(p.variantId);return n;});}} className="absolute top-1.5 right-1.5 p-1 rounded-full" style={{background:"rgba(0,0,0,0.3)"}}><Heart className="h-3 w-3" style={{color:liked.has(p.variantId)?"#ef4444":"#fff",fill:liked.has(p.variantId)?"#ef4444":"none"}}/></button>
                      <button onClick={e=>{e.stopPropagation();handleCardClick(p);}} className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" style={{background:"#4f6ef7"}}><Plus className="h-3.5 w-3.5 text-white"/></button>
                    </div>
                    <div className="p-2"><p className="text-white text-sm font-semibold leading-tight line-clamp-1">{p.productName}</p><p className="text-xs mt-0.5 line-clamp-1" style={{color:"#6a8ab8"}}>{p.color??p.variantName}</p><p className="text-[10px] font-mono mt-0.5 line-clamp-1" style={{color:"#4a6a8a"}}>{p.sku}</p><p className="text-base font-bold mt-0.5" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</p></div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex border-t shrink-0" style={{height:"180px",borderColor:"#1e3356"}}>
          <div className="w-64 border-r flex flex-col shrink-0" style={{borderColor:"#1e3356"}}>
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}><span className="text-base font-bold text-white">Popular Items</span><button className="text-sm font-semibold" style={{color:"#4f6ef7"}}>View All</button></div>
            <div className="overflow-y-auto flex-1">{popularItems.map(p=>(<button key={p.variantId} onClick={()=>handleCardClick(p)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"><div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center" style={{background:getCardBg(p.color)}}><Package className="h-5 w-5 text-white/30"/></div><div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{p.productName}</p><p className="text-xs truncate" style={{color:"#6a8ab8"}}>{p.color}</p></div><span className="text-sm font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</span></button>))}</div>
          </div>
          <div className="flex-1 flex flex-col border-r" style={{borderColor:"#1e3356"}}>
            {selectedProductName&&activeVariant?(
              <div className="flex h-full">
                <div className="w-24 shrink-0 p-2 flex items-center justify-center border-r" style={{borderColor:"#1e3356"}}><div className="w-full aspect-square rounded-xl flex items-center justify-center" style={{background:getCardBg(activeVariant.color)}}><Package className="h-8 w-8 text-white/30"/></div></div>
                <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-y-auto">
                  <div className="flex items-start justify-between"><div><p className="text-white text-xs font-bold leading-tight">{activeVariant.productName}</p><p className="text-[10px]" style={{color:"#6a8ab8"}}>{activeVariant.variantName}</p></div><button onClick={()=>setSelectedProductName(null)} className="p-0.5 rounded hover:bg-white/10"><X className="h-3 w-3" style={{color:"#6a8ab8"}}/></button></div>
                  {getColors(selectedProductName).length>0&&(<div><p className="text-[10px] mb-1 font-semibold" style={{color:"#6a8ab8"}}>Color</p><div className="flex gap-1 flex-wrap">{getColors(selectedProductName).map(c=><button key={c} onClick={()=>setSelColor(c)} title={c} className="h-5 w-5 rounded-full border-2 transition-all" style={{background:getColorHex(c),borderColor:selColor===c?"#4f6ef7":"transparent"}}/>)}</div></div>)}
                  {getSizes(selectedProductName).length>0&&(<div><p className="text-[10px] mb-1 font-semibold" style={{color:"#6a8ab8"}}>Size</p><div className="flex gap-1 flex-wrap">{getSizes(selectedProductName).map(s=><button key={s} onClick={()=>setSelSize(s)} className="px-2 py-0.5 rounded text-[10px] font-bold border transition-all" style={{background:selSize===s?"#4f6ef7":"#1a2b4a",color:selSize===s?"#fff":"#6a8ab8",borderColor:selSize===s?"#4f6ef7":"#1e3356"}}>{s}</button>)}</div></div>)}
                  <div className="flex items-center justify-between mt-auto"><div><p className="text-white text-sm font-bold">LKR {formatNumber(activeVariant.unitPrice)}</p><p className="text-[10px]" style={{color:"#6a8ab8"}}>Stock: {activeVariant.stock} pcs</p></div><button onClick={()=>{if(activeVariant){handleAddProduct(activeVariant);setSelectedProductName(null);}}} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{background:"#4f6ef7"}}>Add to Cart</button></div>
                </div>
              </div>
            ):(<div className="flex flex-col items-center justify-center h-full" style={{color:"#4a6a8a"}}><ShoppingBag className="h-12 w-12 mb-2 opacity-30"/><p className="text-base font-semibold">Click a product to select variant</p></div>)}
          </div>
          <div className="w-80 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}><span className="text-base font-bold text-white">Recent Scan</span>{recentScans.length>0&&<button onClick={()=>setRecentScans([])} className="p-1 rounded hover:bg-white/10"><Trash2 className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>}</div>
            <div className="overflow-y-auto flex-1">{recentScans.length===0?<div className="flex flex-col items-center justify-center h-full" style={{color:"#4a6a8a"}}><Scan className="h-10 w-10 mb-2 opacity-30"/><p className="text-sm font-semibold">No recent scans</p></div>:recentScans.map(s=>(<div key={s.id} className="flex items-center gap-3 px-3 py-2.5 border-b" style={{borderColor:"#1a2b3a"}}><Scan className="h-4 w-4 shrink-0" style={{color:"#4f6ef7"}}/><div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{s.name}</p><p className="text-xs truncate" style={{color:"#6a8ab8"}}>{s.variant}</p></div><span className="text-sm font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(s.price)}</span></div>))}</div>
          </div>
        </div>
      </div>
    );

    // CART DETAIL
    if (activeNav === "cart") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between shrink-0"><h2 className="text-white font-bold text-base">Current Order</h2>{customer&&<div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{background:"rgba(79,110,247,0.15)",border:"1px solid rgba(79,110,247,0.3)"}}><div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{customer.name?.[0]}</div><span className="text-white text-xs font-semibold">{customer.name}</span><button onClick={()=>setCustomer(null)} className="ml-1"><X className="h-3 w-3" style={{color:"#6a8ab8"}}/></button></div>}</div>
        <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"#1e3356"}}>
          {items.length===0?(<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><ShoppingCart className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">Cart is empty  add products from Products tab</p></div>):(
            <table className="w-full text-sm">
              <thead><tr style={{borderBottom:"1px solid #1e3356"}}>{["Product","Variant","Qty","Unit Price","Total",""].map(h=><th key={h} className="text-left px-3 py-2 text-[11px] font-semibold" style={{color:"#6a8ab8"}}>{h}</th>)}</tr></thead>
              <tbody>{items.map((item,idx)=>(<tr key={item.variantId} onClick={()=>setSelectedCartIdx(idx)} className="transition-colors cursor-pointer" style={{background:selectedCartIdx===idx?"rgba(79,110,247,0.1)":"transparent",borderBottom:"1px solid #1a2b3a"}}>
                <td className="px-3 py-2"><p className="text-white text-xs font-semibold">{item.productName}</p></td>
                <td className="px-3 py-2"><p className="text-xs" style={{color:"#6a8ab8"}}>{item.variantName}</p></td>
                <td className="px-3 py-2"><div className="flex items-center gap-1"><button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity-1);}} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Minus className="h-3 w-3 text-white"/></button><span className="text-white text-xs font-bold w-6 text-center">{item.quantity}</span><button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity+1);}} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Plus className="h-3 w-3 text-white"/></button></div></td>
                <td className="px-3 py-2 text-xs font-mono" style={{color:"#6a8ab8"}}>LKR {formatNumber(item.unitPrice)}</td>
                <td className="px-3 py-2 text-xs font-bold font-mono text-white">LKR {formatNumber(item.unitPrice*item.quantity)}</td>
                <td className="px-3 py-2"><button onClick={e=>{e.stopPropagation();removeItem(item.variantId);}} className="p-1 rounded hover:bg-red-500/20 transition-colors"><Trash2 className="h-3.5 w-3.5" style={{color:"#ef4444"}}/></button></td>
              </tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 rounded-xl border p-3" style={{borderColor:"#1e3356",background:"#162338"}}>
          <p className="text-xs font-semibold mb-1.5" style={{color:"#6a8ab8"}}>Order Notes</p>
          <textarea value={cartNotes} onChange={e=>setCartNotes(e.target.value)} rows={2} placeholder="Add notes for this order..." className="w-full rounded-lg px-3 py-2 text-xs text-white outline-none resize-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
        </div>
      </div>
    );

    // CUSTOMERS
    if (activeNav === "customers") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        {/* Search bar + Register button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:"#6a8ab8"}}/>
            <input value={inlineCustomerSearch} onChange={e=>{setInlineCustomerSearch(e.target.value);setShowNewCust(false);}} placeholder="Search customer by name or phone..." className="w-full pl-9 pr-9 h-10 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
            {inlineCustLoading&&<Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{color:"#4f6ef7"}}/>}
          </div>
          <button onClick={()=>{setShowNewCust(s=>!s);setInlineCustomerSearch("");setInlineCustomers([]);}} className="flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-bold text-white shrink-0 transition-all hover:opacity-90" style={{background:showNewCust?"#162338":"#4f6ef7",border:showNewCust?"1px solid #4f6ef7":"none"}}>
            {showNewCust?<X className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{showNewCust?"Cancel":"Register New"}
          </button>
        </div>
        {/* Register form */}
        {showNewCust&&(
          <div className="shrink-0 rounded-2xl border p-4 space-y-3" style={{background:"#162338",borderColor:"#4f6ef7"}}>
            <p className="text-white font-bold text-sm flex items-center gap-2"><User className="h-4 w-4" style={{color:"#4f6ef7"}}/>Register New Customer</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"#6a8ab8"}}>First Name *</label><input value={newCustFirst} onChange={e=>setNewCustFirst(e.target.value)} placeholder="John" autoFocus className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"#6a8ab8"}}>Last Name</label><input value={newCustLast} onChange={e=>setNewCustLast(e.target.value)} placeholder="Doe" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"#6a8ab8"}}>Phone *</label><input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="077 123 4567" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"#6a8ab8"}}>Email</label><input type="email" value={newCustEmail} onChange={e=>setNewCustEmail(e.target.value)} placeholder="john@email.com" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/></div>
            </div>
            <button onClick={saveNewCustomer} disabled={newCustSaving||!newCustFirst.trim()||!newCustPhone.trim()} className="w-full h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#4f6ef7"}}>
              {newCustSaving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{newCustSaving?"Saving...":"Save & Add to Bill"}
            </button>
          </div>
        )}
        {/* Active bill customer */}
        {customer&&<div className="shrink-0 flex items-center gap-3 p-3 rounded-xl" style={{background:"rgba(79,110,247,0.1)",border:"1px solid rgba(79,110,247,0.3)"}}><div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{customer.name?.[0]}</div><div className="flex-1 min-w-0"><p className="text-white text-sm font-bold">{customer.name}</p><p className="text-xs" style={{color:"#6a8ab8"}}>{customer.phone} · <span className="capitalize">{customer.membershipTier}</span> · {customer.loyaltyPoints} pts</p></div><span className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}>Active Bill Customer</span><button onClick={()=>setCustomer(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></div>}
        {/* Search results */}
        <div className="flex-1 overflow-y-auto">
          {inlineCustomers.length===0&&!inlineCustomerSearch&&!showNewCust&&<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><Users className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">Search existing or register a new customer</p></div>}
          {inlineCustomers.length===0&&inlineCustomerSearch&&!inlineCustLoading&&(
            <div className="flex flex-col items-center justify-center h-40 gap-3" style={{color:"#4a6a8a"}}>
              <AlertCircle className="h-8 w-8 opacity-30"/>
              <p className="text-sm">No customers found</p>
              <button onClick={()=>{setShowNewCust(true);if(/^\d+$/.test(inlineCustomerSearch.trim()))setNewCustPhone(inlineCustomerSearch.trim());setInlineCustomerSearch("");setInlineCustomers([]);}} className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-sm font-bold text-white" style={{background:"#4f6ef7"}}><Plus className="h-4 w-4"/>Register New Customer</button>
            </div>
          )}
          <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
            {inlineCustomers.map(c=>(
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:border-blue-500/40" style={{background:"#162338",borderColor:"#1e3356"}}>
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{c.name?.[0]}</div>
                <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold truncate">{c.name}</p><p className="text-xs truncate" style={{color:"#6a8ab8"}}>{c.phone}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] font-bold capitalize" style={{color:TIER_COLOR[c.tier?.toLowerCase()??"bronze"]}}>{c.tier??"—"}</span><span className="text-[10px]" style={{color:"#4a6a8a"}}>{c.loyaltyPoints} pts</span></div></div>
                <button onClick={()=>applyCustomer(c)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 shrink-0" style={{background:customer?.id===c.id?"#10b981":"#4f6ef7"}}>{customer?.id===c.id?"? Active":"Set"}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    // HOLD BILLS
    if (activeNav === "hold-bills") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between shrink-0"><h2 className="text-white font-bold text-base">Held Bills <span className="text-sm font-normal" style={{color:"#6a8ab8"}}>({heldBills.length})</span></h2><button onClick={()=>{if(items.length>0){holdBill();toast.success("Current bill held");}else toast.info("Cart is empty");}} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold text-white" style={{background:"#4f6ef7"}}><PauseCircle className="h-3.5 w-3.5"/>Hold Current Bill</button></div>
        {heldBills.length===0?(<div className="flex flex-col items-center justify-center flex-1" style={{color:"#4a6a8a"}}><PauseCircle className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm font-medium">No bills on hold</p><p className="text-xs mt-1">Hold the current cart with F3 or the button above</p></div>):(
          <div className="flex-1 overflow-y-auto grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",alignContent:"start"}}>
            {[...heldBills].reverse().map((bill,idx)=>{
              const billTotal=bill.items.reduce((a,i)=>a+i.unitPrice*i.quantity,0);
              return (
                <div key={bill.id} className="rounded-xl border p-3 flex flex-col gap-2" style={{background:"#162338",borderColor:"#1e3356"}}>
                  <div className="flex items-start justify-between"><div><p className="text-white text-xs font-bold">Bill #{heldBills.length-idx}</p><p className="text-[10px]" style={{color:"#6a8ab8"}}>{new Date(bill.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}  {bill.items.length} item(s)</p></div><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b"}}>On Hold</span></div>
                  {bill.customer&&<div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{background:"rgba(79,110,247,0.1)"}}><User className="h-3 w-3" style={{color:"#4f6ef7"}}/><span className="text-xs text-white">{bill.customer.name}</span></div>}
                  <div className="space-y-0.5">{bill.items.slice(0,3).map(i=><div key={i.variantId} className="flex justify-between text-[10px]"><span className="truncate flex-1 mr-2" style={{color:"#a0b4d4"}}>{i.productName} {i.variantName} ×{i.quantity}</span><span className="font-mono" style={{color:"#6a8ab8"}}>LKR {formatNumber(i.unitPrice*i.quantity)}</span></div>)}{bill.items.length>3&&<p className="text-[10px]" style={{color:"#4a6a8a"}}>+{bill.items.length-3} more items</p>}</div>
                  <div className="flex items-center justify-between pt-1 border-t" style={{borderColor:"#1e3356"}}><span className="text-white text-sm font-bold">LKR {formatNumber(billTotal)}</span><div className="flex gap-2"><button onClick={()=>{deleteHeldBill(bill.id);toast.info("Bill removed");}} className="px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80" style={{background:"rgba(239,68,68,0.15)",color:"#ef4444"}}>Delete</button><button onClick={()=>{restoreHeldBill(bill.id);toast.success("Bill restored");setActiveNav("products");}} className="px-2.5 h-7 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90" style={{background:"#10b981"}}>Restore</button></div></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

    // ORDERS
    if (activeNav === "orders") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between shrink-0"><h2 className="text-white font-bold text-base">Recent Orders</h2><button onClick={loadOrders} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold border transition-all hover:bg-white/10" style={{borderColor:"#1e3356",color:"#6a8ab8"}}><RefreshCw className={cn("h-3.5 w-3.5",ordersLoading&&"animate-spin")}/>Refresh</button></div>
        {ordersLoading?(<div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):orders.length===0?(<div className="flex flex-col items-center justify-center flex-1" style={{color:"#4a6a8a"}}><FileText className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm">No recent orders</p></div>):(
          <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"#1e3356"}}>
            <table className="w-full text-sm">
              <thead style={{position:"sticky",top:0,background:"#0f1f3a"}}><tr>{["Invoice","Customer","Items","Total","Method","Time","Status"].map(h=><th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{color:"#6a8ab8",borderBottom:"1px solid #1e3356"}}>{h}</th>)}</tr></thead>
              <tbody>{orders.map((o,i)=>{const st=STATUS_STYLE[o.status]??{bg:"rgba(100,100,100,0.15)",color:"#9ca3af"};return(<tr key={o.id} style={{borderBottom:"1px solid #1a2b3a",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                <td className="px-3 py-2 font-mono text-xs font-bold" style={{color:"#4f6ef7"}}>{o.invoiceNumber}</td>
                <td className="px-3 py-2 text-xs text-white">{o.customer?.name??"Walk-in"}</td>
                <td className="px-3 py-2 text-xs" style={{color:"#6a8ab8"}}>{o._count?.items??0}</td>
                <td className="px-3 py-2 text-xs font-bold font-mono text-white">LKR {formatNumber(o.total)}</td>
                <td className="px-3 py-2 text-xs" style={{color:"#6a8ab8"}}>{o.payments?.[0]?.method??"-"}</td>
                <td className="px-3 py-2 text-xs" style={{color:"#6a8ab8"}}>{new Date(o.invoiceDate).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
                <td className="px-3 py-2"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:st.bg,color:st.color}}>{o.status}</span></td>
              </tr>);})}</tbody>
            </table>
          </div>
        )}
      </div>
    );

    // RETURNS FLOW
    if (activeNav === "returns") {
      const REASONS = [{v:"DEFECTIVE",l:"Defective"},{v:"WRONG_ITEM",l:"Wrong Item"},{v:"SIZE_ISSUE",l:"Size Issue"},{v:"CUSTOMER_CHANGED_MIND",l:"Changed Mind"},{v:"DAMAGED",l:"Damaged"},{v:"OTHER",l:"Other"}];
      const selectedItems = Array.from(returnItems.entries()).filter(([,s])=>s.qty>0);
      const refundTotal = selectedItems.reduce((a,[,s])=>a+s.unitPrice*s.qty,0);
      const selectedExchangeItems = Array.from(exchangeItems.entries()).filter(([,s])=>s.qty>0);
      const exchangeTotal = selectedExchangeItems.reduce((a,[,s])=>a+s.unitPrice*s.qty,0);
      const netRefund = returnType === "EXCHANGE" ? Math.max(0, refundTotal - exchangeTotal) : refundTotal;
      const exchangeDue = returnType === "EXCHANGE" ? Math.max(0, exchangeTotal - refundTotal) : 0;
      const exchangeProducts = products.filter(p=>{const q=exchangeSearch.toLowerCase();return !q||p.productName.toLowerCase().includes(q)||p.variantName.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||p.color?.toLowerCase().includes(q)||p.size?.toLowerCase().includes(q);}).slice(0,30);

      const searchSale = async () => {
        if (!returnQuery.trim()) return;
        setReturnSearchLoading(true);
        try { const r = await api.get<{data?:SaleRow[]}>(`/sales?search=${encodeURIComponent(returnQuery)}&limit=5`); setReturnSearchRes(r.data?.data??[]); if((r.data?.data??[]).length===0) toast.error("No sales found"); }
        catch { toast.error("Search failed"); } finally { setReturnSearchLoading(false); }
      };

      const selectSale = async (row: SaleRow) => {
        setReturnSaleLoading(true);
        try {
          const r = await api.get<SaleDetail>(`/sales/${row.id}`);
          setReturnSale(r.data);
          const m = new Map<string,ReturnItemSel>();
          for (const it of r.data.items) m.set(it.variantId, { qty: it.quantity, unitPrice: it.unitPrice, name: `${it.productName} ${it.variantName}`.trim(), maxQty: it.quantity });
          setReturnItems(m); setReturnStep("items");
        } catch { toast.error("Failed to load sale"); } finally { setReturnSaleLoading(false); }
      };

      const submitReturn = async () => {
        if (!returnSale || !returnReason || !selectedItems.length) return;
        if (returnType === "EXCHANGE" && !selectedExchangeItems.length) { toast.error("Select exchange item"); return; }
        setReturnSubmitting(true);
        try {
          const r = await api.post<{returnNumber:string;refundAmount:number}>("/returns", { originalSaleId:returnSale.id, reason:returnReason, returnType, notes:returnNotes, restockItems:returnRestock, items:selectedItems.map(([variantId,s])=>({variantId,quantity:s.qty,unitPrice:s.unitPrice})), exchangeItems:returnType==="EXCHANGE"?selectedExchangeItems.map(([variantId,s])=>({variantId,quantity:s.qty,unitPrice:s.unitPrice,productName:s.name,variantName:s.name,sku:products.find(p=>p.variantId===variantId)?.sku})):undefined });
          setReturnResult({returnNumber:r.data.returnNumber,refundAmount:r.data.refundAmount});
          setReturnStep("done"); toast.success(`Return ${r.data.returnNumber} created`);
        } catch(e:unknown){ toast.error((e as Error).message??"Return failed"); } finally { setReturnSubmitting(false); }
      };

      return (
        <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
          {/* HEADER + STEPS */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-base">Process Return</h2>
              <div className="flex items-center gap-1">
                {["search","items","confirm","done"].map((s,i)=>(
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1">
                      <div className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{background:["search","items","confirm","done"].indexOf(returnStep)>=i?"#4f6ef7":"#1a2b4a",color:["search","items","confirm","done"].indexOf(returnStep)>=i?"#fff":"#4a6a8a"}}>{i+1}</div>
                      <span className="text-[10px] capitalize" style={{color:["search","items","confirm","done"].indexOf(returnStep)>=i?"#a0b4d4":"#4a6a8a"}}>{s=="search"?"Find Sale":s=="items"?"Select Items":s=="confirm"?"Confirm":"Done"}</span>
                    </div>
                    {i<3&&<div className="w-6 h-px mx-1" style={{background:"#1e3356"}}/>}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {returnStep !== "search" && returnStep !== "done" && (
              <button onClick={()=>{setReturnStep("search");setReturnSale(null);setReturnSearchRes([]);}} className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs" style={{color:"#6a8ab8",border:"1px solid #1e3356"}}>? Back to Search</button>
            )}
          </div>

          {/* STEP 1: SEARCH */}
          {returnStep==="search"&&(
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex gap-2">
                <input value={returnQuery} onChange={e=>setReturnQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchSale()} placeholder="Enter invoice number or customer phone..." className="flex-1 h-10 px-4 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
                <button onClick={searchSale} disabled={returnSearchLoading||!returnQuery.trim()} className="px-5 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50 transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>{returnSearchLoading?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}Search</button>
              </div>
              {returnSearchRes.length > 0 && (
                <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"#1e3356"}}>
                  <div className="px-3 py-2 border-b" style={{borderColor:"#1e3356"}}><p className="text-xs font-semibold" style={{color:"#6a8ab8"}}>{returnSearchRes.length} sale(s) found — click to select</p></div>
                  {returnSearchRes.map(row=>(
                    <button key={row.id} onClick={()=>selectSale(row)} disabled={returnSaleLoading} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b" style={{borderColor:"#1a2b3a"}}>
                      {returnSaleLoading?<Loader2 className="h-4 w-4 animate-spin shrink-0" style={{color:"#4f6ef7"}}/>:<RotateCcw className="h-4 w-4 shrink-0" style={{color:"#4f6ef7"}}/>}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm font-mono">{row.invoiceNumber}</p>
                        <p className="text-xs" style={{color:"#6a8ab8"}}>{row.customer?.name??"Walk-in"} · {new Date(row.invoiceDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold text-sm">LKR {formatNumber(row.total)}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:STATUS_STYLE[row.status]?.bg??"rgba(100,100,100,0.15)",color:STATUS_STYLE[row.status]?.color??"#9ca3af"}}>{row.status}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{color:"#4a6a8a"}}/>
                    </button>
                  ))}
                </div>
              )}
              {returnSearchRes.length===0&&!returnSearchLoading&&(
                <div className="flex flex-col items-center justify-center flex-1" style={{color:"#4a6a8a"}}><RotateCcw className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm font-medium">Search a sale to start a return</p><p className="text-xs mt-1">Enter invoice number like INV-001 or customer phone</p></div>
              )}
            </div>
          )}

          {/* STEP 2: SELECT ITEMS + REASON */}
          {returnStep==="items"&&returnSale&&(
            <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl border" style={{background:"#162338",borderColor:"#1e3356"}}>
                  <div><p className="text-white font-bold text-sm font-mono">{returnSale.invoiceNumber}</p><p className="text-xs" style={{color:"#6a8ab8"}}>{returnSale.customer?.name??"Walk-in"} · {new Date(returnSale.invoiceDate).toLocaleDateString()}</p></div>
                  <div className="ml-auto text-right"><p className="text-white font-bold">LKR {formatNumber(returnSale.total)}</p><span className="text-[10px]" style={{color:STATUS_STYLE[returnSale.status]?.color??"#9ca3af"}}>{returnSale.status}</span></div>
                </div>
                <p className="text-xs font-semibold shrink-0" style={{color:"#6a8ab8"}}>SELECT ITEMS TO RETURN</p>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {returnSale.items.map(it=>{
                    const sel=returnItems.get(it.variantId);
                    const isSelected=(sel?.qty??0)>0;
                    return(
                      <div key={it.variantId} className="flex items-center gap-3 p-2.5 rounded-xl border transition-all" style={{background:isSelected?"rgba(79,110,247,0.1)":"#162338",borderColor:isSelected?"#4f6ef7":"#1e3356"}}>
                        <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur){n.set(it.variantId,{...cur,qty:cur.qty>0?0:cur.maxQty});}return n;})} className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all" style={{background:isSelected?"#4f6ef7":"transparent",borderColor:isSelected?"#4f6ef7":"#2a3a5c"}}>{isSelected&&<Check className="h-3 w-3 text-white"/>}</button>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold truncate">{it.productName}</p>
                          <p className="text-[10px] truncate" style={{color:"#6a8ab8"}}>{it.variantName} · SKU: {it.sku}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur&&cur.qty>0)n.set(it.variantId,{...cur,qty:cur.qty-1});return n;})} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Minus className="h-3 w-3 text-white"/></button>
                          <span className="text-white text-xs font-bold w-6 text-center">{sel?.qty??0}</span>
                          <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur&&cur.qty<cur.maxQty)n.set(it.variantId,{...cur,qty:cur.qty+1});return n;})} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Plus className="h-3 w-3 text-white"/></button>
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <p className="text-white text-xs font-bold">LKR {formatNumber(it.unitPrice * (sel?.qty??0))}</p>
                          <p className="text-[10px]" style={{color:"#6a8ab8"}}>of {it.quantity} · LKR {formatNumber(it.unitPrice)} ea</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {returnType==="EXCHANGE"&&(
                  <div className="shrink-0 rounded-xl border p-2 space-y-2" style={{background:"#0f1f3a",borderColor:"#1e3356",maxHeight:"230px"}}>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold shrink-0" style={{color:"#6a8ab8"}}>EXCHANGE ITEM</p>
                      <input value={exchangeSearch} onChange={e=>setExchangeSearch(e.target.value)} placeholder="Search product / SKU..." className="flex-1 h-7 px-2 rounded-lg text-xs text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
                    </div>
                    <div className="grid gap-1 overflow-y-auto" style={{gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",maxHeight:"170px"}}>
                      {exchangeProducts.map(p=>{
                        const ex=exchangeItems.get(p.variantId);
                        return(
                          <div key={p.variantId} className="flex items-center gap-2 p-2 rounded-lg border" style={{background:(ex?.qty??0)>0?"rgba(79,110,247,0.12)":"#162338",borderColor:(ex?.qty??0)>0?"#4f6ef7":"#1e3356"}}>
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{background:getCardBg(p.color)}}><Package className="h-4 w-4 text-white/30"/></div>
                            <div className="flex-1 min-w-0"><p className="text-white text-[11px] font-semibold truncate">{p.productName}</p><p className="text-[10px] truncate" style={{color:"#6a8ab8"}}>{p.variantName} · {p.sku}</p></div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={()=>setExchangeItems(m=>{const n=new Map(m);const cur=n.get(p.variantId);if(cur&&cur.qty>0)n.set(p.variantId,{...cur,qty:cur.qty-1});return n;})} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Minus className="h-2.5 w-2.5 text-white"/></button>
                              <span className="text-white text-xs font-bold w-4 text-center">{ex?.qty??0}</span>
                              <button onClick={()=>setExchangeItems(m=>{const n=new Map(m);const cur=n.get(p.variantId);n.set(p.variantId,{qty:(cur?.qty??0)+1,unitPrice:p.unitPrice,name:`${p.productName} ${p.variantName}`.trim(),maxQty:p.stock});return n;})} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Plus className="h-2.5 w-2.5 text-white"/></button>
                            </div>
                            <p className="text-[10px] font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="w-56 flex flex-col gap-2 shrink-0">
                <p className="text-xs font-semibold" style={{color:"#6a8ab8"}}>RETURN TYPE</p>
                <div className="grid grid-cols-2 gap-1">
                  {[{v:"RETURN",l:"Refund"},{v:"EXCHANGE",l:"Exchange"}].map(t=>(
                    <button key={t.v} onClick={()=>setReturnType(t.v as "RETURN"|"EXCHANGE")} className="h-8 rounded-xl text-xs font-bold transition-all border" style={{background:returnType===t.v?"#4f6ef7":"#162338",borderColor:returnType===t.v?"#4f6ef7":"#1e3356",color:returnType===t.v?"#fff":"#6a8ab8"}}>{t.l}</button>
                  ))}
                </div>
                <p className="text-xs font-semibold" style={{color:"#6a8ab8"}}>RETURN REASON <span className="text-red-400">*</span></p>
                <div className="space-y-1">
                  {REASONS.map(r=>(
                    <button key={r.v} onClick={()=>setReturnReason(r.v)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border" style={{background:returnReason===r.v?"rgba(79,110,247,0.2)":"#162338",borderColor:returnReason===r.v?"#4f6ef7":"#1e3356",color:returnReason===r.v?"#fff":"#6a8ab8"}}>
                      {returnReason===r.v&&<Check className="h-3.5 w-3.5 shrink-0" style={{color:"#4f6ef7"}}/>}
                      {r.l}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-semibold mt-1" style={{color:"#6a8ab8"}}>NOTES (optional)</p>
                <textarea value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} rows={3} placeholder="Additional notes..." className="rounded-xl px-3 py-2 text-xs text-white outline-none resize-none" style={{background:"#162338",border:"1px solid #1e3356"}}/>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer border" style={{background:returnRestock?"rgba(16,185,129,0.1)":"#162338",borderColor:returnRestock?"rgba(16,185,129,0.4)":"#1e3356"}}>
                  <input type="checkbox" checked={returnRestock} onChange={e=>setReturnRestock(e.target.checked)} className="w-4 h-4 rounded accent-green-500"/>
                  <span className="text-xs font-semibold" style={{color:returnRestock?"#10b981":"#6a8ab8"}}>Restock returned items</span>
                </label>
                <div className="mt-auto p-3 rounded-xl border" style={{background:"#162338",borderColor:"#1e3356"}}>
                  <p className="text-xs" style={{color:"#6a8ab8"}}>Items selected: {selectedItems.length}</p>
                  <p className="text-white font-bold text-lg mt-1">LKR {formatNumber(refundTotal)}</p>
                  <p className="text-[10px]" style={{color:"#6a8ab8"}}>{returnType==="EXCHANGE"?"Return item value":"Refund amount"}</p>
                  {returnType==="EXCHANGE"&&(
                    <div className="mt-2 pt-2 border-t space-y-1" style={{borderColor:"#1e3356"}}>
                      <div className="flex justify-between text-[10px]" style={{color:"#6a8ab8"}}><span>Exchange</span><span>LKR {formatNumber(exchangeTotal)}</span></div>
                      <div className="flex justify-between text-[10px]" style={{color:exchangeDue>0?"#f59e0b":"#10b981"}}><span>{exchangeDue>0?"Customer Pays":"Refund"}</span><span>LKR {formatNumber(exchangeDue>0?exchangeDue:netRefund)}</span></div>
                    </div>
                  )}
                </div>
                <button onClick={()=>{if(!returnReason){toast.error("Select a reason");return;}if(!selectedItems.length){toast.error("Select at least one item");return;}setReturnStep("confirm");}} className="w-full h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>Review Return ?</button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {returnStep==="confirm"&&returnSale&&(
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              <div className="rounded-xl border p-4" style={{background:"#162338",borderColor:"#1e3356"}}>
                <p className="text-xs font-semibold mb-3" style={{color:"#6a8ab8"}}>RETURN SUMMARY</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[{l:"Original Invoice",v:returnSale.invoiceNumber},{l:"Customer",v:returnSale.customer?.name??"Walk-in"},{l:"Type",v:returnType==="EXCHANGE"?"Exchange":"Refund"},{l:"Reason",v:REASONS.find(r=>r.v===returnReason)?.l??returnReason},{l:"Restock Items",v:returnRestock?"Yes":"No"},...(returnType==="EXCHANGE"?[{l:exchangeDue>0?"Customer Pays":"Refund",v:`LKR ${formatNumber(exchangeDue>0?exchangeDue:netRefund)}`}]:[])].map(f=>(
                    <div key={f.l}><p className="text-[10px]" style={{color:"#6a8ab8"}}>{f.l}</p><p className="text-white text-xs font-semibold mt-0.5" style={f.l==="Customer Pays"?{color:"#f59e0b"}:f.l==="Refund"?{color:"#10b981"}:{}}>{f.v}</p></div>
                  ))}
                </div>
                {returnNotes&&<div className="mt-2"><p className="text-[10px]" style={{color:"#6a8ab8"}}>Notes</p><p className="text-white text-xs mt-0.5">{returnNotes}</p></div>}
              </div>
              <p className="text-xs font-semibold" style={{color:"#6a8ab8"}}>ITEMS BEING RETURNED</p>
              <div className="space-y-1">
                {selectedItems.map(([variantId,sel])=>(
                  <div key={variantId} className="flex items-center justify-between p-2.5 rounded-xl border" style={{background:"#162338",borderColor:"#1e3356"}}>
                    <p className="text-white text-xs font-semibold">{sel.name}</p>
                    <p className="text-xs font-mono" style={{color:"#6a8ab8"}}>×{sel.qty} · <span className="text-white font-bold">LKR {formatNumber(sel.unitPrice*sel.qty)}</span></p>
                  </div>
                ))}
              </div>
              {returnType==="EXCHANGE"&&(
                <>
                  <p className="text-xs font-semibold" style={{color:"#6a8ab8"}}>EXCHANGE ITEMS</p>
                  <div className="space-y-1">
                    {selectedExchangeItems.map(([variantId,sel])=>(
                      <div key={variantId} className="flex items-center justify-between p-2.5 rounded-xl border" style={{background:"#162338",borderColor:"#1e3356"}}>
                        <p className="text-white text-xs font-semibold">{sel.name}</p>
                        <p className="text-xs font-mono" style={{color:"#6a8ab8"}}>×{sel.qty} · <span className="text-white font-bold">LKR {formatNumber(sel.unitPrice*sel.qty)}</span></p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="flex justify-between items-center p-4 rounded-xl border mt-1" style={{background:exchangeDue>0?"rgba(245,158,11,0.08)":"rgba(16,185,129,0.08)",borderColor:exchangeDue>0?"rgba(245,158,11,0.3)":"rgba(16,185,129,0.3)"}}>
                <div>
                  <p className="text-xs" style={{color:exchangeDue>0?"#f59e0b":"#10b981"}}>{exchangeDue>0?"Customer Pays Balance":"Total Refund Amount"}</p>
                  <p className="text-2xl font-bold text-white mt-0.5">LKR {formatNumber(exchangeDue>0?exchangeDue:netRefund)}</p>
                  {returnType==="EXCHANGE"&&<p className="text-[10px] mt-1" style={{color:"#6a8ab8"}}>Returned LKR {formatNumber(refundTotal)} - Exchange LKR {formatNumber(exchangeTotal)}</p>}
                </div>
                <button onClick={submitReturn} disabled={returnSubmitting} className="flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>{returnSubmitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}Confirm {returnType==="EXCHANGE"?"Exchange":"Return"}</button>
              </div>
            </div>
          )}

          {/* STEP 4: DONE */}
          {returnStep==="done"&&returnResult&&(
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{background:exchangeDue>0?"rgba(245,158,11,0.15)":"rgba(16,185,129,0.15)"}}>
                <CheckCircle2 className="h-10 w-10" style={{color:exchangeDue>0?"#f59e0b":"#10b981"}}/>
              </div>
              <div className="text-center">
                <h3 className="text-white font-bold text-xl">{returnType==="EXCHANGE"?"Exchange":"Return"} Processed!</h3>
                <p className="text-xs mt-1 font-mono" style={{color:"#6a8ab8"}}>{returnResult.returnNumber}</p>
              </div>
              <div className="rounded-2xl border w-full max-w-sm overflow-hidden" style={{background:"#162338",borderColor:"#1e3356"}}>
                {returnType==="EXCHANGE"&&(
                  <div className="px-5 pt-4 pb-3 space-y-2 border-b" style={{borderColor:"#1e3356"}}>
                    <div className="flex justify-between text-sm"><span style={{color:"#6a8ab8"}}>Returned value</span><span className="text-white font-semibold">LKR {formatNumber(refundTotal)}</span></div>
                    <div className="flex justify-between text-sm"><span style={{color:"#6a8ab8"}}>Exchange value</span><span className="text-white font-semibold">LKR {formatNumber(exchangeTotal)}</span></div>
                  </div>
                )}
                <div className="px-5 py-4 text-center">
                  {returnType==="EXCHANGE"&&exchangeDue>0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#f59e0b"}}>Customer Pays Balance</p>
                    <p className="text-4xl font-bold" style={{color:"#f59e0b"}}>LKR {formatNumber(exchangeDue)}</p>
                    <p className="text-xs mt-2" style={{color:"#6a8ab8"}}>Collect from customer before completing exchange</p>
                  </>)}
                  {returnType==="EXCHANGE"&&exchangeDue===0&&netRefund>0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#10b981"}}>Refund to Customer</p>
                    <p className="text-4xl font-bold" style={{color:"#10b981"}}>LKR {formatNumber(netRefund)}</p>
                    <p className="text-xs mt-2" style={{color:"#6a8ab8"}}>Return the difference to customer</p>
                  </>)}
                  {returnType==="EXCHANGE"&&exchangeDue===0&&netRefund===0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#4f6ef7"}}>Even Exchange</p>
                    <p className="text-4xl font-bold" style={{color:"#4f6ef7"}}>LKR 0.00</p>
                    <p className="text-xs mt-2" style={{color:"#6a8ab8"}}>Equal value — no money changes hands</p>
                  </>)}
                  {returnType!=="EXCHANGE"&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#10b981"}}>Refund Amount</p>
                    <p className="text-4xl font-bold" style={{color:"#10b981"}}>LKR {formatNumber(returnResult.refundAmount)}</p>
                  </>)}
                  <p className="text-xs mt-3 font-semibold px-3 py-1 rounded-full inline-block" style={{background:"rgba(79,110,247,0.15)",color:"#4f6ef7"}}>INITIATED · Awaiting Approval</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{
                  const w=window.open("","_blank","width=380,height=600");if(!w)return;
                  const isExc=returnType==="EXCHANGE";
                  const balanceLine=isExc
                    ?(exchangeDue>0
                      ?`<div class="row tot amb"><span>CUSTOMER PAYS</span><span>LKR ${exchangeDue.toFixed(2)}</span></div>`
                      :(netRefund>0
                        ?`<div class="row tot grn"><span>REFUND</span><span>LKR ${netRefund.toFixed(2)}</span></div>`
                        :`<div class="row tot blu"><span>EVEN EXCHANGE</span><span>LKR 0.00</span></div>`))
                    :`<div class="row tot grn"><span>REFUND</span><span>LKR ${returnResult.refundAmount.toFixed(2)}</span></div>`;
                  const exchRows=isExc&&selectedExchangeItems.length>0?`<hr class="d"/><div class="label">EXCHANGE ITEMS</div>${selectedExchangeItems.map(([,s])=>`<div class="row"><span>${s.name} ×${s.qty}</span><span>LKR ${(s.unitPrice*s.qty).toFixed(2)}</span></div>`).join("")}<div class="row sub"><span>Exchange Total</span><span>LKR ${exchangeTotal.toFixed(2)}</span></div>`:"";
                  w.document.write(`<!DOCTYPE html><html><head><title>${isExc?"Exchange":"Return"} Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:6mm;max-width:80mm;margin:0 auto}h1{font-size:16px;font-weight:900;text-align:center}.sub{color:#666}.label{font-size:10px;font-weight:bold;margin:4px 0 2px}.d{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.tot{font-size:14px;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px}.grn span:last-child{color:#059669}.amb span:last-child{color:#b45309}.blu span:last-child{color:#2563eb}.foot{text-align:center;margin-top:8px;font-size:10px}@media print{@page{size:80mm auto}}</style></head><body><h1>${isExc?"EXCHANGE":"RETURN"} RECEIPT</h1><hr class="d"/><div class="row"><span>Ref:</span><span><b>${returnResult.returnNumber}</b></span></div><div class="row"><span>Date:</span><span>${new Date().toLocaleString()}</span></div><div class="row"><span>Invoice:</span><span>${returnSale?.invoiceNumber??""}</span></div><div class="row"><span>Customer:</span><span>${returnSale?.customer?.name??"Walk-in"}</span></div><div class="row"><span>Reason:</span><span>${REASONS.find(r=>r.v===returnReason)?.l??""}</span></div><hr class="d"/><div class="label">RETURNED ITEMS</div>${selectedItems.map(([,s])=>`<div class="row"><span>${s.name} ×${s.qty}</span><span>LKR ${(s.unitPrice*s.qty).toFixed(2)}</span></div>`).join("")}<div class="row sub"><span>Return Total</span><span>LKR ${refundTotal.toFixed(2)}</span></div>${exchRows}<hr class="d"/>${balanceLine}<div class="foot">*** ${isExc?"Exchange":"Return"} Processed · Awaiting Approval ***</div></body></html>`);
                  w.document.close();setTimeout(()=>{w.focus();w.print();setTimeout(()=>w.close(),500);},200);
                }} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10" style={{borderColor:"#1e3356",color:"#a0b4d4"}}><Printer className="h-4 w-4"/>Print Receipt</button>
                <button onClick={()=>{setReturnStep("search");setReturnQuery("");setReturnSearchRes([]);setReturnSale(null);setReturnItems(new Map());setReturnReason("");setReturnNotes("");setReturnRestock(true);setReturnResult(null);setReturnType("RETURN");setExchangeItems(new Map());setExchangeSearch("");}} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}><RotateCcw className="h-4 w-4"/>New Return</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // SETTINGS PANEL
    if (activeNav === "settings") {
      const pinIsSet = typeof window !== "undefined" && !!localStorage.getItem("pos_pin");
      return (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <h2 className="text-white font-bold text-xl">POS Settings</h2>
          {/* Tax Rate */}
          <div className="rounded-2xl border p-5" style={{background:"#162338",borderColor:"#1e3356"}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><Receipt className="h-5 w-5" style={{color:"#4f6ef7"}}/></div>
              <div><h3 className="text-white font-bold text-base">Tax Rate</h3><p className="text-xs mt-0.5" style={{color:"#6a8ab8"}}>Current: {taxRate}% {taxRate===0?"(Tax disabled)":""}</p></div>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" min="0" max="100" defaultValue={taxRate} onBlur={e=>{const v=Math.min(100,Math.max(0,parseFloat(e.target.value)||0));setTaxRate(v);toast.success(`Tax rate set to ${v}%`);}} className="w-28 h-10 px-3 rounded-xl text-white text-center text-sm font-bold outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
              <span className="text-white font-bold text-lg">%</span>
              <div className="flex gap-2 ml-2">{[0,5,10,15].map(v=>(<button key={v} onClick={()=>{setTaxRate(v);toast.success(`Tax rate set to ${v}%`);}} className="px-3 h-8 rounded-lg text-xs font-bold transition-all" style={{background:taxRate===v?"#4f6ef7":"#1a2b4a",color:taxRate===v?"#fff":"#6a8ab8"}}>{v}%</button>))}</div>
            </div>
          </div>
          {/* PIN Security */}
          <div className="rounded-2xl border p-5 space-y-4" style={{background:"#162338",borderColor:"#1e3356"}}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><Lock className="h-5 w-5" style={{color:"#4f6ef7"}}/></div>
              <div>
                <h3 className="text-white font-bold text-base">Screen Lock PIN</h3>
                <p className="text-xs mt-0.5" style={{color:"#6a8ab8"}}>{pinIsSet?"PIN is active — POS requires PIN on every open":"No PIN set — POS opens freely"}</p>
              </div>
              {pinIsSet&&<span className="ml-auto text-xs font-bold px-3 py-1 rounded-full" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}>Active</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{color:"#6a8ab8"}}>{pinIsSet?"New PIN":"Create PIN"} (4 digits)</label>
                <input type="password" maxLength={4} inputMode="numeric" value={settingNewPin} onChange={e=>setSettingNewPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" className="w-full h-10 px-4 rounded-xl text-white text-center text-lg tracking-widest outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{color:"#6a8ab8"}}>Confirm PIN</label>
                <input type="password" maxLength={4} inputMode="numeric" value={settingConfirmPin} onChange={e=>setSettingConfirmPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" className="w-full h-10 px-4 rounded-xl text-white text-center text-lg tracking-widest outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{if(settingNewPin.length!==4){toast.error("PIN must be 4 digits");return;}if(settingNewPin!==settingConfirmPin){toast.error("PINs do not match");return;}localStorage.setItem("pos_pin",settingNewPin);setSettingNewPin("");setSettingConfirmPin("");toast.success("PIN saved — screen will lock on next open");}} className="px-5 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>{pinIsSet?"Update PIN":"Save PIN"}</button>
              {pinIsSet&&<button onClick={()=>{localStorage.removeItem("pos_pin");setSettingNewPin("");setSettingConfirmPin("");toast.success("PIN removed");}} className="px-5 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10" style={{borderColor:"#ef4444",color:"#ef4444"}}>Remove PIN</button>}
              {pinIsSet&&<button onClick={()=>{setPinLocked(true);setPinEntry("");setPinError(false);}} className="px-5 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10 ml-auto" style={{borderColor:"#1e3356",color:"#6a8ab8"}}><Lock className="h-3.5 w-3.5 inline mr-1.5"/>Lock Now</button>}
            </div>
          </div>
          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            {([{icon:Tag,title:"Discounts & Promotions",path:"/promotions"},{icon:BarChart2,title:"Sales Reports",path:"/reports"},{icon:Settings,title:"System Settings",path:"/settings"},{icon:RefreshCw,title:"Reload Products",onClick:loadProducts,path:""}] as {icon:React.ElementType;title:string;path:string;onClick?:()=>void}[]).map((item,i)=>(
              item.path
                ?<a key={i} href={item.path} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:bg-white/5" style={{background:"#162338",borderColor:"#1e3356"}}><item.icon className="h-5 w-5 shrink-0" style={{color:"#4f6ef7"}}/><span className="text-white text-sm font-semibold">{item.title}</span><ExternalLink className="h-3.5 w-3.5 ml-auto" style={{color:"#4a6a8a"}}/></a>
                :<button key={i} onClick={item.onClick} className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:bg-white/5 text-left" style={{background:"#162338",borderColor:"#1e3356"}}><item.icon className="h-5 w-5 shrink-0" style={{color:"#4f6ef7"}}/><span className="text-white text-sm font-semibold">{item.title}</span></button>
            ))}
          </div>
        </div>
      );
    }

    // PLACEHOLDER for Discounts, Reports
    const PLACEHOLDERS: Record<string,{icon:React.ElementType;title:string;desc:string;path:string}> = {
      "discounts":{icon:Tag,title:"Discounts & Promotions",desc:"Create and manage discount codes, seasonal promotions and bundle offers.",path:"/promotions"},
      "reports":{icon:BarChart2,title:"Sales Reports",desc:"View detailed sales analytics, revenue trends and product performance charts.",path:"/reports"},
    };
    const p=PLACEHOLDERS[activeNav];
    if(p){const Icon=p.icon;return(
      <div className="flex flex-col items-center justify-center h-full" style={{color:"#4a6a8a"}}>
        <div className="rounded-2xl p-6 flex flex-col items-center gap-4 border" style={{background:"#162338",borderColor:"#1e3356",maxWidth:"360px"}}>
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><Icon className="h-8 w-8" style={{color:"#4f6ef7"}}/></div>
          <div className="text-center"><h3 className="text-white font-bold text-base mb-1">{p.title}</h3><p className="text-sm leading-relaxed" style={{color:"#6a8ab8"}}>{p.desc}</p></div>
          <a href={p.path} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>Open in Dashboard<ExternalLink className="h-3.5 w-3.5"/></a>
        </div>
      </div>
    );}
    return null;
  };

  if (!posOpen) return null;

  return (
    <AnimatePresence>
      <motion.div key="pos" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
        className={cn("fixed inset-0 z-[100] flex flex-col overflow-hidden",scanFlash&&"ring-4 ring-inset ring-green-500/70")}
        style={{background:"#0d1b2e"}}>

        {/* PIN LOCK SCREEN */}
        {pinLocked&&(
          <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-8" style={{background:"#0d1b2e"}}>
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-1" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}><Lock className="h-8 w-8 text-white"/></div>
              <h2 className="text-white font-bold text-2xl">POS Terminal</h2>
              <p className="text-sm" style={{color:"#6a8ab8"}}>Enter your PIN to unlock</p>
            </div>
            <div className="flex gap-4 mb-2">
              {[0,1,2,3].map(i=>(
                <div key={i} className="h-4 w-4 rounded-full transition-all duration-150" style={{background:pinEntry.length>i?(pinError?"#ef4444":"#4f6ef7"):"#1e3356",transform:pinError&&pinEntry.length===0?"translateX(0)":"none"}}/>
              ))}
            </div>
            {pinError&&<p className="text-sm font-semibold -mt-4" style={{color:"#ef4444"}}>Incorrect PIN. Try again.</p>}
            <div className="grid gap-3" style={{gridTemplateColumns:"repeat(3,80px)"}}>
              {[1,2,3,4,5,6,7,8,9].map(n=>(
                <button key={n} onClick={()=>handlePinEntry(String(n))} className="h-20 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 hover:bg-white/10" style={{background:"#162338",border:"1px solid #1e3356"}}>{n}</button>
              ))}
              <button onClick={()=>handlePinEntry("DEL")} className="h-20 rounded-2xl text-2xl font-bold transition-all active:scale-95 hover:bg-white/10" style={{background:"#162338",border:"1px solid #1e3356",color:"#6a8ab8"}}>?</button>
              <button onClick={()=>handlePinEntry("0")} className="h-20 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 hover:bg-white/10" style={{background:"#162338",border:"1px solid #1e3356"}}>0</button>
              <button onClick={closePos} className="h-20 rounded-2xl text-xs font-semibold transition-all active:scale-95 hover:bg-red-500/10" style={{background:"#162338",border:"1px solid #1e3356",color:"#6a8ab8"}}>Exit</button>
            </div>
            <p className="text-xs" style={{color:"#2a3a5c"}}>Logged in as {user?.name??"Admin"}</p>
          </div>
        )}

        {/* TOP BAR */}
        <div className="flex h-12 items-center gap-3 px-4 shrink-0 border-b" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
          <div className="flex items-center gap-2.5 shrink-0">
            <button onClick={closePos} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Menu className="h-4 w-4 text-white/60"/></button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}><ShoppingBag className="h-4 w-4 text-white"/></div>
              <div><p className="text-white font-bold text-sm leading-none">FashionERP</p><p className="text-[10px] leading-none" style={{color:"#6a8ab8"}}>POS Terminal</p></div>
            </div>
          </div>
          <div className="flex-1 relative mx-4 max-w-xl">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:"#6a8ab8"}}/>
            <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setActiveNav("products")} onKeyDown={e=>{if(e.key==="Enter"&&filteredProducts.length>0){e.preventDefault();handleAddProduct(filteredProducts[0]);setScanFlash(true);setTimeout(()=>setScanFlash(false),500);}}} placeholder="Scan barcode or search product..." className="w-full pl-9 pr-16 h-9 text-sm text-white placeholder:text-white/30 rounded-xl outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono rounded px-1.5 py-0.5" style={{background:"#2a3a5c",color:"#6a8ab8"}}>F2</kbd>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {[{label:"Hold Bill",key:"F3",icon:PauseCircle,onClick:()=>{if(items.length>0){holdBill();toast.success("Bill held");}}},{label:"Recent Bills",key:"",icon:Receipt,onClick:()=>setActiveNav("orders")},{label:"Customers",key:"F4",icon:Users,onClick:()=>{setActiveNav("customers");setShowCustomerSearch(false);}}].map((btn,i)=>(
              <button key={i} onClick={btn.onClick} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-medium transition-all hover:bg-white/10" style={{background:"#1a2b4a",color:"#a0b4d4"}}>
                <btn.icon className="h-3.5 w-3.5"/>{btn.label}{btn.key&&<span className="text-[10px] font-mono opacity-50 ml-0.5">{btn.key}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-semibold" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}><span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"/>Online</div>
            {heldBills.length>0&&<button onClick={()=>setActiveNav("hold-bills")} className="flex items-center gap-1 px-2.5 h-7 rounded-xl text-xs font-semibold" style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b"}}><PauseCircle className="h-3.5 w-3.5"/>{heldBills.length} Held</button>}
            <div className="flex items-center gap-2 pl-2 border-l" style={{borderColor:"#1e3356"}}>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{user?.name?.[0]??"A"}</div>
              <div><p className="text-white text-xs font-semibold leading-tight">{user?.name??"Admin"}</p><p className="text-[10px] leading-none" style={{color:"#6a8ab8"}}>Super Admin</p></div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* SIDEBAR */}
          <div className="w-44 flex flex-col shrink-0 border-r" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
            <nav className="flex-1 py-2 overflow-y-auto">
              {NAV_ITEMS.map(item=>{
                const active=activeNav===item.id;
                return (
                  <button key={item.id} onClick={()=>setActiveNav(item.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-base font-medium transition-all relative" style={{color:active?"#fff":"#6a8ab8",background:active?"rgba(79,110,247,0.2)":"transparent"}}>
                    {active&&<div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full" style={{background:"#4f6ef7"}}/>}
                    <item.icon className="h-4 w-4 shrink-0" style={{color:active?"#4f6ef7":"#6a8ab8"}}/>
                    {item.label}
                    {item.badge&&itemCount()>0&&<span className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none" style={{background:"#4f6ef7",color:"#fff"}}>{itemCount()}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="mx-2 mb-2 p-3 rounded-xl overflow-hidden shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>
              <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wide mb-1">Today Sales</p>
              <p className="text-white font-bold text-lg leading-tight">LKR {formatNumber(todayStats.sales)}</p>
              <svg viewBox="0 0 80 24" className="w-full mt-1.5 opacity-60" fill="none"><polyline points="0,20 15,14 30,16 45,8 60,10 80,2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p className="text-white/70 text-[10px] mt-1"> {todayStats.orders} Orders  {todayStats.items} Items</p>
            </div>
            <button onClick={()=>{const st=localStorage.getItem("pos_pin");if(st){setPinLocked(true);setPinEntry("");setPinError(false);}else closePos();}} className="flex items-center gap-2 mx-2 mb-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/10" style={{background:"rgba(255,255,255,0.05)",color:"#6a8ab8"}}>
              <Lock className="h-3.5 w-3.5"/>Lock Screen<span className="ml-auto text-[10px] opacity-50 font-mono">F12</span>
            </button>
          </div>

          {/* CENTER  dynamic content */}
          <div className="flex-1 min-w-0 overflow-hidden">{renderCenter()}</div>

          {/* CART PANEL */}
          <div className="w-[420px] flex flex-col shrink-0 border-l" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{borderColor:"#1e3356"}}>
              <span className="text-white font-bold text-lg">Cart ({itemCount()} Items)</span>
              <button onClick={()=>{clearCart();setSelectedCartIdx(-1);}} className="flex items-center gap-1.5 text-sm font-semibold hover:text-red-400 transition-colors" style={{color:"#ef4444"}}><Trash2 className="h-4 w-4"/>Clear Cart</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length===0?(
                <div className="flex flex-col items-center justify-center h-40" style={{color:"#4a6a8a"}}><ShoppingCart className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">Cart is empty</p></div>
              ):(
                <div className="p-3 space-y-2">
                  <AnimatePresence>{items.map((item,idx)=>(
                    <motion.div key={item.variantId} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                      onClick={()=>setSelectedCartIdx(idx)} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                      style={{background:selectedCartIdx===idx?"rgba(79,110,247,0.15)":"#162338",border:`1px solid ${selectedCartIdx===idx?"#4f6ef7":"#1e3356"}`}}>
                      <div className="h-12 w-12 rounded-lg shrink-0 flex items-center justify-center" style={{background:getCardBg(item.variantName)}}><Package className="h-6 w-6 text-white/20"/></div>
                      <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold truncate">{item.productName}</p><p className="text-xs truncate" style={{color:"#6a8ab8"}}>{item.variantName}</p></div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity-1);}} className="h-7 w-7 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Minus className="h-3.5 w-3.5 text-white"/></button>
                        <span className="text-white text-sm font-bold w-7 text-center">{item.quantity}</span>
                        <button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity+1);}} className="h-7 w-7 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Plus className="h-3.5 w-3.5 text-white"/></button>
                      </div>
                      <div className="text-right shrink-0 w-24 group">
                        <p className="text-white text-sm font-bold">LKR {formatNumber(item.unitPrice*item.quantity)}</p>
                        <button onClick={e=>{e.stopPropagation();removeItem(item.variantId);if(selectedCartIdx===idx)setSelectedCartIdx(-1);}} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-4 w-4 mx-auto" style={{color:"#ef4444"}}/></button>
                      </div>
                    </motion.div>
                  ))}</AnimatePresence>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t" style={{borderColor:"#1e3356"}}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{borderColor:"#1e3356"}}>
                <span className="text-sm font-medium shrink-0" style={{color:"#6a8ab8"}}>Discount %</span>
                <input type="number" min="0" max="100" value={discountInput} onChange={e=>setDiscountInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(discountInput)||0;setDiscount(v,"percentage");if(v>0)toast.success(`${v}% discount applied`);}}} placeholder={discount>0?`${discount}% active`:"0"} className="flex-1 h-9 rounded-lg px-3 text-sm text-white outline-none" style={{background:"#1a2b4a",border:`1px solid ${discount>0?"#10b981":"#1e3356"}`}}/>
                <button onClick={()=>{const v=parseFloat(discountInput)||0;setDiscount(v,"percentage");setDiscountInput("");if(v>0)toast.success(`${v}% discount applied`);else toast.info("Discount cleared");}} className="px-4 h-9 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>Apply</button>
              </div>
              <div className="px-4 py-3 space-y-1.5 border-b" style={{borderColor:"#1e3356"}}>
                <div className="flex justify-between text-sm" style={{color:"#6a8ab8"}}><span>Sub Total</span><span>LKR {formatNumber(subtotal())}</span></div>
                {discountAmount()>0&&<div className="flex justify-between text-sm text-green-400"><span>Discount</span><span>-LKR {formatNumber(discountAmount())}</span></div>}
                <div className="flex justify-between text-sm" style={{color:"#6a8ab8"}}><span>Tax ({taxRate}%)</span><span>LKR {formatNumber(taxAmount())}</span></div>
                <div className="flex justify-between text-xl font-bold text-white pt-2 border-t" style={{borderColor:"#1e3356"}}><span>Grand Total</span><span style={{color:"#4f6ef7"}}>LKR {formatNumber(totalAmt)}</span></div>
              </div>
              <div className="flex gap-1.5 px-3 py-2 border-b" style={{borderColor:"#1e3356"}}>
                {PAY_METHODS.map(({value,label,icon:Icon})=>(
                  <button key={value} onClick={()=>setActivePayment(value)} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-all" style={{background:activePayment===value?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"#1a2b4a",color:activePayment===value?"#fff":"#6a8ab8"}}>
                    <Icon className="h-4 w-4"/>{label}
                  </button>
                ))}
              </div>
              {activePayment==="CASH"&&(
                <div className="px-3 py-2 border-b" style={{borderColor:"#1e3356"}}>
                  <div className="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold" style={{color:"#6a8ab8"}}>Cash Received (LKR)</span><button onClick={()=>setNumpad("")} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></div>
                  <div className="h-11 rounded-xl flex items-center px-3 mb-2 text-green-400 font-bold text-2xl font-mono" style={{background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)"}}>{numpad?formatNumber(parseFloat(numpad)):"0.00"}</div>
                  <div className="grid gap-1" style={{gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
                    {[["7","8","9","500"],["4","5","6","1000"],["1","2","3","2000"],["0",".","DEL","5000"]].map((row,ri)=>row.map((k,ki)=>{
                      const isQuick=ki===3;const isDel=k==="DEL";
                      return(<button key={`${ri}-${ki}`} onClick={()=>isQuick?setNumpad(k):handleNumpad(k)} className="h-10 rounded-lg text-sm font-bold transition-all active:scale-95" style={{background:isQuick?"#1e3356":isDel?"rgba(239,68,68,0.15)":"#1a2b4a",color:isQuick?"#6a8ab8":isDel?"#ef4444":"#fff"}}>
                        {isDel?<Delete className="h-4 w-4 mx-auto"/>:k}
                      </button>);
                    }))}
                  </div>
                </div>
              )}
              {numpad&&parseFloat(numpad)>=totalAmt&&activePayment==="CASH"&&(
                <div className="flex justify-between items-center px-4 py-2 border-b" style={{borderColor:"#1e3356"}}>
                  <span className="text-sm font-semibold text-green-400">Change</span>
                  <span className="text-green-400 font-bold font-mono text-base">LKR {formatNumber(changeAmt)}</span>
                </div>
              )}
              <div className="p-3 flex gap-2">
                <button onClick={handleCheckout} disabled={checkoutLoading||items.length===0} className="flex-1 h-[52px] rounded-xl flex items-center justify-center gap-2 text-base font-bold text-white transition-all hover:opacity-90 disabled:opacity-40" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
                  {checkoutLoading?<Loader2 className="h-5 w-5 animate-spin"/>:<Check className="h-5 w-5"/>}
                  Confirm Payment<span className="text-xs opacity-70 font-mono">(F9)</span>
                </button>
                <button onClick={handleThermalPrint} className="h-[52px] w-[52px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-5 w-5" style={{color:"#6a8ab8"}}/></button>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="flex items-center gap-5 px-5 h-14 border-t shrink-0" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
          {[{label:"Today Sales",value:`LKR ${formatNumber(todayStats.sales)}`,color:"#4f6ef7"},{label:"Orders",value:String(todayStats.orders)},{label:"Items Sold",value:String(todayStats.items)},{label:"Avg. Bill",value:todayStats.orders>0?`LKR ${formatNumber(todayStats.sales/todayStats.orders)}`:"LKR 0.00"}].map(s=>(
            <div key={s.label} className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium" style={{color:"#4a6a8a"}}>{s.label}</span>
              <span className="text-sm font-bold" style={{color:s.color||"#fff"}}>{s.value}</span>
            </div>
          ))}
          <div className="flex-1"/>
          <div className="flex items-center gap-2 shrink-0" style={{color:"#10b981"}}><div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"/><span className="text-xs font-semibold">Barcode Scanner</span><span className="text-xs" style={{color:"#6a8ab8"}}>Connected</span></div>
          <div className="h-4 w-px" style={{background:"#1e3356"}}/>
          <div className="flex items-center gap-1.5 shrink-0" style={{color:"#6a8ab8"}}><Printer className="h-3.5 w-3.5"/><span className="text-xs">Printer Ready</span></div>
          <div className="h-4 w-px" style={{background:"#1e3356"}}/>
          <div className="text-sm font-mono font-bold text-white shrink-0">{now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
          <div className="text-xs shrink-0" style={{color:"#6a8ab8"}}>{now.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}</div>
          <div className="h-4 w-px" style={{background:"#1e3356"}}/>
          <button onClick={handleDayEnd} disabled={dayEndLoading} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90 disabled:opacity-50" style={{background:"rgba(239,68,68,0.15)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.3)"}}>{dayEndLoading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<TrendingUp className="h-3.5 w-3.5"/>}Day End</button>
          <button onClick={()=>setShowShortcuts(s=>!s)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{color:"#4a6a8a"}}><Keyboard className="h-3.5 w-3.5"/>F1</button>
        </div>


        {/* DAY END MODAL */}
        <AnimatePresence>{showDayEnd&&dayEndSummary&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.75)"}}>
            <motion.div initial={{scale:0.9,y:16}} animate={{scale:1,y:0}} exit={{scale:0.9,y:16}} className="rounded-2xl overflow-hidden border shadow-2xl w-full max-w-sm" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
              <div className="p-5 text-white text-center" style={{background:"linear-gradient(135deg,#7c3aed,#4f6ef7)"}}>
                <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{background:"rgba(255,255,255,0.2)"}}><TrendingUp className="h-6 w-6"/></div>
                <h2 className="text-base font-bold">Day Closed</h2>
                <p className="text-white/70 text-xs">{dayEndSummary.date}</p>
              </div>
              <div className="p-4 space-y-2.5">
                {[{label:"Total Sales",val:String(dayEndSummary.totalSales),color:"#fff"},{label:"Gross Revenue",val:`LKR ${formatNumber(dayEndSummary.totalRevenue)}`,color:"#4f6ef7"},{label:"Tax Collected",val:`LKR ${formatNumber(dayEndSummary.totalTax)}`,color:"#f59e0b"},{label:"Total Discount",val:`LKR ${formatNumber(dayEndSummary.totalDiscount)}`,color:"#10b981"}].map(r=>(
                  <div key={r.label} className="flex justify-between py-1.5 border-b" style={{borderColor:"#1e3356"}}>
                    <span className="text-xs" style={{color:"#6a8ab8"}}>{r.label}</span>
                    <span className="text-sm font-bold" style={{color:r.color}}>{r.val}</span>
                  </div>
                ))}
                {Object.entries(dayEndSummary.byPaymentMethod).length>0&&(
                  <div className="pt-1">
                    <p className="text-xs font-semibold mb-2" style={{color:"#6a8ab8"}}>By Payment Method</p>
                    {Object.entries(dayEndSummary.byPaymentMethod).map(([method,amt])=>(
                      <div key={method} className="flex justify-between text-xs py-1">
                        <span className="text-white">{method}</span>
                        <span className="font-bold" style={{color:"#4f6ef7"}}>LKR {formatNumber(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 pt-0">
                <button onClick={()=>setShowDayEnd(false)} className="w-full h-10 rounded-xl text-sm font-bold text-white" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>

        {/* CUSTOMER SEARCH MODAL */}
        <AnimatePresence>{showCustomerSearch&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}} onClick={()=>{setShowCustomerSearch(false);setCustomerSearch("");}}>
            <motion.div initial={{scale:0.95,y:12}} animate={{scale:1,y:0}} exit={{scale:0.95,y:12}} onClick={e=>e.stopPropagation()} className="rounded-2xl border shadow-2xl w-full max-w-md overflow-hidden" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
              <div className="flex items-center gap-2 p-3 border-b" style={{borderColor:"#1e3356"}}>
                <Users className="h-4 w-4 shrink-0" style={{color:"#4f6ef7"}}/>
                <input autoFocus value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search customer by name or phone..." className="flex-1 h-9 px-2 text-sm text-white outline-none rounded-lg" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
                <button onClick={()=>{setShowCustomerSearch(false);setCustomerSearch("");setCustomers([]);}} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {customerLoading&&<div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" style={{color:"#4f6ef7"}}/></div>}
                {!customerLoading&&customers.length===0&&customerSearch&&<p className="text-center py-6 text-sm" style={{color:"#4a6a8a"}}>No customers found</p>}
                {customers.map(c=>(<button key={c.id} onClick={()=>{applyCustomer(c);setShowCustomerSearch(false);setCustomerSearch("");setCustomers([]);}} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{c.name?.[0]}</div>
                  <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium">{c.name}</p><p className="text-xs" style={{color:"#6a8ab8"}}>{c.phone}</p></div>
                  <div className="flex items-center gap-1 shrink-0"><Star className="h-3 w-3 text-amber-400"/><span className="text-xs capitalize" style={{color:"#f59e0b"}}>{c.tier}</span></div>
                </button>))}
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>

        {/* SHORTCUTS */}
        <AnimatePresence>{showShortcuts&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}} onClick={()=>setShowShortcuts(false)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} onClick={e=>e.stopPropagation()} className="rounded-2xl border shadow-2xl w-full max-w-sm p-4" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
              <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Keyboard className="h-4 w-4" style={{color:"#4f6ef7"}}/><span className="text-white font-bold text-sm">Keyboard Shortcuts</span></div><button onClick={()=>setShowShortcuts(false)} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {[["F2 / P","Focus search (Products)"],["C","Cart tab"],["U","Customers tab"],["H","Hold Bills tab"],["R","Returns tab"],["Enter (in search)","Add first match to cart"],["F3","Hold bill"],["F8","Restore last held bill"],["F9 / Enter","Confirm payment"],["F4","Customer search popup"],["F5","Refresh products"],["F12","Lock / Close POS"],["Tab","Cycle payment method"],["? ?","Navigate cart"],["+ / -","Qty up/down"],["Del","Remove cart item"],["0-9","Cash numpad"],["Backspace","Delete digit"],["F1 / ?","This help"]].map(([k,d])=>(
                  <div key={k} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5">
                    <kbd className="text-[10px] font-mono font-bold rounded px-2 py-0.5" style={{background:"#1a2b4a",color:"#a0b4d4",border:"1px solid #1e3356"}}>{k}</kbd>
                    <span className="text-xs ml-3" style={{color:"#6a8ab8"}}>{d}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
