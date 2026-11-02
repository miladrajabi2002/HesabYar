import type { Metadata, Viewport } from "next"
import Script from "next/script"
import "@fontsource/vazirmatn/400.css"
import "@fontsource/vazirmatn/500.css"
import "@fontsource/vazirmatn/600.css"
import "@fontsource/vazirmatn/700.css"
import "@fontsource/vazirmatn/800.css"
import "./globals.css"
import { Providers } from "@/components/providers"

export const metadata: Metadata = {
  title: {
    default: "حساب‌یار | حسابداری فروشگاهی",
    template: "%s | حساب‌یار",
  },
  description:
    "حساب‌یار — نرم‌افزار حسابداری فروشگاه با تقویم شمسی: فاکتور خرید و فروش، مدیریت چک و سررسید، طلب و بستانکار اشخاص، موجودی انبار، گزارش سود و هشدارهای هوشمند تلگرام",
  applicationName: "حساب‌یار",
  keywords: ["حسابداری فروشگاه", "فاکتور خرید و فروش", "مدیریت چک", "تقویم شمسی", "حساب‌یار"],
  robots: { index: false, follow: false },
  // SEC-02: PWA — نصب روی صفحه اصلی مثل اپ واقعی
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "حساب‌یار",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0e" },
  ],
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans antialiased">
        {/* اسکریپت رسمی مینی‌اپ تلگرام */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
