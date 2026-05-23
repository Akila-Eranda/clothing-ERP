"use client";

import * as React from "react";
import { Settings, Store, Bell, Shield, Palette, Globe, CreditCard, Printer, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME, APP_VERSION, CURRENCY_SYMBOL } from "@/lib/constants";

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your FashionERP workspace</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5"><Store className="h-3.5 w-3.5" />General</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" />Notifications</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Security</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" />Appearance</TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business Information</CardTitle>
              <CardDescription>Basic details about your business</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input defaultValue="Fashion Store Mumbai" />
                </div>
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input defaultValue="27AABCU9603R1ZX" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input defaultValue="+91 98765 43210" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue="info@fashionstore.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input defaultValue="123, Fashion Street, Bandra West, Mumbai, Maharashtra 400050" />
              </div>
              <Button variant="gradient" size="sm">Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">POS Configuration</CardTitle>
              <CardDescription>Point of sale terminal settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Auto-print receipt after sale", desc: "Automatically print receipt on checkout" },
                { label: "Round off totals", desc: "Round total amount to nearest rupee" },
                { label: "Allow negative stock", desc: "Enable sales even when stock is 0" },
                { label: "Loyalty points on every sale", desc: "Auto-apply loyalty program" },
              ].map((setting) => (
                <div key={setting.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{setting.label}</p>
                    <p className="text-xs text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Switch defaultChecked={setting.label.includes("Loyalty")} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tax Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Default GST Rate (%)</Label>
                  <Input defaultValue="18" type="number" />
                </div>
                <div className="space-y-2">
                  <Label>CGST Rate (%)</Label>
                  <Input defaultValue="9" type="number" />
                </div>
                <div className="space-y-2">
                  <Label>SGST Rate (%)</Label>
                  <Input defaultValue="9" type="number" />
                </div>
              </div>
              <Button variant="gradient" size="sm">Save Tax Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Low stock alerts", desc: "Alert when products fall below minimum stock" },
                { label: "New order notifications", desc: "Notify on every new sale" },
                { label: "Daily sales summary", desc: "Receive end-of-day summary via WhatsApp" },
                { label: "Customer birthday reminders", desc: "Get reminded of customer birthdays" },
                { label: "Payment due alerts", desc: "Alert on overdue supplier payments" },
                { label: "System health alerts", desc: "Notify on backup failures or sync errors" },
              ].map((n) => (
                <div key={n.label} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password & Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Current Password</Label><Input type="password" placeholder="••••••••" /></div>
              <div className="space-y-2"><Label>New Password</Label><Input type="password" placeholder="••••••••" /></div>
              <div className="space-y-2"><Label>Confirm Password</Label><Input type="password" placeholder="••••••••" /></div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">Add extra security with 2FA via authenticator app</p>
                </div>
                <Switch />
              </div>
              <Button variant="gradient" size="sm">Update Password</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme & Display</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {["Light", "Dark", "System"].map((theme) => (
                  <button key={theme} className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${theme === "Dark" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>
                    {theme}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-xl gradient-primary text-white mb-4">
                <p className="text-sm font-semibold opacity-80">Current Plan</p>
                <p className="text-2xl font-bold mt-1">Enterprise</p>
                <p className="text-sm opacity-80 mt-1">Valid until Dec 31, 2025</p>
              </div>
              <div className="space-y-2 text-sm">
                {["Unlimited products & variants", "All POS terminals", "AI insights & analytics", "Multi-branch support", "API access", "Priority support"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {f}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">{APP_NAME} v{APP_VERSION} · Enterprise Edition</p>
    </div>
  );
}
