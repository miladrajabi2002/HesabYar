/**
 * قفل اسکرول بدنه با شمارش مرجع — lib/body-scroll-lock.ts
 *
 * مشکل قبلی: هر شیت بازشده مقدار `document.body.style.overflow` را ذخیره و هنگام
 * بسته شدن بازنشانی می‌کرد. وقتی دو شیت تودرتو (مثل «اقدام روی چک» → «انتخاب
 * حساب برای پاس») همزمان بسته می‌شدند، شیت داخلی همان مقدار «hidden» را که در
 * لحظه باز شدن دیده بود برمی‌گرداند و اسکرول صفحه برای همیشه قفل می‌ماند.
 * با شمارش مرجع، قفل فقط زمانی آزاد می‌شود که آخرین شیت بسته شود.
 */

let lockCount = 0
let previousOverflow = ""

export function acquireBodyScrollLock(): () => void {
  if (typeof document === "undefined") {
    return () => {}
  }

  lockCount++
  if (lockCount === 1) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0 && typeof document !== "undefined") {
      document.body.style.overflow = previousOverflow
    }
  }
}
