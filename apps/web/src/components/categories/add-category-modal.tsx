"use client";

import React, { useState } from "react";
import { X, Tag, Loader2, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId?: string | null;
  children: CategoryItem[];
  _count: { children: number; products: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories: CategoryItem[];
  parentId?: string;
}

interface Form {
  name: string;
  description: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
}

const INIT: Form = { name: "", description: "", parentId: "", sortOrder: "0", isActive: true };

export function AddCategoryModal({ open, onClose, onCreated, categories, parentId }: Props) {
  const [form, setForm] = useState<Form>({ ...INIT, parentId: parentId ?? "" });
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const handleClose = () => { setForm({ ...INIT, parentId: parentId ?? "" }); onClose(); };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    setLoading(true);
    try {
      await api.post("/categories", {
        name: form.name.trim(),
        description: form.description || undefined,
        parentId: form.parentId || undefined,
      });
      toast.success(`Category "${form.name}" created successfully!`);
      onCreated();
      handleClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create category");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Tag className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Add New Category</h2>
            <p className="text-xs text-muted-foreground">Create a product category or subcategory</p>
          </div>
          <button onClick={handleClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Category Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Men's Wear"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          </div>

          {/* Parent category */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5" /> Parent Category
                <span className="text-muted-foreground font-normal">(optional — leave empty for root)</span>
              </span>
            </Label>
            <Select value={form.parentId} onValueChange={(v) => set("parentId", v === "_root" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="— Root category (no parent) —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_root">— Root category (no parent) —</SelectItem>
                {categories.map((c) => (
                  <React.Fragment key={c.id}>
                    <SelectItem value={c.id}>{c.name}</SelectItem>
                    {c.children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        &nbsp;&nbsp;&nbsp;↳ {child.name}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Brief description of this category..."
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-muted/20">
            <div>
              <p className="text-sm font-semibold">Active</p>
              <p className="text-xs text-muted-foreground">Category will be visible in the catalog</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </div>
        </div>

        {/* Footer */}
        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[120px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
            Add Category
          </Button>
        </div>
      </div>
    </div>
  );
}
