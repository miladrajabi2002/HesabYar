"use client"

/**
 * انتخاب‌گر تاریخ شمسی — باتم‌شیت با شبکه روزهای ماه
 */
import { useState } from "react"
import { ChevronRight, ChevronLeft, CalendarDays } from "lucide-react"
import { BottomSheet } from "./bottom-sheet"
import { Button } from "./button"
import {
  jalaliOf,
  jalaliToInstant,
  jalaliMonthLengthOf,
  JALALI_MONTHS,
  nowTehran,
  startOfJalaliDay,
} from "@/lib/jalali"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

/** کلید روز شمسی «1405-08-07» */
export function dayKeyOf(date: Date): string {
  const j = jalaliOf(date)
  return `${j.jy}-${String(j.jm).padStart(2, "0")}-${String(j.jd).padStart(2, "0")}`
}

export function todayKey(): string {
  return dayKeyOf(startOfJalaliDay(nowTehran()))
}

export function parseDayKey(key: string): { jy: number; jm: number; jd: number } {
  const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(key.trim())
  if (!m) return null as never
  return { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) }
}

const WEEKDAY_HEADS = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const

function jalaliWeekdayIndex(date: Date): number {
  const t = new Date(date.getTime() + 3.5 * 3600_000)
  return (t.getUTCDay() + 1) % 7 // 0 = شنبه
}

export function JalaliDatePicker({
  value,
  onChange,
  label,
}: {
  value: string // «1405-08-07»
  onChange: (key: string) => void
  label?: string
}) {
  const today = todayKey()
  const selected = parseDayKey(value || today)
  const [view, setView] = useState(() => {
    const j = jalaliOf(nowTehran())
    return { jy: selected?.jy ?? j.jy, jm: selected?.jm ?? j.jm }
  })

  const monthLen = jalaliMonthLengthOf(view.jy, view.jm)
  const firstDay = jalaliToInstant(view.jy, view.jm, 1, 12)
  const firstWeekday = jalaliWeekdayIndex(firstDay)
  const todayJ = jalaliOf(startOfJalaliDay(nowTehran()))

  const days: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLen }, (_, i) => i + 1),
  ]

  const moveMonth = (delta: number) => {
    setView((v) => {
      let jy = v.jy
      let jm = v.jm + delta
      if (jm > 12) {
        jm = 1
        jy++
      }
      if (jm < 1) {
        jm = 12
        jy--
      }
      return { jy, jm }
    })
  }

  return (
    <div className="select-none" dir="rtl">
      {label && <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>}
      <div className="flex items-center justify-between rounded-2xl bg-muted/70 px-2 py-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="ماه قبل"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card"
        >
          <ChevronRight className="size-4" />
        </button>
        <div className="text-sm font-bold">
          {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label="ماه بعد"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.7rem] font-medium text-muted-foreground">
        {WEEKDAY_HEADS.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />
          const isToday =
            todayJ.jy === view.jy && todayJ.jm === view.jm && todayJ.jd === d
          const isSelected =
            selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d
          const isFriday = (firstWeekday + d - 1) % 7 === 6
          return (
            <button
              type="button"
              key={d}
              onClick={() => {
                onChange(
                  `${view.jy}-${String(view.jm).padStart(2, "0")}-${String(d).padStart(2, "0")}`
                )
              }}
              className={cn(
                "nums flex aspect-square items-center justify-center rounded-xl text-sm transition-all duration-150 active:scale-95",
                isSelected
                  ? "bg-primary font-bold text-primary-foreground shadow-fab"
                  : isToday
                    ? "bg-primary/10 font-bold text-primary"
                    : isFriday
                      ? "text-destructive/80 hover:bg-accent"
                      : "text-foreground hover:bg-accent"
              )}
            >
              {toPersianDigits(d)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** دکمه‌ای که تقویم شمسی را در باتم‌شیت باز می‌کند */
export function JalaliDateField({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  className,
}: {
  value: string
  onChange: (key: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const j = value ? parseDayKey(value) : null
  const label = j
    ? `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`
    : placeholder

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-2xl border border-input bg-card px-3.5 text-sm transition-[color,border-color,box-shadow] hover:border-input/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15",
          className
        )}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className={cn("flex-1 text-start", !j && "text-muted-foreground")}>{label}</span>
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="انتخاب تاریخ"
        size="auto"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onChange(todayKey())
                setOpen(false)
              }}
            >
              امروز
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (value) setOpen(false)
                else onChange(todayKey())
                setOpen(false)
              }}
            >
              تأیید
            </Button>
          </div>
        }
      >
        <JalaliDatePicker value={value || todayKey()} onChange={onChange} />
      </BottomSheet>
    </>
  )
}
