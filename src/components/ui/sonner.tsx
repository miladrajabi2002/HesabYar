"use client"

import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

/**
 * اعلان حساب‌یار (نسخهٔ ۴) — «جزیرهٔ پویا»
 *  • یک قرص کوچک بالای صفحه، بدون دکمهٔ بستن؛ با کشیدن یا خودکار بسته می‌شود
 *  • موفقیت کوتاه (۱٫۸ ثانیه)، خطا بلندتر (۴٫۵ ثانیه) — همیشه حداکثر ۲ اعلان روی هم
 *  • آیکون‌ها با CSS «کشیده» می‌شوند (globals.css → .hy-toast-icon)
 */
// مدت نمایش بر اساس نوع — یک‌جا، بدون دست زدن به ۱۵۰ محل فراخوانی
const g = globalThis as unknown as { __hyToastPatched?: boolean }
if (!g.__hyToastPatched) {
  g.__hyToastPatched = true
  const { success, error, warning } = toast
  toast.success = (m, d) => success(m, { duration: 1800, ...d })
  toast.error = (m, d) => error(m, { duration: 4500, ...d })
  toast.warning = (m, d) => warning(m, { duration: 3500, ...d })
}

function ToastGlyph({ kind }: { kind: "success" | "error" | "warning" | "info" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hy-toast-icon"
      aria-hidden
    >
      {kind === "success" && <path pathLength={1} d="M6 12.5l4 4 8-9" />}
      {kind === "error" && (
        <>
          <path pathLength={1} d="M7 7l10 10" />
          <path pathLength={1} className="hy-d2" d="M17 7L7 17" />
        </>
      )}
      {kind === "warning" && (
        <>
          <path pathLength={1} d="M12 6v7" />
          <path pathLength={1} className="hy-d2" d="M12 17.5v.01" />
        </>
      )}
      {kind === "info" && (
        <>
          <path pathLength={1} d="M12 11v6.5" />
          <path pathLength={1} className="hy-d2" d="M12 7v.01" />
        </>
      )}
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.6} />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  )
}

const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group font-sans"
      dir="rtl"
      position="top-center"
      // زیر جزیرهٔ دینامیک/ناچ آیفون (وب‌اپ نصب‌شده)؛ بدون جمع‌شدن با جابه‌جایی پیش‌فرض sonner
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
      visibleToasts={2}
      gap={8}
      duration={2200}
      icons={{
        success: <ToastGlyph kind="success" />,
        info: <ToastGlyph kind="info" />,
        warning: <ToastGlyph kind="warning" />,
        error: <ToastGlyph kind="error" />,
        loading: <Spinner />,
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: "cn-toast font-sans text-start",
          title: "font-sans text-start",
          description: "font-sans text-start",
          actionButton: "cn-toast-action",
          cancelButton: "cn-toast-cancel",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
