"use client"

/**
 * ورودی عددی عمومی با ارقام فارسی — ui/number-input.tsx
 * ارقام فارسی (۰-۹)، عربی (٠-٩) و لاتین (0-9) و ممیز فارسی (٫) همه پذیرفته
 * می‌شوند؛ نمایش همیشه با ارقام فارسی است و مقدار به‌صورت عدد لاتین به
 * فراخوان داده می‌شود (فارسی نشان می‌دهد، انگلیسی ذخیره می‌کند).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { normalizeDigits, toPersianDigits } from "@/lib/digits"

export function NumberInput({
  value,
  onChange,
  placeholder,
  className,
  allowDecimal = true,
  onFocus,
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
  /** اجازه عدد اعشاری مثل ۱۲٫۵ */
  allowDecimal?: boolean
  onFocus?: () => void
}) {
  const [display, setDisplay] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // همگام‌سازی نمایش با مقدار خارجی (وقتی والد مقدار را برنامه‌ای عوض کند)
  React.useEffect(() => {
    const raw = normalizeDigits(inputRef.current?.value ?? "")
    const current = raw.replace(allowDecimal ? /[^\d.]/g : /\D/g, "")
    const currentNum =
      current === "" || current === "." ? 0 : Number(current)
    if (currentNum !== value) {
      setDisplay(value > 0 ? toPersianDigits(String(value)).replace(/\./g, "٫") : "")
    }
  }, [value, allowDecimal])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ۱) ارقام فارسی/عربی → لاتین  ۲) حذف کاراکترهای غیرعددی
    let latin = normalizeDigits(e.target.value)
    latin = allowDecimal ? latin.replace(/[^\d.]/g, "") : latin.replace(/\D/g, "")
    // فقط یک ممیز مجاز است
    const dot = latin.indexOf(".")
    if (dot !== -1) {
      latin = latin.slice(0, dot + 1) + latin.slice(dot + 1).replace(/\./g, "")
    }
    const num = latin === "" || latin === "." ? 0 : Number(latin)
    // نمایش با ارقام فارسی و ممیز فارسی
    setDisplay(toPersianDigits(latin).replace(/\./g, "٫"))
    onChange(Number.isFinite(num) ? num : 0)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      dir="ltr"
      value={display}
      onChange={handleChange}
      onFocus={(e) => {
        onFocus?.()
        e.target.select()
      }}
      placeholder={placeholder || "۰"}
      className={cn("field nums text-end font-bold", className)}
    />
  )
}
