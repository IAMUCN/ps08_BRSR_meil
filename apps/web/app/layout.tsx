import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { CustomCursor } from "@/components/ui/custom-cursor";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-heading-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "TraceESG",
  description: "Evidence-first ESG/BRSR reporting platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Theme 1 is the default (UI brief §4); per-user switching is wired in Phase 19.
    <html
      lang="en"
      data-theme="theme-1"
      className={`${inter.variable} ${jetbrainsMono.variable} ${lora.variable} h-full antialiased custom-cursor-enabled`}
    >
      <body className="flex min-h-full flex-col">
        <CustomCursor />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
