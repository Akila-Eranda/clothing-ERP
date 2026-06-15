"use client";

import * as React from "react";
import { LifeBuoy, Mail, ExternalLink, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";

const SUPPORT_EMAIL = "support@hexalyte.com";
const SUPPORT_URL = "https://hexalyte.com/support";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportDialog({ open, onOpenChange }: SupportDialogProps) {
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast.success("Support email copied");
    } catch {
      toast.error("Could not copy email");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            {APP_NAME} Support
          </DialogTitle>
          <DialogDescription>
            Need help with billing, setup, or a bug? Our team can assist you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Email support</p>
              <p className="text-muted-foreground">{SUPPORT_EMAIL}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyEmail} className="gap-1.5 shrink-0">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button asChild className="gap-1.5 flex-1">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} support request`)}`}>
                <Mail className="h-4 w-4" /> Send email
              </a>
            </Button>
            <Button variant="outline" asChild className="gap-1.5 flex-1">
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Help center
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
