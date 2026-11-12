import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/theme";
import { FeedbackWidget } from "@/components/dev/feedback-widget";
import { ServiceWorker } from "@/components/shell/service-worker";
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
  title: "EmeilSG",
  description: "Evidence-first ESG/BRSR reporting platform",
  // Installable on phones and desktops (feature_enhancement.md 9.2; app/manifest.ts).
  applicationName: "EmeilSG",
  appleWebApp: { capable: true, title: "EmeilSG", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#37358f",
  // The content may sit under a phone's notch and home bar; the bottom navigation pads itself for it.
  viewportFit: "cover",
};

/**
 * Mobile detection script runs synchronously before first paint.
 * If opened on a mobile device (phone UA, touch with physical screen min < 768px, or mobile phone),
 * it adds "is-mobile-device" to <html> and enforces the mobile viewport meta tag even if the mobile
 * browser had "Desktop site" requested/cached.
 */
const MOBILE_BOOT_SCRIPT = `(function(){try{var t=navigator.maxTouchPoints>0,w=window.screen.width,h=window.screen.height,m=Math.min(w,h),u=/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent);if((t&&m<768)||u){document.documentElement.classList.add("is-mobile-device");var v=document.querySelector('meta[name="viewport"]');if(v){v.setAttribute("content","width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover")}}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Theme 1 is the default (UI brief §4); the boot script applies the user's own before first paint, so
    // the attribute legitimately differs from the server's on hydration.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      // No custom-cursor-enabled here: Pointer adds it once its cursor is drawn, so the system cursor is never
      // hidden on a touch device, before hydration, or when the page's JavaScript fails.
      className={`${inter.variable} ${jetbrainsMono.variable} ${lora.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MOBILE_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to main content
        </a>
        <CustomCursor />
        {children}
        <Toaster />
        <ServiceWorker />
        {process.env.NODE_ENV === "development" && <FeedbackWidget />}
      </body>
    </html>
  );
}
