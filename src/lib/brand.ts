/**
 * برند «حساب‌یار» (نسخهٔ ۵) — نشانهٔ ساده: تیکِ «حساب درست» که هم‌زمان خط رشد است
 * و به یک سکهٔ طلایی می‌رسد، روی کاشی زمردی؛ یک خط دفتر زیرش.
 * نسخهٔ رشته‌ای SVG (برای HTML چاپ، صورتحساب و ساخت آیکون‌های PWA) + رنگ‌های برند.
 */
export const BRAND_TEAL = "#0b7a62"
export const BRAND_TEAL_DARK = "#075543"
export const BRAND_TEAL_LIGHT = "#14b38e"
export const BRAND_GOLD = "#f5a524"

/** مسیرهای نشانه — مشترک بین SVG رشته‌ای و کامپوننت React */
export const BRAND_MARK = {
  /** تیک / خط رشد */
  check: "M13.5 25.5l6.6 6.4L32 18.6",
  /** سکه */
  coin: { cx: 34.6, cy: 15.6, r: 4.6 },
  /** خط دفتر */
  ledger: { x: 13.5, y: 36.2, w: 21, h: 3.2 },
} as const

/** لوگوی کامل — SVG مستقل (برای درج در HTML چاپ) */
export function brandSvg(size = 44, id = "hy-brand"): string {
  const { check, coin, ledger } = BRAND_MARK
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="حساب‌یار">
  <defs>
    <linearGradient id="${id}-g" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1cc79d"/>
      <stop offset="0.5" stop-color="#0b8a6d"/>
      <stop offset="1" stop-color="#05503f"/>
    </linearGradient>
    <radialGradient id="${id}-s" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10 4) rotate(55) scale(34)">
      <stop stop-color="#fff" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-c" x1="30" y1="11" x2="39" y2="20" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffd86b"/>
      <stop offset="1" stop-color="#f08c00"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#${id}-g)"/>
  <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#${id}-s)"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" stroke="#fff" stroke-opacity="0.16"/>
  <rect x="${ledger.x}" y="${ledger.y}" width="${ledger.w}" height="${ledger.h}" rx="${ledger.h / 2}" fill="#fff" fill-opacity="0.38"/>
  <path d="${check}" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${coin.cx}" cy="${coin.cy}" r="${coin.r}" fill="url(#${id}-c)" stroke="#fff" stroke-width="2.2"/>
</svg>`
}

/** لوگوی پیش‌فرض ۴۴ پیکسلی (سازگاری با کد قبلی) */
export const BRAND_SVG = brandSvg(44)
