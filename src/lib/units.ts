/**
 * واحد شمارش اجناس — «کیلوگرم» در نمایش به «kg» تبدیل می‌شود.
 * مقدار ذخیره‌شده در دیتابیس همیشه فارسی می‌ماند؛ فقط نمایش لاتین می‌شود.
 */
export const PRODUCT_UNITS = ["عدد", "کیلوگرم", "پاکت", "کارتن", "متر", "بسته"] as const

/** نمایش واحد: کیلوگرم → kg */
export function formatUnit(unit: string | null | undefined): string {
  if (!unit) return ""
  return unit === "کیلوگرم" ? "kg" : unit
}
