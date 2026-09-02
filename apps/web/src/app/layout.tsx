import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { fontMono, fontSans } from "@/lib/fonts";
import { Toaster } from "sonner";
import "./globals.css";
import "./retail-theme.css";
import "./pos-layouts.css";
import "./pos-retail-theme.css";

export const metadata: Metadata = {
  title: {
    default: "Hexalyte — Enterprise Retail Management",
    template: "%s | Hexalyte",
  },
  description:
    "Hexalyte — AI-powered ERP, POS & inventory management for retail stores, boutiques, and multi-branch businesses.",
  keywords: ["hexalyte", "pos system", "retail management", "inventory", "erp"],
  authors: [{ name: "Hexalyte" }],
  creator: "Hexalyte",
  icons: {
    icon: "/brand/hexalyte-innovation.png",
    apple: "/brand/hexalyte-innovation.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#080C14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="fashionerp-theme"
          disableTransitionOnChange={false}
        >
          <QueryProvider>
            {children}
            <Toaster
              position="top-right"
              richColors
              expand={false}
              toastOptions={{
                classNames: {
                  toast: "glass-card",
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
