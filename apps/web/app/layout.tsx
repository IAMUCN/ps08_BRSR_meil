import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/theme";
import { Agentation } from "agentation";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TraceESG",
  description: "Evidence-first ESG/BRSR reporting platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Theme 1 is the default (UI brief §4); the boot script applies the user's own before first paint, so
    // the attribute legitimately differs from the server's on hydration.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
        {process.env.NODE_ENV === "development" && (
          <Agentation endpoint="http://localhost:4747" />
        )}
      </body>
    </html>
  );
}
