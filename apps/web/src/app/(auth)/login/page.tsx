"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  TrendingUp, Package, Users, Zap, BarChart3, ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type LoginForm = z.infer<typeof loginSchema>;

const FEATURES = [
  { icon: BarChart3,  label: "AI Analytics",    desc: "Real-time sales insights" },
  { icon: ShoppingBag, label: "Smart POS",       desc: "Offline-ready terminal" },
  { icon: Package,    label: "Inventory",        desc: "Live stock management" },
  { icon: Users,      label: "Multi-Branch",     desc: "Centralised control" },
];

const STATS = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "< 1s",  label: "API latency" },
  { value: "256-bit", label: "Encryption" },
];

function LoginContent() {
  const { loginWithApi } = useAuthStore();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [emailFocused, setEmailFocused] = React.useState(false);
  const [passFocused, setPassFocused] = React.useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await loginWithApi(data.email, data.password);
      toast.success("Welcome back!");
      const from = searchParams.get("from");
      window.location.href = from && from.startsWith("/") ? from : "/dashboard";
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#070d1a" }}>

      {/* ── LEFT BRAND PANEL ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative flex-col overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)" }}>

        {/* Animated grid */}
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(rgba(79,110,247,1) 1px, transparent 1px), linear-gradient(90deg, rgba(79,110,247,1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        {/* Glow orbs */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #4f6ef7 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 right-0 w-[400px] h-[400px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full opacity-10"
          style={{ background: "radial-gradient(ellipse, #4f6ef7 0%, transparent 60%)" }} />

        <div className="relative z-10 flex flex-col h-full p-12 xl:p-16">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-auto">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #4f6ef7, #7c3aed)" }}>
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">FashionERP</span>
              <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: "rgba(79,110,247,0.3)", border: "1px solid rgba(79,110,247,0.5)" }}>
                PRO
              </span>
            </div>
          </motion.div>

          {/* Hero text */}
          <motion.div className="my-12" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-4">
              The future of<br />
              <span style={{ background: "linear-gradient(135deg, #4f6ef7, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                fashion retail
              </span>
            </h1>
            <p className="text-base xl:text-lg leading-relaxed" style={{ color: "#6a8ab8" }}>
              AI-powered ERP built for modern clothing businesses. Manage inventory, sales, and customers from one unified platform.
            </p>
          </motion.div>

          {/* Feature list */}
          <motion.div className="grid grid-cols-2 gap-3 mb-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
            {FEATURES.map((f, i) => (
              <motion.div key={f.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.08 }}
                className="flex items-start gap-3 p-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(79,110,247,0.15)" }}>
                <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(79,110,247,0.15)" }}>
                  <f.icon className="h-4 w-4" style={{ color: "#4f6ef7" }} />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{f.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4a6a8a" }}>{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div className="flex items-center gap-8 pt-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
            style={{ borderTop: "1px solid rgba(79,110,247,0.15)" }}>
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-white font-black text-xl">{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "#4a6a8a" }}>{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative"
        style={{ background: "#070d1a" }}>

        {/* Mobile logo */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4f6ef7, #7c3aed)" }}>
            <Zap className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-white font-bold text-lg">FashionERP</span>
        </motion.div>

        <motion.div className="w-full max-w-[400px]"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="text-sm mt-1.5" style={{ color: "#4a6a8a" }}>Sign in to your workspace to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold mb-2" style={{ color: "#a0b4d4" }}>
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#4a6a8a" }} />
                <input id="email" type="email" placeholder="you@company.com" autoComplete="email"
                  className="w-full h-12 pl-10 pr-4 rounded-xl text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#fff",
                    border: `1px solid ${emailFocused ? "rgba(79,110,247,0.6)" : "rgba(79,110,247,0.2)"}`,
                    boxShadow: emailFocused ? "0 0 0 3px rgba(79,110,247,0.1)" : "none" }}
                  onFocus={() => setEmailFocused(true)}
                  {...register("email", { onBlur: () => setEmailFocused(false) })} />
              </div>
              {errors.email && <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="text-xs font-semibold" style={{ color: "#a0b4d4" }}>Password</label>
                <Link href="/forgot-password" className="text-xs font-medium transition-colors hover:opacity-80" style={{ color: "#4f6ef7" }}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#4a6a8a" }} />
                <input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" autoComplete="current-password"
                  className="w-full h-12 pl-10 pr-11 rounded-xl text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${passFocused ? "rgba(79,110,247,0.6)" : "rgba(79,110,247,0.2)"}`,
                    boxShadow: passFocused ? "0 0 0 3px rgba(79,110,247,0.1)" : "none" }}
                  onFocus={() => setPassFocused(true)}
                  {...register("password", { onBlur: () => setPassFocused(false) })} />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#4a6a8a" }}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button type="submit" disabled={isLoading}
              className="w-full h-12 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all mt-2"
              style={{ background: isLoading ? "rgba(79,110,247,0.5)" : "linear-gradient(135deg, #4f6ef7, #7c3aed)", cursor: isLoading ? "not-allowed" : "pointer" }}
              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.opacity = "0.92"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
              {isLoading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                  Signing in...
                </>
              ) : (
                <>Sign in <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>


          {/* Register */}
          <p className="text-center text-sm mt-6" style={{ color: "#4a6a8a" }}>
            Don&apos;t have an account?{" "}
            <a href="/register" className="font-semibold transition-colors hover:opacity-80" style={{ color: "#4f6ef7" }}>
              Start free trial
            </a>
          </p>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-5 mt-8">
            {["SSL Secured", "GDPR Ready", "SOC 2"].map((badge) => (
              <div key={badge} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#10b981" }} />
                <span className="text-[11px] font-medium" style={{ color: "#4a6a8a" }}>{badge}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ background: "#070d1a", minHeight: "100vh" }} />}>
      <LoginContent />
    </Suspense>
  );
}
