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
  // SEC-09: HSTS — مرورگر را وادار می‌کند همیشه HTTPS بزند (پشت ArvanCloud/nginx TLS است)
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  { key: "Content-Security-Policy", value: csp },
]

/**
 * کش مرورگر برای فایل‌های عمومی ثابت پوشهٔ public (آیکون، لوگوی بانک‌ها، فونت، مانیفست)
 * پیش‌فرض Next برای public «max-age=0» است و هر بار باز شدن اپ همه را دوباره از سرور می‌پرسید.
 * /_next/static خودش immutable یک‌ساله است. sw.js همیشه no-cache می‌ماند تا نسخهٔ تازه دیر نرسد.
 * اگر فایلی را با همان نام عوض کردید، مثل آیکون‌ها ?v= آدرسش را بالا ببرید.
 */
const WEEK = "public, max-age=604800, stale-while-revalidate=86400"
const MONTH = "public, max-age=2592000, stale-while-revalidate=86400"
const staticCache = [
  { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: MONTH }] },
  { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: WEEK }] },
  { source: "/banks/:path*", headers: [{ key: "Cache-Control", value: WEEK }] },
  { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: WEEK }] },
  {
    source: "/:file(favicon\\.ico|logo\\.svg|robots\\.txt|apple-touch-icon\\.png|apple-touch-icon-precomposed\\.png)",
    headers: [{ key: "Cache-Control", value: WEEK }],
  },
  { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
  { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
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
      ...staticCache,
    ]
  },
}

export default nextConfig
