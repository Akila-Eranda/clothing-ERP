"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { AppLogo } from "@/components/brand/app-logo";

const schema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [done, setDone] = React.useState(false);
  const [showPwd, setShowPwd] = React.useState(false);
  const [apiError, setApiError] = React.useState("");

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const pwdValue = watch("newPassword", "");

  const strength = Math.min(4, [
    pwdValue.length >= 8,
    /[A-Z]/.test(pwdValue),
    /[0-9]/.test(pwdValue),
    /[^A-Za-z0-9]/.test(pwdValue),
  ].filter(Boolean).length);

  const strengthColors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"];
  const strengthLabels = ["Too short", "Weak", "Fair", "Strong"];

  const onSubmit = async (data: FormData) => {
    if (!token) {
      setApiError("Reset link is missing or invalid. Please request a new one.");
      return;
    }
    setApiError("");
    try {
      await authApi.resetPassword(token, data.newPassword);
      setDone(true);
    } catch (err: any) {
      setApiError(err?.message ?? "The link may have expired. Please request a new one.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background mesh-bg relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md mx-4"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <AppLogo variant="compact" theme="light" className="items-center mx-auto" />
        </div>

        <div className="glass-card rounded-2xl p-8 shadow-glass">
          {done ? (
            /* ── Success ── */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-2"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-5">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Password updated!</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Your password has been reset. All existing sessions have been signed out for security.
              </p>
              <Button asChild className="w-full h-10 font-semibold" variant="gradient">
                <Link href="/login">
                  <span>Sign in now</span>
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </motion.div>
          ) : (
            /* ── Form ── */
            <>
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Set new password</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose a strong password for your account.</p>
              </div>

              {!token && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Reset link is missing or invalid. Please request a new one.</span>
                </div>
              )}

              {apiError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{apiError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPwd ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      className="pr-9"
                      autoFocus
                      {...register("newPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {pwdValue.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className={`h-1 flex-1 rounded-full transition-all ${n <= strength ? strengthColors[strength - 1] : "bg-border"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{strengthLabels[strength - 1] ?? ""}</p>
                    </div>
                  )}
                  {errors.newPassword && (
                    <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type={showPwd ? "text" : "password"}
                    placeholder="Re-enter password"
                    {...register("confirm")}
                  />
                  {errors.confirm && (
                    <p className="text-xs text-destructive">{errors.confirm.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 font-semibold"
                  variant="gradient"
                  disabled={isSubmitting || !token}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Resetting...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      Reset password
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        {!done && (
          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
