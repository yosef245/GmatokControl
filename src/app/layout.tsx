import type { Metadata, Viewport } from "next";
import { Assistant, Suez_One } from "next/font/google";
import "./globals.css";

const body = Assistant({ subsets: ["hebrew", "latin"], variable: "--font-body" });
const display = Suez_One({ subsets: ["hebrew", "latin"], weight: "400", variable: "--font-display-face" });

export const metadata: Metadata = {
  title: "גוונים של מתוק · ניהול ייצור",
  description: "הזמנות, לוח ייצור, מלאי חומרי גלם ומשלוחים",
};

export const viewport: Viewport = { themeColor: "#6b3a24", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
