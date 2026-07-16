import { Inter, JetBrains_Mono } from "next/font/google";

/** Primary UI font — English-only, full Latin glyph coverage */
export const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  adjustFontFallback: true,
});

/** SKUs, codes, invoice numbers */
export const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
