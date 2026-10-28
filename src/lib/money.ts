/**
 * قالب‌بندی یکسان مبالغ و اعداد فارسی — lib/money.ts
 * همه مبالغ به «تومان» و با ارقام فارسی نمایش داده می‌شوند.
 */

const faInt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 })
const faOneDecimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 })

/** تبدیل ارقام لاتین به فارسی */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
}

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
}

/** عدد با ارقام فارسی و جداکننده هزارگان */
export function formatNumberFa(n: number): string {
  return faInt.format(Math.round(n))
}

/** نمایش مبلغ تومانی کامل: «۱٬۲۵۰٬۰۰۰ تومان» */
export function formatToman(amount: number, withUnit = true): string {
  const s = faInt.format(Math.round(amount))
  return withUnit ? `${s} تومان` : s
}

/** نمایش فشرده مبلغ: «۲٫۵ میلیون تومان» */
export function formatTomanCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "−" : ""
  if (abs >= 1_000_000_000) return `${sign}${faOneDecimal.format(abs / 1_000_000_000)} میلیارد تومان`
  if (abs >= 1_000_000) return `${sign}${faOneDecimal.format(abs / 1_000_000)} میلیون تومان`
  if (abs >= 1_000) return `${sign}${faOneDecimal.format(abs / 1_000)} هزار تومان`
  return `${sign}${faInt.format(abs)} تومان`
}

/** درصد با ارقام فارسی: «۸۰٪» */
export function formatPercent(p: number): string {
  return `${faInt.format(Math.round(p))}٪`
}

/** +/- درصد تغییر */
export function formatChange(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } {
  if (previous === 0) {
    return { text: current === 0 ? "۰٪" : "جدید", direction: "flat" }
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat"
  return { text: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${faOneDecimal.format(Math.abs(pct))}٪`, direction }
}

/**
 * تبدیل ورودی متنی مبلغ (با ارقام فارسی/لاتین و جداکننده) به عدد صحیح تومان.
 * برای اعتبارسنجی سمت کلاینت قبل از ارسال به API.
 */
export function parseAmountInput(input: string): number {
  const latin = toLatinDigits(input).replace(/[^\d-]/g, "")
  const n = Number(latin || "0")
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0
}
