"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight, Tag, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME, STARTER_TRIAL_DAYS } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import {
  getHostnameTenantSlug,
  isMainShopLoginDomain,
  SHOP_DOMAIN_SUFFIX,
  tenantLoginUrl,
} from "@/lib/auth-host";
import { ShopType } from "@/lib/shop-profiles";
import { useAuthStore } from "@/stores/auth-store";
import { isPosOnlyRole, POS_HOME_PATH } from "@/lib/role-access";
import { MaintenanceBanner, useMaintenanceStatus } from "@/components/maintenance/maintenance-banner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type LoginForm = z.infer<typeof loginSchema>;

interface TenantPreview {
  name: string;
  subdomain: string;
  shopType: ShopType;
}

function LoginContent() {
  const { loginWithApi } = useAuthStore();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isMainDomain, setIsMainDomain] = React.useState(false);
  const [hostnameSlug, setHostnameSlug] = React.useState<string | null>(null);
  const [tenantPreview, setTenantPreview] = React.useState<TenantPreview | null>(null);
  const [tenantPreviewLoading, setTenantPreviewLoading] = React.useState(false);
  const { status: maintenance, isMaintenance } = useMaintenanceStatus(45_000);

  const urlTenant = searchParams.get("tenant");
  const urlEmail = searchParams.get("email");
  const [subdomain, setSubdomain] = React.useState(urlTenant || "");

  React.useEffect(() => {
    setIsMainDomain(isMainShopLoginDomain());
    const slug = getHostnameTenantSlug();
    setHostnameSlug(slug);
    if (slug && !urlTenant) setSubdomain(slug);
  }, [urlTenant]);

  React.useEffect(() => {
    const slug = hostnameSlug ?? (subdomain.trim() || null);
    if (!slug || isMainDomain) {
      setTenantPreview(null);
      setTenantPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setTenantPreviewLoading(true);
    fetch(`${API_BASE}/tenants/resolve/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json();
        return (json.data ?? json) as TenantPreview;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.subdomain) setTenantPreview(data);
        else setTenantPreview(null);
      })
      .catch(() => {
        if (!cancelled) setTenantPreview(null);
      })
      .finally(() => {
        if (!cancelled) setTenantPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [hostnameSlug, subdomain, isMainDomain]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: urlEmail ?? "", password: "" },
  });

  React.useEffect(() => {
    if (urlEmail) setValue("email", urlEmail);
  }, [urlEmail, setValue]);

  const effectiveSlug = hostnameSlug ?? (subdomain.trim() || undefined);
  // Never default to CLOTHING on a tenant host — that caused login FOUC
  const shopType = tenantPreview?.shopType ?? null;
  const showSubdomainField = isMainDomain;

  const onSubmit = async (data: LoginForm) => {
    if (isMaintenance) {
      toast.error(maintenance?.message ?? "System is under maintenance");
      return;
    }
    if (isMainDomain && !subdomain.trim()) {
      toast.error("Enter your shop subdomain to continue");
      return;
    }
    if (!isMainDomain && !effectiveSlug) {
      toast.error("Open your shop login URL (your-shop.shop.hexalyte.com)");
      return;
    }
    setIsLoading(true);
    try {
      const email = data.email.trim().toLowerCase();
      await loginWithApi(email, data.password, effectiveSlug);
      toast.success("Welcome back!");
      const from = searchParams.get("from");
      const role = useAuthStore.getState().user?.role;
      const cashier = isPosOnlyRole(role);
      const defaultPath = cashier ? POS_HOME_PATH : "/dashboard";
      const target =
        from && from.startsWith("/") && !cashier ? from : defaultPath;
      window.location.href = target;
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const openWorkspace = () => {
    const slug = subdomain.trim().toLowerCase();
    if (!slug) {
      toast.error("Enter your shop subdomain first");
      return;
    }
    window.location.href = tenantLoginUrl(slug);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <AuthBrandPanel
        shopType={shopType}
        tenantName={tenantPreview?.name}
        tenantSubdomain={tenantPreview?.subdomain ?? hostnameSlug}
        loading={Boolean(hostnameSlug) && !isMainDomain && (tenantPreviewLoading || !tenantPreview)}
      />

      {/* Right — login form (always light; see (auth)/layout.tsx) */}
      <div className="flex-1 flex flex-col min-h-screen bg-white relative overflow-hidden lg:w-1/2 text-slate-900">
        <div className="absolute inset-0 mesh-bg opacity-30 pointer-events-none" />
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-indigo-100/60 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-violet-100/50 blur-3xl pointer-events-none" />

        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-10 flex justify-center w-full">
              <AppLogo variant="login" theme="light" className="items-center mx-auto w-full" />
            </div>

            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Sign in</p>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
              <p className="text-sm text-slate-500 mt-2">
                {tenantPreview
                  ? `Enter your credentials for ${tenantPreview.name}`
                  : isMainDomain
                    ? "Enter your workspace URL and credentials"
                    : "Enter your credentials to continue"}
              </p>
            </div>

            {isMaintenance && (
              <div className="mb-6 rounded-xl overflow-hidden border border-amber-300">
                <MaintenanceBanner compact />
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {showSubdomainField && (
                <div className="space-y-2">
                  <Label htmlFor="subdomain" className="text-slate-800 font-medium">
                    Workspace subdomain
                  </Label>
                  <div className="relative">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="subdomain"
                      type="text"
                      placeholder="your-shop"
                      value={subdomain}
                      className="pl-10 pr-[8rem] h-12 rounded-xl border-slate-200 bg-white lowercase text-base text-slate-900 shadow-sm focus-visible:ring-primary/30"
                      onChange={(e) =>
                        setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-muted-foreground pointer-events-none font-medium">
                      {SHOP_DOMAIN_SUFFIX}
                    </span>
                  </div>
                  {subdomain.trim() && (
                    <button
                      type="button"
                      onClick={openWorkspace}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      Go to {subdomain.trim()}{SHOP_DOMAIN_SUFFIX}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-800 font-medium">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="pl-10 h-12 rounded-xl border-slate-200 bg-white text-slate-900 text-base shadow-sm focus-visible:ring-primary/30"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-800 font-medium">Password</Label>
                  <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-10 pr-11 h-12 rounded-xl border-slate-200 bg-white text-slate-900 text-base shadow-sm focus-visible:ring-primary/30"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <Button
                type="submit"
                variant="gradient"
                className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/25 mt-1"
                disabled={isLoading || isMaintenance}
              >
                {isMaintenance ? (
                  <span>Login disabled — Maintenance Mode</span>
                ) : isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign in to dashboard <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <p className="text-center text-sm text-slate-500">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-semibold text-primary hover:underline">
                  Start {STARTER_TRIAL_DAYS}-day free trial
                </Link>
              </p>
            </div>
          </motion.div>
        </div>

        <p className="relative shrink-0 text-center text-[11px] text-slate-400 pb-6 px-4">
          © {new Date().getFullYear()} {APP_NAME} · Secure multi-tenant retail platform
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:block lg:w-1/2 bg-[#070d1a]" />
      <div className="flex-1 flex items-center justify-center bg-white min-h-screen">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
