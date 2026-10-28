import type { NextConfig } from "next"

/**
 * تنظیمات Next.js «حساب‌یار»
 * توجه: هدر X-Frame-Options عمداً تنظیم نمی‌شود تا مینی‌اپ تلگرام
 * داخل iframe کلاینت‌های تلگرام (web.telegram.org) بدون مشکل باز شود.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
]

const nextConfig: NextConfig = {
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
