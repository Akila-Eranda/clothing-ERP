"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, User, Globe, Eye, EyeOff, ArrowRight, ArrowLeft,
  CheckCircle2, Mail, Lock, Phone, Tag, Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SHOP_TYPE_LIST, ShopType, getShopProfile } from "@/lib/shop-profiles";
import { getVerticalFeatures } from "@/lib/shop-features";
import { ShopFeatureList } from "@/components/shop/shop-feature-list";
import { APP_NAME, STARTER_TRIAL_DAYS } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { SHOP_DOMAIN_SUFFIX, tenantLoginUrl } from "@/lib/auth-host";
import { MaintenanceBanner, useMaintenanceStatus } from "@/components/maintenance/maintenance-banner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const schema = z.object({
  companyName:    z.string().min(2, "Company name is required"),
  subdomain:      z.string().min(3, "Min 3 chars").max(30, "Max 30 chars")
                    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  phone:          z.string().optional(),
  country:        z.string().default("LK"),
  currency:       z.string().default("LKR"),
  timezone:       z.string().default("Asia/Colombo"),
  adminFirstName: z.string().min(1, "First name is required"),
  adminLastName:  z.string().min(1, "Last name is required"),
  adminEmail:     z.string().email("Enter a valid email"),
  adminPassword:  z.string().min(8, "Minimum 8 characters"),
});

type FormData = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: "Business",  icon: Building2 },
  { id: 2, label: "Account",   icon: User },
  { id: 3, label: "Region",    icon: Globe },
];

const CURRENCIES = ["LKR","INR","USD","EUR","GBP","AED","SGD","AUD"];
const COUNTRIES  = [
  { code:"LK", name:"Sri Lanka" },
  { code:"IN", name:"India" },
  { code:"US", name:"United States" },
  { code:"GB", name:"United Kingdom" },
  { code:"AE", name:"UAE" },
  { code:"SG", name:"Singapore" },
  { code:"AU", name:"Australia" },
];
const TIMEZONES  = [
  "Asia/Colombo","Asia/Kolkata","America/New_York","America/Los_Angeles",
  "Europe/London","Europe/Paris","Asia/Dubai","Asia/Singapore","Australia/Sydney",
];

