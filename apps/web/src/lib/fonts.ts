import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

/** Primary UI font — professional Google Font for ERP / retail dashboards */
export const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
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
