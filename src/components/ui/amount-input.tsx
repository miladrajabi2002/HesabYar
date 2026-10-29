"use client"

/**
 * ورودی مبلغ تومانی — ارقام فارسی با جداکننده + مبلغ به حروف
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { toLatinDigits, toPersianDigits } from "@/lib/digits"
import { formatNumberFa } from "@/lib/money"

// ───────── مبلغ به حروف فارسی ─────────
const YEKAN = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
const DAHGAN = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
const DAHYEK = [
  "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده",
]
const SADGAN = ["", "یکصد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"]

function threeDigitToWords(n: number): string {
  const parts: string[] = []
  const s = Math.floor(n / 100)
  const d = Math.floor((n % 100) / 10)
  const y = n % 10
  if (s > 0) parts.push(SADGAN[s])
  if (d === 1) {
    parts.push(DAHYEK[y])
  } else {
    if (d > 1) parts.push(DAHGAN[d])
    if (y > 0) parts.push(YEKAN[y])
  }
  return parts.join(" و ")
}

/** مبلغ به حروف: «دو میلیون و پانصد هزار تومان» */
export function amountToWords(amount: number): string {
  const n = Math.abs(Math.round(amount))
  if (n === 0) return "صفر تومان"
  const units: [number, string][] = [
    [1_000_000_000, "میلیارد"],
    [1_000_000, "میلیون"],
    [1_000, "هزار"],
  ]
  let rest = n
  const chunks: string[] = []
  for (const [value, label] of units) {
    const count = Math.floor(rest / value)
    if (count > 0) {
      const w = threeDigitToWords(count)
      chunks.push(`${w} ${label}`)
      rest %= value
    }
  }
  if (rest > 0) chunks.push(threeDigitToWords(rest))
  let words = chunks.join(" و ")
  // «یک هزار» → «هزار»
  words = words.replace(/^یک هزار/, "هزار")
  return `${words} تومان`
}

export function AmountInput({
  value,
  onChange,
  placeholder,
  showWords = true,
  suffix,
  className,
  autoFocus,
  onFocus,
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  showWords?: boolean
  suffix?: string
  className?: string
  autoFocus?: boolean
  onFocus?: () => void
}) {
  const [display, setDisplay] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // همگام‌سازی نمایش با مقدار خارجی
  React.useEffect(() => {
    const raw = toLatinDigits(inputRef.current?.value ?? "")
    if (value === 0 && raw.replace(/[^\d]/g, "") === "") {
      setDisplay("")
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const latin = toLatinDigits(e.target.value).replace(/[^\d]/g, "")
    const num = latin ? parseInt(latin, 10) : 0
    setDisplay(toPersianDigits(formatNumberFa(num)))
    onChange(num)
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    onFocus?.()
    e.target.select()
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={placeholder || "۰"}
          className="nums h-12 w-full rounded-xl border border-input bg-card px-3 text-end text-base font-semibold tracking-wide outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {showWords && value > 0 && (
        <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
          <span className="font-medium">{amountToWords(value)}</span>
        </p>
      )}
    </div>
  )
}
