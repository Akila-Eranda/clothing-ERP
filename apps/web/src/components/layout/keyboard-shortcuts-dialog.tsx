"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { POS_SHORTCUT_SECTIONS } from "@/components/pos/pos-shortcuts";

const APP_SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: "Global",
    items: [
      ["⇧⌘P / Ctrl+Shift+P", "Open My Profile"],
      ["⌘, / Ctrl+,", "Open Settings"],
      ["?", "Keyboard shortcuts"],
      ["⇧⌘Q / Ctrl+Shift+Q", "Sign out"],
    ],
  },
  {
    title: "Navigation",
    items: [
      ["⌘K / Ctrl+K", "Focus search (coming soon)"],
      ["POS Terminal button", "Open POS overlay"],
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutTable({ sections }: { sections: { title: string; items: [string, string][] }[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {section.title}
          </p>
          <div className="rounded-lg border divide-y">
            {section.items.map(([keys, desc]) => (
              <div key={keys} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="shrink-0 rounded border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Quick keys for the dashboard and POS terminal.</DialogDescription>
        </DialogHeader>
        <ShortcutTable sections={APP_SHORTCUTS} />
        <ShortcutTable sections={POS_SHORTCUT_SECTIONS} />
      </DialogContent>
    </Dialog>
  );
}