export default function RegisterPage() {
  const [step, setStep]             = React.useState(1);
  const [shopType, setShopType]     = React.useState<ShopType>(ShopType.CLOTHING);
  const [showPass, setShowPass]     = React.useState(false);
  const [isLoading, setIsLoading]   = React.useState(false);
  const [subPreview, setSubPreview] = React.useState("");
  const [createdWorkspace, setCreatedWorkspace] = React.useState<{
    subdomain: string;
    email: string;
    companyName: string;
  } | null>(null);
  const { isMaintenance, status: maintenance } = useMaintenanceStatus(45_000);

  const selectedProfile = getShopProfile(shopType);
  const verticalFeatures = getVerticalFeatures(shopType);

  const { register, handleSubmit, watch, trigger, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { country:"LK", currency:"LKR", timezone:"Asia/Colombo" },
  });

  const subdomain = watch("subdomain") ?? "";
  React.useEffect(() => {
    setSubPreview(subdomain.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }, [subdomain]);

  const nextStep = async () => {
    if (step === 1 && !shopType) {
      toast.error("Please select your shop type");
      return;
    }
    const fields: (keyof FormData)[][] = [
      ["companyName","subdomain","phone"],
      ["adminFirstName","adminLastName","adminEmail","adminPassword"],
      ["country","currency","timezone"],
    ];
    const ok = await trigger(fields[step - 1]);
    if (ok) setStep((s) => s + 1);
  };

  const onSubmit = async (data: FormData) => {
    if (isMaintenance) {
      toast.error(maintenance?.message ?? "Registration is disabled during maintenance");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tenants/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          adminEmail: data.adminEmail.trim().toLowerCase(),
          plan: 'STARTER',
          shopType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Registration failed");
      setCreatedWorkspace({
        subdomain: data.subdomain.trim().toLowerCase(),
        email: data.adminEmail.trim().toLowerCase(),
        companyName: data.companyName,
      });
      setStep(4);
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 4 && createdWorkspace) {
    const loginUrl = `${tenantLoginUrl(createdWorkspace.subdomain)}?email=${encodeURIComponent(createdWorkspace.email)}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background mesh-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-4 w-full text-center"
        >
          <div className="glass-card rounded-2xl p-10 shadow-glass">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6 mx-auto">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">You&apos;re all set! 🎉</h1>
            <p className="text-muted-foreground mb-2">
              Your workspace <strong className="text-foreground">{createdWorkspace.companyName}</strong> has been created.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Your {STARTER_TRIAL_DAYS}-day free trial has started.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Your secure workspace URL is being prepared. HTTPS usually works within 1–3 minutes after signup.
            </p>
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-left text-sm mb-6 space-y-2">
              <p>
                <span className="text-muted-foreground">Workspace:</span>{" "}
                <strong className="font-mono text-foreground">
                  {createdWorkspace.subdomain}{SHOP_DOMAIN_SUFFIX}
                </strong>
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                <strong className="font-mono text-foreground">{createdWorkspace.email}</strong>
              </p>
              <p className="text-muted-foreground">
                Sign in with the <strong className="text-foreground">password you just created</strong> during registration.
              </p>
            </div>
            <Button
              className="w-full h-11 font-semibold"
              variant="gradient"
              onClick={() => { window.location.href = loginUrl; }}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Sign in to your workspace
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] shrink-0 flex-col justify-between p-10 bg-gradient-to-br from-primary via-violet-600 to-purple-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage:"radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize:"30px 30px" }}
        />
        <div className="relative">
          <div className="mb-12">
            <AppLogo variant="full" theme="dark" showTagline />
          </div>
          <h2 className="text-3xl font-bold leading-tight mb-2">Start your free {STARTER_TRIAL_DAYS}-day trial</h2>
          <p className="text-white/70 text-sm leading-relaxed mb-6">
            {selectedProfile.emoji} <strong className="text-white">{selectedProfile.label}</strong> — {selectedProfile.description}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Included features</p>
          <ShopFeatureList features={verticalFeatures} compact variant="on-dark" />
          <Link href="/features" className="inline-block mt-6 text-xs text-white/60 hover:text-white underline underline-offset-2">
            View all business types & common features →
          </Link>
        </div>
        <p className="relative text-xs text-white/50">
          © 2025 {APP_NAME} · Multi-Shop Retail Platform
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <AppLogo variant="compact" theme="light" className="items-center mx-auto" />
          </div>

          {isMaintenance && (
            <div className="mb-6 rounded-xl overflow-hidden border border-amber-300">
              <MaintenanceBanner compact />
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  step === s.id
                    ? "bg-primary text-white"
                    : step > s.id
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground",
                )}>
                  {step > s.id
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <s.icon className="h-3.5 w-3.5" />
                  }
                  {s.label}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-px w-6", step > s.id ? "bg-emerald-500/30" : "bg-border")} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-8 shadow-glass">
            <form onSubmit={handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait">
                {/* ── Step 1: Business ── */}
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold mb-1">Business details</h2>
                      <p className="text-sm text-muted-foreground">Select shop type and enter your business info</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Shop type *</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {SHOP_TYPE_LIST.map((p) => (
                          <button
                            key={p.type}
                            type="button"
                            onClick={() => setShopType(p.type)}
                            className={cn(
                              "rounded-xl border p-3 text-left transition-all",
                              shopType === p.type
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                : "border-border hover:border-primary/40",
                            )}
                          >
                            <span className="text-xl">{p.emoji}</span>
                            <p className="text-sm font-semibold mt-1">{p.label}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{p.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Company / Shop name *</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="FashionHub Pvt Ltd" className="pl-9" {...register("companyName")} />
                      </div>
                      {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Workspace subdomain *</Label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="fashionhub"
                          className="pl-9 lowercase"
                          {...register("subdomain")}
                          onChange={(e) => {
                            e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                            register("subdomain").onChange(e);
                          }}
                        />
                      </div>
                      {subPreview && (
                        <p className="text-xs text-muted-foreground">
                          Your URL: <span className="text-primary font-mono">{subPreview}.shop.hexalyte.com</span>
                        </p>
                      )}
                      {errors.subdomain && <p className="text-xs text-destructive">{errors.subdomain.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Phone number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="+94 77 123 4567" className="pl-9" {...register("phone")} />
                      </div>
                    </div>
                    <Button type="button" className="w-full h-10 font-semibold" variant="gradient" onClick={nextStep}>
                      Continue <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </motion.div>
                )}

                {/* ── Step 2: Admin Account ── */}
                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold mb-1">Admin account</h2>
                      <p className="text-sm text-muted-foreground">This will be your primary login</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>First name *</Label>
                        <Input placeholder="Akila" {...register("adminFirstName")} />
                        {errors.adminFirstName && <p className="text-xs text-destructive">{errors.adminFirstName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Last name *</Label>
                        <Input placeholder="Perera" {...register("adminLastName")} />
                        {errors.adminLastName && <p className="text-xs text-destructive">{errors.adminLastName.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email address *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="email" placeholder="you@company.com" className="pl-9" {...register("adminEmail")} />
                      </div>
                      {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPass ? "text" : "password"}
                          placeholder="Min 8 characters"
                          className="pl-9 pr-9"
                          {...register("adminPassword")}
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1 h-10" onClick={() => setStep(1)}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                      <Button type="button" className="flex-1 h-10 font-semibold" variant="gradient" onClick={nextStep}>
                        Continue <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Region ── */}
                {step === 3 && (
                  <motion.div key="step3" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold mb-1">Region & currency</h2>
                      <p className="text-sm text-muted-foreground">Helps with tax and reporting</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring" {...register("country")}>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring" {...register("currency")}>
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring" {...register("timezone")}>
                        {TIMEZONES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1 h-10" onClick={() => setStep(2)}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                      <Button type="submit" className="flex-1 h-10 font-semibold" variant="gradient" disabled={isLoading}>
                        {isLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            Creating...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Start Free Trial <ArrowRight className="h-4 w-4" />
                          </span>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
