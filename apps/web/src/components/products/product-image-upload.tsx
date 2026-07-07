"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { resolvePublicAssetUrl, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

interface ProductImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
  className?: string;
}

export function ProductImageUpload({
  images,
  onChange,
  maxImages = 8,
  disabled = false,
  className,
}: ProductImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

    const toUpload = list.slice(0, remaining);
    if (list.length > remaining) {
      toast.message(`Only ${remaining} more image(s) can be added`);
    }

    setUploading(true);
    const next = [...images];
    try {
      for (const file of toUpload) {
        if (!ALLOWED.includes(file.type)) {
          toast.error(`${file.name}: use PNG, JPG, WEBP or GIF`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: must be under 5MB`);
          continue;
        }
        const uploaded = await uploadFile(file, "products");
        next.push(uploaded.url);
      }
      if (next.length > images.length) {
        onChange(next);
        toast.success("Image uploaded");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-3", className)}>
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group aspect-square rounded-xl border bg-muted/30 overflow-hidden">
              <img
                src={resolvePublicAssetUrl(url)}
                alt={`Product ${i + 1}`}
                className="h-full w-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-background/90 border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {i === 0 && (
                <span className="absolute bottom-1.5 left-1.5 text-[10px] font-medium bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {images.length < maxImages && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled && !uploading && e.dataTransfer.files?.length) {
              void uploadFiles(e.dataTransfer.files);
            }
          }}
          className={cn(
            "rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-2 text-center transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50 hover:bg-muted/20",
          )}
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
          ) : (
            <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
          )}
          <p className="text-sm font-medium">
            {uploading ? "Uploading…" : "Click or drag images here"}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WEBP or GIF · max 5MB each · {images.length}/{maxImages}
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" disabled={disabled || uploading}>
            <Upload className="h-3.5 w-3.5" /> Choose files
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
        }}
      />
    </div>
  );
}
