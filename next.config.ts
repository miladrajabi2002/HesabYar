import type { NextConfig } from "next"

/**
 * تنظیمات Next.js «حساب‌یار»
 * SEC-06: CSP هوشمند — فقط تلگرام اجازه iframe دارد (به‌جای X-Frame-Options که همه را می‌بندد)
 */
const isProd = process.env.NODE_ENV === "production"

const csp = [
  "default-src 'self'",
  // Next.js برای هیدریشن به اسکریپت inline نیاز دارد؛ استایل‌های Tailwind هم inline هستند
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://telegram.org`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.telegram.org",
  // فقط کلاینت‌های تلگرام و خودِ اپ می‌توانند داخل iframe باز کنند
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  isProd ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: csp },
]

const nextConfig: NextConfig = {
  // نسخهٔ آزمایشی کنار پروداکشن خروجی بیلدش را جدا نگه می‌دارد تا .next اصلی دست نخورد
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
