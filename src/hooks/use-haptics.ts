"use client"

/**
 * لرزش لمسی مستقل از تلگرام (الگوی app)
 *  • اندروید/کروم: Vibration API با الگوهای کوتاه
 *  • iOS سافاری (۱۸+): لمس یک <input type="checkbox" switch> پنهان، تنها راه گرفتن «تیک» سیستمی در وب
 *  • دسکتاپ یا بدون پشتیبانی: بی‌صدا هیچ کاری نمی‌کند
 * همهٔ کامپوننت‌ها همین شیء ثابت را می‌گیرند؛ بدون Context و بدون رندر دوباره.
 * داخل مینی‌اپ تلگرام، use-telegram اولویت دارد و همین ماژول فقط fallback است.
 */

type Pattern = number | number[]

let iosSwitch: HTMLLabelElement | null = null

function iosTick(): boolean {
  if (typeof document === "undefined") return false
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return false
  if (!iosSwitch) {
    const label = document.createElement("label")
    label.setAttribute("aria-hidden", "true")
    label.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-9px;top:0"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.setAttribute("switch", "")
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    iosSwitch = label
  }
  iosSwitch.click()
  return true
}

function buzz(pattern: Pattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern)
      return
    }
    iosTick()
  } catch {
    /* ignore */
  }
}

export const haptic = {
  tap: () => buzz(8),
  medium: () => buzz(16),
  success: () => buzz([10, 40, 14]),
  warning: () => buzz([18, 60, 18]),
  error: () => buzz([24, 50, 24, 50, 24]),
}

export function useHaptics() {
  return { haptic }
}
