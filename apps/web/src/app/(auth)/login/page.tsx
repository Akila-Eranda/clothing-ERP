"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight, Building2, Sparkles, Tag, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
    <div className="min-h-screen flex bg-background">
      <AuthBrandPanel
        shopType={shopType}
        tenantName={tenantPreview?.name}
        tenantSubdomain={tenantPreview?.subdomain ?? hostnameSlug}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl gradient-primary shadow-glow mb-3">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold">{APP_NAME}</h1>
            {(tenantPreview || hostnameSlug) && (
              <p className="text-sm text-muted-foreground mt-1">
                {tenantPreview?.name ?? hostnameSlug}
              </p>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="glass-card rounded-2xl p-8 shadow-glass"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Welcome back</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {tenantPreview
                  ? `Sign in to ${tenantPreview.name}`
                  : isMainDomain
                    ? "Enter your workspace and account details"
                    : "Sign in to your workspace to continue"}
              </p>
            </div>

            {tenantPreview && !isMainDomain && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{tenantPreview.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {tenantPreview.subdomain}{SHOP_DOMAIN_SUFFIX}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {showSubdomainField && (
                <div className="space-y-2">
                  <Label htmlFor="subdomain">Shop / Workspace</Label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="subdomain"
                      type="text"
                      placeholder="your-shop"
                      value={subdomain}
                      className="pl-9 pr-[7.5rem] lowercase"
                      onChange={(e) =>
                        setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-muted-foreground pointer-events-none">
                      {SHOP_DOMAIN_SUFFIX}
                    </span>
                  </div>
                  {subdomain.trim() && (
                    <button
                      type="button"
                      onClick={openWorkspace}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open {subdomain.trim()}{SHOP_DOMAIN_SUFFIX}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="pl-9"
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-9 pr-9"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="gradient"
                className={cn("w-full h-11 font-semibold mt-2")}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign in <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          </motion.div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Start free trial
            </Link>
          </p>

          <div className="flex items-center justify-center gap-4 mt-6 flex-wrap">
            {["SSL Secured", "Multi-tenant", "Role-based access"].map((badge) => (
              <div key={badge} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-muted-foreground">{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
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
