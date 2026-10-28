/**
 * تقویم شمسی — lib/jalali.ts
 * ذخیره‌سازی تاریخ‌ها ISO/UTC است و تبدیل به شمسی فقط در مرز نمایش/فیلتر انجام می‌شود.
 * مرجع زمانی محاسبات، ساعت تهران (UTC+3:30، بدون ساعت تابستانی) است تا روز/ماه شمسی
 * مستقل از timezone سرور، همیشه یکسان باشد.
 */
import { toJalaali, toGregorian, jalaaliMonthLength as jLength, isValidJalaaliDate } from "jalaali-js"
import { toPersianDigits } from "./money"

export interface JalaliParts {
  jy: number
  jm: number
  jd: number
}

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const

export const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"] as const

/** اختاف تهران با UTC به میلی‌ثانیه (۳:۳۰) */
export const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000
const DAY_MS = 86_400_000

/** تاریخ UTC ورودی را به «ساعت دیواری تهران» شیفت می‌دهد (خواندن با getUTC*) */
function toTehranWall(date: Date): Date {
  return new Date(date.getTime() + TEHRAN_OFFSET_MS)
}

/** اجزای شمسی یک تاریخ */
export function jalaliOf(date: Date): JalaliParts {
  const t = toTehranWall(date)
  return toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** ساخت لحظه UTC از تاریخ شمسی (پیش‌فرض ظهر تهران برای اطمینان از ثابت‌ماندن روز) */
export function jalaliToInstant(jy: number, jm: number, jd: number, hour = 12, minute = 0, second = 0): Date {
  const g = toGregorian(jy, jm, jd)
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, hour, minute, second) - TEHRAN_OFFSET_MS)
}

/** امروز به وقت تهران */
export function nowTehran(): Date {
  return new Date()
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return isValidJalaaliDate(jy, jm, jd)
}

export function jalaliMonthLengthOf(jy: number, jm: number): number {
  return jLength(jy, jm)
}

/** ابتدای روز شمسی (۰۰:۰۰ تهران) */
export function startOfJalaliDay(date: Date): Date {
  const j = jalaliOf(date)
  return jalaliToInstant(j.jy, j.jm, j.jd, 0, 0, 0)
}

/** انتهای روز شمسی (۲۳:۵۹:۵۹.۹۹۹ تهران) */
export function endOfJalaliDay(date: Date): Date {
  return new Date(startOfJalaliDay(date).getTime() + DAY_MS - 1)
}

/** ابتدای ماه شمسی */
export function startOfJalaliMonth(date: Date): Date {
  const j = jalaliOf(date)
  return jalaliToInstant(j.jy, j.jm, 1, 0, 0, 0)
}

/** انتهای ماه شمسی */
export function endOfJalaliMonth(date: Date): Date {
  const j = jalaliOf(date)
  const ny = j.jm === 12 ? j.jy + 1 : j.jy
  const nm = j.jm === 12 ? 1 : j.jm + 1
  return new Date(jalaliToInstant(ny, nm, 1, 0, 0, 0).getTime() - 1)
}

/** کلید ماه شمسی مثل "1404-08" */
export function jalaliMonthKey(date: Date): string {
  const j = jalaliOf(date)
  return `${j.jy}-${String(j.jm).padStart(2, "0")}`
}

/** کلید روز شمسی مثل "1404-08-28" */
export function jalaliDayKey(date: Date): string {
  const j = jalaliOf(date)
  return `${jalaliMonthKey(date)}-${String(j.jd).padStart(2, "0")}`
}

export function currentMonthKey(): string {
  return jalaliMonthKey(nowTehran())
}

/** تجزیه کلید ماه "1404-08" */
export function parseMonthKey(key: string): { jy: number; jm: number } {
  const m = /^(\d{3,4})-(\d{1,2})$/.exec(key.trim())
  if (!m) throw new Error("قالب ماه شمسی نامعتبر است")
  const jy = Number(m[1])
  const jm = Number(m[2])
  if (jm < 1 || jm > 12) throw new Error("ماه شمسی نامعتبر است")
  return { jy, jm }
}

/** بازه زمانی کامل یک ماه شمسی */
export function monthKeyRange(key: string): { start: Date; end: Date } {
  const { jy, jm } = parseMonthKey(key)
  return {
    start: jalaliToInstant(jy, jm, 1, 0, 0, 0),
    end: new Date(
      jalaliToInstant(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1, 0, 0, 0).getTime() - 1
    ),
  }
}

/** برچسب ماه: «مهر ۱۴۰۴» */
export function monthKeyLabel(key: string): string {
  const { jy, jm } = parseMonthKey(key)
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`
}

/** ماه قبل از کلید داده‌شده */
export function previousMonthKey(key: string): string {
  const { jy, jm } = parseMonthKey(key)
  return jm === 1 ? `${jy - 1}-12` : `${jy}-${String(jm - 1).padStart(2, "0")}`
}

/** ماه بعد از کلید داده‌شده */
export function nextMonthKey(key: string): string {
  const { jy, jm } = parseMonthKey(key)
  return jm === 12 ? `${jy + 1}-01` : `${jy}-${String(jm + 1).padStart(2, "0")}`
}

/** «۲۸ مهر ۱۴۰۴» */
export function formatJalali(date: Date): string {
  const j = jalaliOf(date)
  return `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`
}

/** «۲۸ مهر» */
export function formatJalaliShort(date: Date): string {
  const j = jalaliOf(date)
  return `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`
}

/** نام روز هفته (شنبه‌محور) */
export function weekdayName(date: Date): string {
  const t = toTehranWall(date)
  const gd = t.getUTCDay() // 0=یکشنبه میلادی
  return WEEKDAYS[(gd + 1) % 7]
}

/** «سه‌شنبه ۲۸ مهر ۱۴۰۴» */
export function formatJalaliWithWeekday(date: Date): string {
  return `${weekdayName(date)}، ${formatJalali(date)}`
}

/** تاریخ شمسی از کلید روز "1404-08-28" → تاریخ UTC ظهر تهران */
export function dayKeyToDate(key: string): Date {
  const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(key.trim())
  if (!m) throw new Error("قالب روز شمسی نامعتبر است")
  return jalaliToInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0)
}

/** افزودن n ماه شمسی به تاریخ (روز ماه در صورت نیاز کلمپ می‌شود) */
export function addJalaliMonths(date: Date, n: number): Date {
  const t = toTehranWall(date)
  const j = toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
  const total = j.jy * 12 + (j.jm - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const nd = Math.min(j.jd, jLength(ny, nm))
  return jalaliToInstant(ny, nm, nd, t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds())
}

/** اختلاف روز تقویمی شمسی بین دو تاریخ (b - a) */
export function diffJalaliDays(a: Date, b: Date): number {
  return Math.round((startOfJalaliDay(b).getTime() - startOfJalaliDay(a).getTime()) / DAY_MS)
}

/** n ماه قبل از امروز (ابتدای ماه) */
export function monthsAgoRange(n: number): { start: Date; end: Date } {
  const start = startOfJalaliMonth(addJalaliMonths(nowTehran(), -n))
  return { start, end: endOfJalaliDay(nowTehran()) }
}
