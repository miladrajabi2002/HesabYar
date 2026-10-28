"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  JALALI_MONTHS,
  WEEKDAYS,
  formatJalali,
  jalaliDayKey,
  jalaliMonthLengthOf,
  jalaliOf,
  jalaliToInstant,
  nowTehran,
} from "@/lib/jalali"
import { toPersianDigits } from "@/lib/money"

interface JalaliDatePickerProps {
  value: Date
  onChange: (date: Date) => void
  label?: string
  className?: string
  disabled?: boolean
  /** تریگر سفارشی (المنت React) */
  children?: React.ReactElement
}

/** انتخابگر تاریخ شمسی با تقویم شنبه‌محور */
export function JalaliDatePicker({ value, onChange, className, disabled, children }: JalaliDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [viewYear, setViewYear] = React.useState(() => jalaliOf(value).jy)
  const [viewMonth, setViewMonth] = React.useState(() => jalaliOf(value).jm)

  React.useEffect(() => {
    if (open) {
      const j = jalaliOf(value)
      setViewYear(j.jy)
      setViewMonth(j.jm)
    }
  }, [open, value])

  const today = React.useMemo(() => jalaliDayKey(nowTehran()), [])
  const selectedKey = React.useMemo(() => jalaliDayKey(value), [value])

  const monthLength = jalaliMonthLengthOf(viewYear, viewMonth)
  const firstDay = jalaliToInstant(viewYear, viewMonth, 1, 12, 0, 0)
  // شنبه = 0
  const offset = React.useMemo(() => {
    const shifted = new Date(firstDay.getTime() + 3.5 * 3600_000)
    return (shifted.getUTCDay() + 1) % 7
  }, [firstDay])

  const days: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: monthLength }, (_, i) => i + 1),
  ]

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12)
      setViewYear(viewYear - 1)
    } else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1)
      setViewYear(viewYear + 1)
    } else setViewMonth(viewMonth + 1)
  }

  const select = (day: number) => {
    onChange(jalaliToInstant(viewYear, viewMonth, day, 12, 0, 0))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          children ?? (
            <Button
              variant="outline"
              size="default"
              className={cn("w-full justify-between font-normal", className)}
              disabled={disabled}
            >
              <span className="nums">{formatJalali(value)}</span>
            </Button>
          )
        }
      />
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon-sm" onClick={prevMonth} aria-label="ماه قبل">
            <ChevronRight className="size-4" />
          </Button>
          <div className="text-sm font-semibold">
            {JALALI_MONTHS[viewMonth - 1]} {toPersianDigits(viewYear)}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={nextMonth} aria-label="ماه بعد">
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="flex h-7 items-center justify-center text-[0.65rem] text-muted-foreground">
              {d.slice(0, 1)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />
            const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const isToday = key === today
            const isSelected = key === selectedKey
            return (
              <button
                key={key}
                type="button"
                onClick={() => select(day)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-lg text-sm transition-colors duration-150 hover:bg-accent",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                  !isSelected && isToday && "border border-primary/40 text-primary font-semibold"
                )}
              >
                <span className="nums">{toPersianDigits(day)}</span>
              </button>
            )
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            onChange(nowTehran())
            setOpen(false)
          }}
        >
          امروز
        </Button>
      </PopoverContent>
    </Popover>
  )
}
