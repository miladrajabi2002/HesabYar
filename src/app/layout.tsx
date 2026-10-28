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
    default: "حساب‌یار | حسابداری شخصی",
    template: "%s | حساب‌یار",
  },
  description:
    "حساب‌یار — اپلیکیشن حسابداری شخصی با تقویم شمسی: مدیریت حساب‌ها، تراکنش‌ها، بودجه‌بندی، بدهی و طلب، گزارش‌های مالی و هشدارهای هوشمند تلگرام",
  applicationName: "حساب‌یار",
  keywords: ["حسابداری شخصی", "مدیریت مالی", "تقویم شمسی", "بودجه‌بندی", "حساب‌یار"],
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0E7C66",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans antialiased">
        {/* اسکریپت رسمی مینی‌اپ تلگرام */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
