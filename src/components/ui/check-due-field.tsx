"use client"

/**
 * فیلد سررسید چک — تقویم شمسی + میان‌برهای آماده (یک هفته، ۳۰ روز، ماه بعد، ۶۰ روز …)
 * با یک لمس سررسید پر می‌شود؛ زیرش فاصله تا سررسید و روز هفته نمایش داده می‌شود.
 * اگر سررسید چک قبلی داده شود (چک‌های اقساطی)، «یک ماه بعد از چک قبلی» هم پیشنهاد می‌شود.
 */
import { JalaliDateField, dayKeyOf } from "@/components/ui/jalali-date-picker"
import {
  addJalaliMonths,
  dayKeyToDate,
  diffJalaliDays,
  formatJalaliShort,
  formatJalaliWithWeekday,
  nowTehran,
  startOfJalaliDay,
} from "@/lib/jalali"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

const DAY_MS = 86_400_000

type Preset = { key: string; label: string; days?: number; months?: number }

const PRESETS: Preset[] = [
  { key: "w1", label: "یک هفته", days: 7 },
  { key: "d15", label: "۱۵ روز", days: 15 },
  { key: "d30", label: "۳۰ روز", days: 30 },
  { key: "m1", label: "ماه بعد", months: 1 },
  { key: "d45", label: "۴۵ روز", days: 45 },
  { key: "d60", label: "۶۰ روز", days: 60 },
  { key: "d90", label: "۹۰ روز", days: 90 },
]

/** ظهرِ امروز تهران + n روز / n ماه شمسی → کلید روز */
function presetKey(p: Preset, base: Date): string {
  const noon = new Date(startOfJalaliDay(base).getTime() + 12 * 3600_000)
  if (p.months) return dayKeyOf(addJalaliMonths(noon, p.months))
  return dayKeyOf(new Date(noon.getTime() + (p.days ?? 0) * DAY_MS))
}

function safeDate(key: string): Date | null {
  try {
    return key ? dayKeyToDate(key) : null
  } catch {
    return null
  }
}

export function CheckDueField({
  value,
  onChange,
  label = "سررسید *",
  prevDue,
  className,
}: {
  value: string
  onChange: (key: string) => void
  label?: string
  /** سررسید چک قبلی همین فاکتور/تسویه — برای پیشنهاد «ماه بعد از چک قبلی» */
  prevDue?: string
  className?: string
}) {
  const now = nowTehran()
  const prevDate = safeDate(prevDue ?? "")
  const options: { key: string; label: string; target: string }[] = []
  if (prevDate) {
    options.push({
      key: "prev",
      label: `ماه بعدِ چک قبلی`,
      target: dayKeyOf(addJalaliMonths(prevDate, 1)),
    })
  }
  for (const p of PRESETS) options.push({ key: p.key, label: p.label, target: presetKey(p, now) })

  const selected = safeDate(value)
  const days = selected ? diffJalaliDays(now, selected) : null

  return (
    <div className={className}>
      <label className="mb-1.5 block text-label font-bold text-foreground/80">{label}</label>
      <JalaliDateField value={value} onChange={onChange} label="سررسید" />
      <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {options.map((o) => {
          const on = value === o.target
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.target)}
              title={formatJalaliShort(dayKeyToDate(o.target))}
              className={cn(
                "nums h-8 shrink-0 rounded-full border px-3 text-caption font-bold transition-[color,background-color,border-color,transform] duration-150 active:scale-95",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : o.key === "prev"
                    ? "border-primary/40 bg-primary/8 text-primary hover:bg-primary/15"
                    : "border-border bg-card text-foreground/75 hover:border-primary/40 hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {selected && days !== null && (
        <p
          className={cn(
            "nums mt-1.5 text-caption",
            days < 0 ? "font-bold text-destructive" : "text-muted-foreground"
          )}
        >
          {days < 0
            ? `سررسید ${toPersianDigits(-days)} روز گذشته است`
            : days === 0
              ? "سررسید امروز است"
              : `${toPersianDigits(days)} روز دیگر`}
          {" — "}
          {formatJalaliWithWeekday(selected)}
        </p>
      )}
    </div>
  )
}
