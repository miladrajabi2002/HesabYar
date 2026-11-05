/**
 * قالب‌بندی‌های نمایشی مشترک (کلاینت و سرور) — الگوی app
 *  • relativeTime — «۵ دقیقه پیش» برای پیش‌نویس فاکتور و رویدادهای اخیر
 *  • dueLabel — «امروز / فردا / پنجشنبه / ۲ روز گذشته / ۱۲ آبان» برای سررسید چک‌ها
 *  • formatOpenDays — «۱۲ روز» قدمت ماندهٔ بازِ طلب/بدهی («چند روز باز است»)
 *  • greeting — سلامِ زمان‌دار داشبورد بر اساس ساعت تهران
 */
import { toPersianDigits } from "@/lib/money"
import { TEHRAN_OFFSET_MS, diffJalaliDays, formatJalaliShort, weekdayName } from "@/lib/jalali"

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** «همین الان»، «۵ دقیقه پیش»، «۳ ساعت پیش»، «دیروز»، «۴ روز پیش»، «۱۲ آبان» */
export function relativeTime(d: Date | number, now = new Date()): string {
  const t = typeof d === "number" ? d : d.getTime()
  const diff = now.getTime() - t
  if (diff < MIN) return "همین الان"
  if (diff < HOUR) return `${toPersianDigits(Math.floor(diff / MIN))} دقیقه پیش`
  if (diff < DAY) return `${toPersianDigits(Math.floor(diff / HOUR))} ساعت پیش`
  if (diff < 2 * DAY) return "دیروز"
  if (diff < 7 * DAY) return `${toPersianDigits(Math.floor(diff / DAY))} روز پیش`
  return formatJalaliShort(new Date(t))
}

/** فاصله تا سررسید: «امروز»، «فردا»، «پنجشنبه»، «۱۲ آبان»، «دیروز»، «۲ روز گذشته» — روز تقویمی تهران */
export function dueLabel(d: Date, now = new Date()): string {
  const days = diffJalaliDays(now, d)
  if (days === 0) return "امروز"
  if (days === 1) return "فردا"
  if (days === -1) return "دیروز"
  if (days > 1 && days < 7) return weekdayName(d)
  if (days < 0) return `${toPersianDigits(-days)} روز گذشته`
  return formatJalaliShort(d)
}

/** برچسب کوتاه قدمت مانده: «امروز» / «۱۲ روز» / «۲ ماه» — چند روز است طلب/بدهی باز است */
export function formatOpenDays(days: number): string {
  if (days <= 0) return "امروز"
  if (days < 60) return `${toPersianDigits(days)} روز`
  return `${toPersianDigits(Math.floor(days / 30))} ماه`
}

/** سلام بر اساس ساعت تهران: «صبح بخیر» … «شب بخیر» */
export function greeting(d = new Date()): string {
  const h = new Date(d.getTime() + TEHRAN_OFFSET_MS).getUTCHours()
  if (h < 5) return "شب بخیر"
  if (h < 12) return "صبح بخیر"
  if (h < 17) return "ظهر بخیر"
  if (h < 20) return "عصر بخیر"
  return "شب بخیر"
}
