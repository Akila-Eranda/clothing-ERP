import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

/** Primary UI font — dashboard, admin, auth, POS chrome */
export const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/** SKUs, codes, invoice numbers */
export const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
