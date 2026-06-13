"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight, Building2, Sparkles, Tag, ExternalLink, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/constants";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import {
  getHostnameTenantSlug,
  isMainShopLoginDomain,
  SHOP_DOMAIN_SUFFIX,
  tenantLoginUrl,
} from "@/lib/auth-host";
import { ShopType } from "@/lib/shop-profiles";
import { useAuthStore } from "@/stores/auth-store";

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

  const urlTenant = searchParams.get("tenant");
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
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/tenants/resolve/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json();
        return (json.data ?? json) as TenantPreview;
      })
      .then((data) => {
        if (!cancelled && data?.subdomain) setTenantPreview(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hostnameSlug, subdomain, isMainDomain]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const effectiveSlug = hostnameSlug ?? (subdomain.trim() || undefined);
  const shopType = tenantPreview?.shopType ?? ShopType.CLOTHING;
  const showSubdomainField = isMainDomain;

  const onSubmit = async (data: LoginForm) => {
    if (isMainDomain && !subdomain.trim()) {
      toast.error("Enter your shop subdomain to continue");
      return;
    }
    setIsLoading(true);
    try {
      await loginWithApi(data.email, data.password, effectiveSlug);
      toast.success("Welcome back!");
      const from = searchParams.get("from");
      window.location.href = from && from.startsWith("/") ? from : "/dashboard";
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
    <div className="min-h-screen flex">
      <AuthBrandPanel
        shopType={shopType}
        tenantName={tenantPreview?.name}
        tenantSubdomain={tenantPreview?.subdomain ?? hostnameSlug}
      />

      {/* Right — clean white form panel */}
      <div className="flex-1 flex flex-col bg-white relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg opacity-40 pointer-events-none" />
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-indigo-100/60 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-violet-100/50 blur-3xl pointer-events-none" />

        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 self-start">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">{APP_NAME}</span>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Sign in</p>
              <h2 className="text-3xl font-bold text-foreground tracking-tight">Welcome back</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {tenantPreview
                  ? `Access your ${tenantPreview.name} dashboard`
                  : isMainDomain
                    ? "Enter your workspace URL and credentials"
                    : "Enter your credentials to continue"}
              </p>
            </div>

            {tenantPreview && !isMainDomain && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3.5 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{tenantPreview.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {tenantPreview.subdomain}{SHOP_DOMAIN_SUFFIX}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {showSubdomainField && (
                <div className="space-y-2">
                  <Label htmlFor="subdomain" className="text-foreground font-medium">
                    Workspace subdomain
                  </Label>
                  <div className="relative">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="subdomain"
                      type="text"
                      placeholder="your-shop"
                      value={subdomain}
                      className="pl-10 pr-[8rem] h-12 rounded-xl border-border bg-white lowercase text-base shadow-sm focus-visible:ring-primary/30"
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
                <Label htmlFor="email" className="text-foreground font-medium">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="pl-10 h-12 rounded-xl border-border bg-white text-base shadow-sm focus-visible:ring-primary/30"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                  <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-10 pr-11 h-12 rounded-xl border-border bg-white text-base shadow-sm focus-visible:ring-primary/30"
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
                disabled={isLoading}
              >
                {isLoading ? (
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

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-semibold text-primary hover:underline">
                  Start 14-day free trial
                </Link>
              </p>
            </div>
          </motion.div>
        </div>

        <p className="relative text-center text-[11px] text-muted-foreground pb-6 px-4">
          © {new Date().getFullYear()} {APP_NAME} · Secure multi-tenant retail platform
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:block lg:w-[58%] bg-[#070d1a]" />
      <div className="flex-1 flex items-center justify-center bg-white">
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
