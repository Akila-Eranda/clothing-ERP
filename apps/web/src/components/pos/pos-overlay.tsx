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

interface ProductItem { variantId: string; productName: string; variantName: string; sku: string; unitPrice: number; costPrice: number; stock: number; category: string; color?: string; size?: string; imageUrl?: string; }
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
  const [receipt, setReceipt] = React.useState<SaleReceipt | null>(null);
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
  const searchRef = React.useRef<HTMLInputElement>(null);
  const barcodeBuffer = React.useRef(""); const lastKeyTime = React.useRef(0); const barcodeTimer = React.useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const { items, customer, discount, taxRate, addItem, updateQuantity, removeItem, setCustomer, setDiscount, clearCart, holdBill, heldBills, restoreHeldBill, deleteHeldBill, subtotal, discountAmount, taxAmount, total, itemCount } = useCartStore();

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
  React.useEffect(() => { if (activeNav !== "returns") { setReturnStep("search"); setReturnQuery(""); setReturnSearchRes([]); setReturnSale(null); setReturnItems(new Map()); setReturnReason(""); setReturnNotes(""); setReturnRestock(true); setReturnResult(null); } }, [activeNav]);

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
  const popularItems = React.useMemo(()=>{ const seen=new Set<string>(); return products.filter(p=>{if(seen.has(p.productName))return false;seen.add(p.productName);return true;}).slice(0,5); },[products]);
  const filteredProducts = React.useMemo(()=>{ const seen=new Set<string>(); return products.filter(p=>{const q=search.toLowerCase();const match=(!q||p.productName.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||p.variantName.toLowerCase().includes(q))&&(activeCategory==="All"||p.category===activeCategory);if(!match)return false;if(seen.has(p.productName))return false;seen.add(p.productName);return true;}); },[products,search,activeCategory]);

  const handleAddProduct = React.useCallback((p:ProductItem)=>{ if(p.stock<=0){toast.error(`${p.productName} out of stock`);return;} addItem({variantId:p.variantId,productName:p.productName,variantName:p.variantName,sku:p.sku,unitPrice:p.unitPrice,quantity:1,stock:p.stock,discountAmount:0,discountType:"percentage",taxRate:0}); setRecentScans(prev=>[{id:Date.now().toString(),variantId:p.variantId,name:p.productName,variant:p.variantName,price:p.unitPrice,time:new Date()},...prev].slice(0,8)); toast.success(`${p.productName} added`,{duration:700}); }, [addItem]);
  const handleCardClick = React.useCallback((p:ProductItem)=>{ const c=getColors(p.productName),s=getSizes(p.productName); if(c.length<=1&&s.length<=1){handleAddProduct(p);return;} setSelectedProductName(p.productName);setSelColor(p.color??null);setSelSize(p.size??null); },[getColors,getSizes,handleAddProduct]);
  const handleNumpad = React.useCallback((k:string)=>{ if(k==="DEL"){setNumpad(p=>p.slice(0,-1));return;} if(k==="."&&numpad.includes("."))return; setNumpad(p=>p+k); },[numpad]);

  const handleThermalPrint = React.useCallback(()=>{
    if(!receipt)return; const w=window.open("","_blank","width=400,height=700,scrollbars=yes"); if(!w){toast.error("Allow popups to print");return;}
    const rows=receipt.items.map(i=>`<div class="iname">${i.name}</div><div class="row"><span>${i.qty} x LKR ${i.qty>0?(i.price/i.qty).toFixed(2):"0.00"}</span><span>LKR ${i.price.toFixed(2)}</span></div>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:6mm;max-width:80mm;margin:0 auto}h1{font-size:18px;font-weight:900;text-align:center}sub{font-size:10px;display:block;text-align:center;margin-bottom:2px}.d{border:none;border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:11px}.iname{font-size:11px;font-weight:bold;margin-top:4px}.tot{display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px}.foot{text-align:center;margin-top:10px;font-size:10px;line-height:1.6}@media print{@page{margin:0;size:80mm auto}body{padding:3mm}}</style></head><body><h1>FashionERP</h1><sub>Point of Sale Receipt</sub><hr class="d"/><div class="row"><span>Invoice:</span><span><b>${receipt.invoiceNumber}</b></span></div><div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div><div class="row"><span>Cashier:</span><span>${user?.name??"Admin"}</span></div>${receipt.customerName?`<div class="row"><span>Customer:</span><span>${receipt.customerName}</span></div>`:""}<hr class="d"/><div style="font-size:10px;font-weight:bold;margin-bottom:2px">ITEMS</div>${rows}<hr class="d"/><div class="row"><span>Subtotal</span><span>LKR ${receipt.subtotal.toFixed(2)}</span></div>${receipt.discount>0?`<div class="row"><span>Discount</span><span>-LKR ${receipt.discount.toFixed(2)}</span></div>`:""}<div class="row"><span>Tax</span><span>LKR ${receipt.tax.toFixed(2)}</span></div><div class="tot"><span>TOTAL</span><span>LKR ${receipt.total.toFixed(2)}</span></div><hr class="d"/><div class="row"><span>Payment</span><span><b>${receipt.paymentMethod}</b></span></div>${receipt.cashTendered?`<div class="row"><span>Cash Tendered</span><span>LKR ${receipt.cashTendered.toFixed(2)}</span></div>`:""}${receipt.changeDue>0?`<div class="row"><span>Change</span><span>LKR ${receipt.changeDue.toFixed(2)}</span></div>`:""}<hr class="d"/><div class="foot">*** Thank You for Shopping! ***<br/>Powered by FashionERP</div></body></html>`);
    w.document.close(); setTimeout(()=>{w.focus();w.print();setTimeout(()=>w.close(),1000);},250);
  },[receipt,user]);

  const handleCheckout = React.useCallback(async()=>{
    if(!items.length||checkoutLoading)return;
    if(activePayment==="CASH"&&numpad&&parseFloat(numpad)<totalAmt){toast.error("Cash tendered less than total");return;}
    setCheckoutLoading(true);
    try {
      const pm=new Map(products.map(p=>[p.variantId,p]));
      const payload={customerId:customer?.id,items:items.map(i=>({variantId:i.variantId,productName:i.productName,variantName:i.variantName,sku:i.sku,quantity:i.quantity,unitPrice:i.unitPrice,costPrice:pm.get(i.variantId)?.costPrice??0,discount:i.discountAmount??0,discountType:i.discountType==="percentage"?"PERCENTAGE":"FIXED",taxRate:i.taxRate??0})),payments:[{method:activePayment,amount:activePayment==="CASH"&&numpad?parseFloat(numpad):totalAmt}],discountAmount:discountAmount(),notes:cartNotes};
      const res=await api.post<{invoiceNumber:string;total:number;changeDue:number}>("/pos/sale",payload);
      const s=res.data;
      setReceipt({invoiceNumber:s.invoiceNumber,total:s.total,changeDue:s.changeDue??changeAmt,paymentMethod:activePayment,customerName:customer?.name,items:items.map(i=>({name:`${i.productName} ${i.variantName}`.trim(),qty:i.quantity,price:i.unitPrice*i.quantity})),subtotal:subtotal(),discount:discountAmount(),tax:taxAmount(),cashTendered:numpad?parseFloat(numpad):undefined});
      setTodayStats(prev=>({sales:prev.sales+s.total,orders:prev.orders+1,items:prev.items+items.reduce((a,i)=>a+i.quantity,0)}));
      clearCart();setNumpad("");setSelectedCartIdx(-1);setCartNotes("");
    } catch(e:unknown){toast.error((e as Error).message??"Checkout failed");} finally{setCheckoutLoading(false);}
  },[items,checkoutLoading,activePayment,numpad,totalAmt,products,customer,discountAmount,changeAmt,subtotal,taxAmount,clearCart,cartNotes]);

  React.useEffect(() => {
    if (!posOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const inInput=["INPUT","TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName??"");
      const ms=Date.now();const delta=ms-lastKeyTime.current;lastKeyTime.current=ms;
      if(e.key.length===1&&delta<60&&!e.ctrlKey&&!e.altKey){barcodeBuffer.current+=e.key;clearTimeout(barcodeTimer.current);barcodeTimer.current=setTimeout(()=>{barcodeBuffer.current="";},120);}else if(e.key!=="Enter"&&delta>60){clearTimeout(barcodeTimer.current);barcodeBuffer.current="";}
      if(e.key==="Enter"&&barcodeBuffer.current.length>=3){const sku=barcodeBuffer.current.trim();barcodeBuffer.current="";clearTimeout(barcodeTimer.current);if(sku){const found=products.find(p=>p.sku.toLowerCase()===sku.toLowerCase());if(found){handleAddProduct(found);setScanFlash(true);setTimeout(()=>setScanFlash(false),500);}else toast.error(`SKU not found: ${sku}`);e.preventDefault();return;}}
      if(e.key==="F1"||(e.key==="?"&&!inInput)){e.preventDefault();setShowShortcuts(s=>!s);return;}
      if(e.key==="Escape"){if(showShortcuts){setShowShortcuts(false);return;}if(receipt){setReceipt(null);return;}if(selectedProductName){setSelectedProductName(null);return;}if(showCustomerSearch){setShowCustomerSearch(false);setCustomerSearch("");return;}closePos();return;}
      if(inInput)return;
      if(e.key==="/"||((e.ctrlKey||e.metaKey)&&e.key==="f")){e.preventDefault();searchRef.current?.focus();return;}
      if(e.key==="F2"){e.preventDefault();searchRef.current?.focus();setActiveNav("products");return;}
      if(e.key==="F3"){e.preventDefault();if(items.length>0){holdBill();toast.success("Bill held");}return;}
      if(e.key==="F4"){e.preventDefault();setShowCustomerSearch(true);return;}
      if(e.key==="F5"){e.preventDefault();loadProducts();return;}
      if(e.key==="F8"){e.preventDefault();if(heldBills.length>0){restoreHeldBill(heldBills[heldBills.length-1].id);toast.success("Bill restored");}return;}
      if(e.key==="F9"){e.preventDefault();handleCheckout();return;}
      if(e.key==="F12"){e.preventDefault();closePos();return;}
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
  },[posOpen,products,items,activePayment,selectedCartIdx,numpad,heldBills,receipt,showShortcuts,showCustomerSearch,selectedProductName,handleAddProduct,handleNumpad,handleCheckout]);

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
            <button key={cat} onClick={()=>setActiveCategory(cat)} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all" style={{background:activeCategory===cat?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"#1a2b4a",color:activeCategory===cat?"#fff":"#6a8ab8"}}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading?(<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):filteredProducts.length===0?(<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><Package className="h-12 w-12 mb-2 opacity-30"/><p className="text-sm">No products found</p></div>):(
            <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))"}}>
              {filteredProducts.map(p=>{
                const allVars=getVariants(p.productName);const totalStock=allVars.reduce((a,v)=>a+v.stock,0);const lowStock=totalStock>0&&totalStock<=10;
                return (
                  <motion.div key={p.variantId} whileTap={{scale:0.96}} onClick={()=>handleCardClick(p)} className="rounded-xl overflow-hidden cursor-pointer group relative border transition-all hover:border-blue-500/50" style={{background:"#162338",borderColor:selectedProductName===p.productName?"#4f6ef7":"#1e3356"}}>
                    <div className="relative" style={{aspectRatio:"4/3",background:getCardBg(p.color)}}>
                      <Package className="absolute inset-0 m-auto h-10 w-10 text-white/20"/>
                      <div className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{background:totalStock===0?"#dc2626":totalStock<=10?"#d97706":"#16a34a"}}>{totalStock}</div>
                      {lowStock&&<div className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:"rgba(220,38,38,0.85)",color:"#fff"}}>Low Stock</div>}
                      <button onClick={e=>{e.stopPropagation();setLiked(s=>{const n=new Set(s);n.has(p.variantId)?n.delete(p.variantId):n.add(p.variantId);return n;});}} className="absolute top-1.5 right-1.5 p-1 rounded-full" style={{background:"rgba(0,0,0,0.3)"}}><Heart className="h-3 w-3" style={{color:liked.has(p.variantId)?"#ef4444":"#fff",fill:liked.has(p.variantId)?"#ef4444":"none"}}/></button>
                      <button onClick={e=>{e.stopPropagation();handleCardClick(p);}} className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" style={{background:"#4f6ef7"}}><Plus className="h-3.5 w-3.5 text-white"/></button>
                    </div>
                    <div className="p-2"><p className="text-white text-xs font-semibold leading-tight line-clamp-1">{p.productName}</p><p className="text-[11px] mt-0.5 line-clamp-1" style={{color:"#6a8ab8"}}>{p.color??p.variantName}</p><p className="text-sm font-bold mt-1" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</p></div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex border-t shrink-0" style={{height:"192px",borderColor:"#1e3356"}}>
          <div className="w-52 border-r flex flex-col shrink-0" style={{borderColor:"#1e3356"}}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{borderColor:"#1e3356"}}><span className="text-xs font-semibold text-white">Popular Items</span><button className="text-[10px]" style={{color:"#4f6ef7"}}>View All</button></div>
            <div className="overflow-y-auto flex-1">{popularItems.map(p=>(<button key={p.variantId} onClick={()=>handleCardClick(p)} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors text-left"><div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center" style={{background:getCardBg(p.color)}}><Package className="h-4 w-4 text-white/30"/></div><div className="flex-1 min-w-0"><p className="text-white text-[11px] font-semibold truncate">{p.productName}</p><p className="text-[10px] truncate" style={{color:"#6a8ab8"}}>{p.color}</p></div><span className="text-[10px] font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</span></button>))}</div>
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
            ):(<div className="flex flex-col items-center justify-center h-full" style={{color:"#4a6a8a"}}><ShoppingBag className="h-8 w-8 mb-1 opacity-30"/><p className="text-[11px]">Click a product to select variant</p></div>)}
          </div>
          <div className="w-64 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{borderColor:"#1e3356"}}><span className="text-xs font-semibold text-white">Recent Scan</span>{recentScans.length>0&&<button onClick={()=>setRecentScans([])} className="p-0.5 rounded hover:bg-white/10"><Trash2 className="h-3 w-3" style={{color:"#6a8ab8"}}/></button>}</div>
            <div className="overflow-y-auto flex-1">{recentScans.length===0?<div className="flex flex-col items-center justify-center h-full" style={{color:"#4a6a8a"}}><Scan className="h-6 w-6 mb-1 opacity-30"/><p className="text-[10px]">No recent scans</p></div>:recentScans.map(s=>(<div key={s.id} className="flex items-center gap-2 px-2 py-1.5 border-b" style={{borderColor:"#1a2b3a"}}><Scan className="h-3 w-3 shrink-0" style={{color:"#4f6ef7"}}/><div className="flex-1 min-w-0"><p className="text-white text-[10px] font-semibold truncate">{s.name}</p><p className="text-[9px] truncate" style={{color:"#6a8ab8"}}>{s.variant}</p></div><span className="text-[10px] font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(s.price)}</span></div>))}</div>
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
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:"#6a8ab8"}}/><input value={inlineCustomerSearch} onChange={e=>setInlineCustomerSearch(e.target.value)} placeholder="Search customer by name or phone..." className="w-full pl-9 h-9 rounded-xl text-sm text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/></div>
          {inlineCustLoading&&<Loader2 className="h-4 w-4 animate-spin shrink-0" style={{color:"#4f6ef7"}}/>}
        </div>
        {customer&&<div className="shrink-0 flex items-center gap-3 p-3 rounded-xl" style={{background:"rgba(79,110,247,0.1)",border:"1px solid rgba(79,110,247,0.3)"}}><div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{customer.name?.[0]}</div><div className="flex-1 min-w-0"><p className="text-white text-sm font-bold">{customer.name}</p><p className="text-xs" style={{color:"#6a8ab8"}}>{customer.phone}  <span className="capitalize">{customer.membershipTier}</span>  {customer.loyaltyPoints} pts</p></div><span className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}> Active Bill Customer</span><button onClick={()=>setCustomer(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4" style={{color:"#6a8ab8"}}/></button></div>}
        <div className="flex-1 overflow-y-auto">
          {inlineCustomers.length===0&&!inlineCustomerSearch&&<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><Users className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">Search customers above</p></div>}
          {inlineCustomers.length===0&&inlineCustomerSearch&&!inlineCustLoading&&<div className="flex flex-col items-center justify-center h-48" style={{color:"#4a6a8a"}}><AlertCircle className="h-8 w-8 mb-2 opacity-30"/><p className="text-sm">No customers found</p></div>}
          <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
            {inlineCustomers.map(c=>(
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:border-blue-500/40" style={{background:"#162338",borderColor:"#1e3356"}}>
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{c.name?.[0]}</div>
                <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold truncate">{c.name}</p><p className="text-[11px] truncate" style={{color:"#6a8ab8"}}>{c.phone}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] font-bold capitalize" style={{color:TIER_COLOR[c.tier?.toLowerCase()??"bronze"]}}> {c.tier??"-"}</span><span className="text-[10px]" style={{color:"#4a6a8a"}}>{c.loyaltyPoints} pts</span></div></div>
                <button onClick={()=>applyCustomer(c)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 shrink-0" style={{background:customer?.id===c.id?"#10b981":"#4f6ef7"}}>{customer?.id===c.id?" Active":"Set"}</button>
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
        setReturnSubmitting(true);
        try {
          const r = await api.post<{returnNumber:string;refundAmount:number}>("/returns", { originalSaleId:returnSale.id, reason:returnReason, returnType:"RETURN", notes:returnNotes, restockItems:returnRestock, items:selectedItems.map(([variantId,s])=>({variantId,quantity:s.qty,unitPrice:s.unitPrice})) });
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
              <button onClick={()=>{setReturnStep("search");setReturnSale(null);setReturnSearchRes([]);}} className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs" style={{color:"#6a8ab8",border:"1px solid #1e3356"}}>← Back to Search</button>
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
              </div>
              <div className="w-56 flex flex-col gap-2 shrink-0">
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
                  <p className="text-[10px]" style={{color:"#6a8ab8"}}>Refund amount</p>
                </div>
                <button onClick={()=>{if(!returnReason){toast.error("Select a reason");return;}if(!selectedItems.length){toast.error("Select at least one item");return;}setReturnStep("confirm");}} className="w-full h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>Review Return →</button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {returnStep==="confirm"&&returnSale&&(
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              <div className="rounded-xl border p-4" style={{background:"#162338",borderColor:"#1e3356"}}>
                <p className="text-xs font-semibold mb-3" style={{color:"#6a8ab8"}}>RETURN SUMMARY</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[{l:"Original Invoice",v:returnSale.invoiceNumber},{l:"Customer",v:returnSale.customer?.name??"Walk-in"},{l:"Reason",v:REASONS.find(r=>r.v===returnReason)?.l??returnReason},{l:"Restock Items",v:returnRestock?"Yes":"No"}].map(f=>(
                    <div key={f.l}><p className="text-[10px]" style={{color:"#6a8ab8"}}>{f.l}</p><p className="text-white text-xs font-semibold mt-0.5">{f.v}</p></div>
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
              <div className="flex justify-between items-center p-4 rounded-xl border mt-1" style={{background:"rgba(16,185,129,0.08)",borderColor:"rgba(16,185,129,0.3)"}}>
                <div><p className="text-xs" style={{color:"#10b981"}}>Total Refund Amount</p><p className="text-2xl font-bold text-white mt-0.5">LKR {formatNumber(refundTotal)}</p></div>
                <button onClick={submitReturn} disabled={returnSubmitting} className="flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>{returnSubmitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}Confirm Return</button>
              </div>
            </div>
          )}

          {/* STEP 4: DONE */}
          {returnStep==="done"&&returnResult&&(
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{background:"rgba(16,185,129,0.15)"}}><CheckCircle2 className="h-10 w-10" style={{color:"#10b981"}}/></div>
              <div className="text-center">
                <h3 className="text-white font-bold text-xl">Return Processed!</h3>
                <p className="text-xs mt-1 font-mono" style={{color:"#6a8ab8"}}>{returnResult.returnNumber}</p>
              </div>
              <div className="p-5 rounded-2xl border text-center" style={{background:"#162338",borderColor:"#1e3356",minWidth:"260px"}}>
                <p className="text-xs mb-1" style={{color:"#6a8ab8"}}>Refund Amount</p>
                <p className="text-3xl font-bold" style={{color:"#10b981"}}>LKR {formatNumber(returnResult.refundAmount)}</p>
                <p className="text-xs mt-2" style={{color:"#4a6a8a"}}>Status: INITIATED · Awaiting approval</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{const w=window.open("","_blank","width=380,height=500");if(!w)return;w.document.write(`<!DOCTYPE html><html><head><title>Return Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:6mm;max-width:80mm;margin:0 auto}h1{font-size:16px;font-weight:900;text-align:center}.d{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.foot{text-align:center;margin-top:8px;font-size:10px}@media print{@page{size:80mm auto}}</style></head><body><h1>RETURN RECEIPT</h1><hr class="d"/><div class="row"><span>${returnResult.returnNumber}</span></div><div class="row"><span>Date: ${new Date().toLocaleString()}</span></div><div class="row"><span>Invoice: ${returnSale?.invoiceNumber}</span></div><div class="row"><span>Reason: ${REASONS.find(r=>r.v===returnReason)?.l}</span></div><hr class="d"/>${selectedItems.map(([,s])=>`<div class="row"><span>${s.name} x${s.qty}</span><span>LKR ${s.unitPrice*s.qty}</span></div>`).join("")}<hr class="d"/><div class="row"><b>REFUND</b><b>LKR ${returnResult.refundAmount.toFixed(2)}</b></div><div class="foot">*** Thank You ***</div></body></html>`);w.document.close();setTimeout(()=>{w.focus();w.print();setTimeout(()=>w.close(),500);},200);}} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10" style={{borderColor:"#1e3356",color:"#a0b4d4"}}><Printer className="h-4 w-4"/>Print Receipt</button>
                <button onClick={()=>{setReturnStep("search");setReturnQuery("");setReturnSearchRes([]);setReturnSale(null);setReturnItems(new Map());setReturnReason("");setReturnNotes("");setReturnRestock(true);setReturnResult(null);}} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}><RotateCcw className="h-4 w-4"/>New Return</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // PLACEHOLDER for Discounts, Reports, Settings
    const PLACEHOLDERS: Record<string,{icon:React.ElementType;title:string;desc:string;path:string}> = {
      "discounts":{icon:Tag,title:"Discounts & Promotions",desc:"Create and manage discount codes, seasonal promotions and bundle offers.",path:"/promotions"},
      "reports":{icon:BarChart2,title:"Sales Reports",desc:"View detailed sales analytics, revenue trends and product performance charts.",path:"/reports"},
      "settings":{icon:Settings,title:"POS Settings",desc:"Configure tax rates, payment methods, receipt templates and printer settings.",path:"/settings"},
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
            <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setActiveNav("products")} placeholder="Scan barcode or search product..." className="w-full pl-9 pr-16 h-9 text-sm text-white placeholder:text-white/30 rounded-xl outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
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
                  <button key={item.id} onClick={()=>setActiveNav(item.id)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-all relative" style={{color:active?"#fff":"#6a8ab8",background:active?"rgba(79,110,247,0.2)":"transparent"}}>
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
            <button onClick={closePos} className="flex items-center gap-2 mx-2 mb-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/10" style={{background:"rgba(255,255,255,0.05)",color:"#6a8ab8"}}>
              <Lock className="h-3.5 w-3.5"/>Lock Screen<span className="ml-auto text-[10px] opacity-50 font-mono">F12</span>
            </button>
          </div>

          {/* CENTER  dynamic content */}
          <div className="flex-1 min-w-0 overflow-hidden">{renderCenter()}</div>

          {/* CART PANEL */}
          <div className="w-80 flex flex-col shrink-0 border-l" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{borderColor:"#1e3356"}}>
              <span className="text-white font-bold text-sm">Cart ({itemCount()} Items)</span>
              <button onClick={()=>{clearCart();setSelectedCartIdx(-1);}} className="flex items-center gap-1 text-[11px] font-semibold hover:text-red-400 transition-colors" style={{color:"#ef4444"}}><Trash2 className="h-3 w-3"/>Clear Cart</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length===0?(
                <div className="flex flex-col items-center justify-center h-32" style={{color:"#4a6a8a"}}><ShoppingCart className="h-10 w-10 mb-2 opacity-20"/><p className="text-xs">Cart is empty</p></div>
              ):(
                <div className="p-2 space-y-1">
                  <AnimatePresence>{items.map((item,idx)=>(
                    <motion.div key={item.variantId} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                      onClick={()=>setSelectedCartIdx(idx)} className="flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all"
                      style={{background:selectedCartIdx===idx?"rgba(79,110,247,0.15)":"#162338",border:`1px solid ${selectedCartIdx===idx?"#4f6ef7":"#1e3356"}`}}>
                      <div className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center" style={{background:getCardBg(item.variantName)}}><Package className="h-5 w-5 text-white/20"/></div>
                      <div className="flex-1 min-w-0"><p className="text-white text-[11px] font-semibold truncate">{item.productName}</p><p className="text-[10px] truncate" style={{color:"#6a8ab8"}}>{item.variantName}</p></div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity-1);}} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Minus className="h-2.5 w-2.5 text-white"/></button>
                        <span className="text-white text-xs font-bold w-5 text-center">{item.quantity}</span>
                        <button onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity+1);}} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"#1a2b4a"}}><Plus className="h-2.5 w-2.5 text-white"/></button>
                      </div>
                      <div className="text-right shrink-0 w-16 group">
                        <p className="text-white text-[11px] font-bold">LKR {formatNumber(item.unitPrice*item.quantity)}</p>
                        <button onClick={e=>{e.stopPropagation();removeItem(item.variantId);if(selectedCartIdx===idx)setSelectedCartIdx(-1);}} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3 mx-auto" style={{color:"#ef4444"}}/></button>
                      </div>
                    </motion.div>
                  ))}</AnimatePresence>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t" style={{borderColor:"#1e3356"}}>
              <div className="flex items-center gap-2 px-3 py-2 border-b" style={{borderColor:"#1e3356"}}>
                <span className="text-xs font-medium shrink-0" style={{color:"#6a8ab8"}}>Discount %</span>
                <input type="number" value={discount||""} onChange={e=>setDiscount(parseFloat(e.target.value)||0,"percentage")} className="flex-1 h-7 rounded-lg px-2 text-xs text-white outline-none" style={{background:"#1a2b4a",border:"1px solid #1e3356"}}/>
                <button className="px-3 h-7 rounded-lg text-xs font-bold text-white" style={{background:"#4f6ef7"}}>Apply</button>
              </div>
              <div className="px-3 py-2 space-y-1 border-b" style={{borderColor:"#1e3356"}}>
                <div className="flex justify-between text-xs" style={{color:"#6a8ab8"}}><span>Sub Total</span><span>LKR {formatNumber(subtotal())}</span></div>
                {discountAmount()>0&&<div className="flex justify-between text-xs text-green-400"><span>Discount</span><span>-LKR {formatNumber(discountAmount())}</span></div>}
                <div className="flex justify-between text-xs" style={{color:"#6a8ab8"}}><span>Tax ({taxRate}%)</span><span>LKR {formatNumber(taxAmount())}</span></div>
                <div className="flex justify-between text-base font-bold text-white pt-1 border-t" style={{borderColor:"#1e3356"}}><span>Grand Total</span><span style={{color:"#4f6ef7"}}>LKR {formatNumber(totalAmt)}</span></div>
              </div>
              <div className="flex gap-1 px-2 py-1.5 border-b" style={{borderColor:"#1e3356"}}>
                {PAY_METHODS.map(({value,label,icon:Icon})=>(
                  <button key={value} onClick={()=>setActivePayment(value)} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-bold transition-all" style={{background:activePayment===value?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"#1a2b4a",color:activePayment===value?"#fff":"#6a8ab8"}}>
                    <Icon className="h-3.5 w-3.5"/>{label}
                  </button>
                ))}
              </div>
              {activePayment==="CASH"&&(
                <div className="px-2 py-1.5 border-b" style={{borderColor:"#1e3356"}}>
                  <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-semibold" style={{color:"#6a8ab8"}}>Cash Received (LKR)</span><button onClick={()=>setNumpad("")} className="p-1 rounded hover:bg-white/10"><X className="h-3 w-3" style={{color:"#6a8ab8"}}/></button></div>
                  <div className="h-9 rounded-xl flex items-center px-3 mb-2 text-green-400 font-bold text-lg font-mono" style={{background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)"}}>{numpad?formatNumber(parseFloat(numpad)):"0.00"}</div>
                  <div className="grid gap-1" style={{gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
                    {[["7","8","9","500"],["4","5","6","1000"],["1","2","3","2000"],["0",".","DEL","5000"]].map((row,ri)=>row.map((k,ki)=>{
                      const isQuick=ki===3;const isDel=k==="DEL";
                      return(<button key={`${ri}-${ki}`} onClick={()=>isQuick?setNumpad(k):handleNumpad(k)} className="h-8 rounded-lg text-xs font-bold transition-all active:scale-95" style={{background:isQuick?"#1e3356":isDel?"rgba(239,68,68,0.15)":"#1a2b4a",color:isQuick?"#6a8ab8":isDel?"#ef4444":"#fff"}}>
                        {isDel?<Delete className="h-3.5 w-3.5 mx-auto"/>:k}
                      </button>);
                    }))}
                  </div>
                </div>
              )}
              {numpad&&parseFloat(numpad)>=totalAmt&&activePayment==="CASH"&&(
                <div className="flex justify-between items-center px-3 py-1.5 border-b" style={{borderColor:"#1e3356"}}>
                  <span className="text-xs font-semibold text-green-400">Change</span>
                  <span className="text-green-400 font-bold font-mono text-sm">LKR {formatNumber(changeAmt)}</span>
                </div>
              )}
              <div className="p-2 flex gap-2">
                <button onClick={handleCheckout} disabled={checkoutLoading||items.length===0} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
                  {checkoutLoading?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}
                  Confirm Payment<span className="text-[10px] opacity-70 font-mono">(F9)</span>
                </button>
                <button onClick={handleThermalPrint} className="h-11 w-11 rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"#1e3356"}}><Printer className="h-4 w-4" style={{color:"#6a8ab8"}}/></button>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="flex items-center gap-4 px-4 h-10 border-t shrink-0" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
          {[{label:"Today Sales",value:`LKR ${formatNumber(todayStats.sales)}`,color:"#4f6ef7"},{label:"Orders",value:String(todayStats.orders)},{label:"Items Sold",value:String(todayStats.items)},{label:"Avg. Bill",value:todayStats.orders>0?`LKR ${formatNumber(todayStats.sales/todayStats.orders)}`:"LKR 0.00"}].map(s=>(
            <div key={s.label} className="flex items-center gap-2 shrink-0">
              <span className="text-[10px]" style={{color:"#4a6a8a"}}>{s.label}</span>
              <span className="text-xs font-bold" style={{color:s.color||"#fff"}}>{s.value}</span>
            </div>
          ))}
          <div className="flex-1"/>
          <div className="flex items-center gap-1.5 shrink-0" style={{color:"#10b981"}}><div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"/><span className="text-[10px] font-semibold">Barcode Scanner</span><span className="text-[10px]" style={{color:"#6a8ab8"}}>Connected</span></div>
          <div className="h-3 w-px" style={{background:"#1e3356"}}/>
          <div className="flex items-center gap-1.5 shrink-0" style={{color:"#6a8ab8"}}><Printer className="h-3 w-3"/><span className="text-[10px]">Printer Ready</span></div>
          <div className="h-3 w-px" style={{background:"#1e3356"}}/>
          <div className="text-[10px] font-mono font-bold text-white shrink-0">{now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
          <div className="text-[10px] shrink-0" style={{color:"#6a8ab8"}}>{now.toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}</div>
          <div className="h-3 w-px" style={{background:"#1e3356"}}/>
          <button onClick={()=>setShowShortcuts(s=>!s)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors" style={{color:"#4a6a8a"}}><Keyboard className="h-3 w-3"/>F1</button>
        </div>

        {/* RECEIPT MODAL */}
        <AnimatePresence>{receipt&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.75)"}}>
            <motion.div initial={{scale:0.9,y:16}} animate={{scale:1,y:0}} exit={{scale:0.9,y:16}} className="rounded-2xl overflow-hidden border shadow-2xl w-full max-w-sm" style={{background:"#0f1f3a",borderColor:"#1e3356"}}>
              <div className="p-5 text-white text-center" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
                <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{background:"rgba(255,255,255,0.2)"}}><CheckCircle2 className="h-6 w-6"/></div>
                <h2 className="text-base font-bold">Sale Complete!</h2>
                <p className="text-white/70 text-xs font-mono">{receipt.invoiceNumber}</p>
              </div>
              <div className="p-4 space-y-2 font-mono text-sm">
                {receipt.customerName&&<div className="flex justify-between text-xs"><span style={{color:"#6a8ab8"}}>Customer</span><span className="text-white font-semibold">{receipt.customerName}</span></div>}
                <div className="flex justify-between text-xs"><span style={{color:"#6a8ab8"}}>Payment</span><span className="text-white">{receipt.paymentMethod}</span></div>
                <div className="border-t pt-2 space-y-1" style={{borderColor:"#1e3356"}}>{receipt.items.map((it,i)=><div key={i} className="flex justify-between text-xs"><span className="truncate flex-1 mr-2 text-white">{it.name} ×{it.qty}</span><span style={{color:"#6a8ab8"}}>LKR {formatNumber(it.price)}</span></div>)}</div>
                <div className="border-t pt-2 space-y-1" style={{borderColor:"#1e3356"}}>
                  <div className="flex justify-between text-xs" style={{color:"#6a8ab8"}}><span>Subtotal</span><span>LKR {formatNumber(receipt.subtotal)}</span></div>
                  {receipt.discount>0&&<div className="flex justify-between text-xs text-green-400"><span>Discount</span><span>-LKR {formatNumber(receipt.discount)}</span></div>}
                  <div className="flex justify-between text-xs" style={{color:"#6a8ab8"}}><span>Tax</span><span>LKR {formatNumber(receipt.tax)}</span></div>
                  <div className="flex justify-between text-sm font-bold text-white border-t pt-1" style={{borderColor:"#1e3356"}}><span>TOTAL</span><span style={{color:"#4f6ef7"}}>LKR {formatNumber(receipt.total)}</span></div>
                  {receipt.cashTendered&&<><div className="flex justify-between text-xs" style={{color:"#6a8ab8"}}><span>Cash Tendered</span><span>LKR {formatNumber(receipt.cashTendered)}</span></div><div className="flex justify-between text-xs text-green-400"><span>Change</span><span>LKR {formatNumber(receipt.changeDue)}</span></div></>}
                </div>
              </div>
              <div className="flex gap-2 p-3 pt-0">
                <button onClick={handleThermalPrint} className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold border transition-all hover:bg-white/10" style={{borderColor:"#1e3356",color:"#a0b4d4"}}><Printer className="h-4 w-4"/>Thermal Print</button>
                <button onClick={()=>setReceipt(null)} className="flex-1 h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>New Sale</button>
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
                {[["F2","Focus search"],["F3","Hold bill"],["F4","Customer search"],["F5","Refresh products"],["F8","Restore last held bill"],["F9 / Enter","Confirm payment"],["F12 / ESC","Close POS"],["Tab","Cycle payment method"],["","Navigate cart"],["+ / -","Qty up/down"],["Del","Remove item"],["0-9","Cash numpad"],["Backspace","Delete digit"],["F1 / ?","This help"]].map(([k,d])=>(
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
