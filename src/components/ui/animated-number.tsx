"use client"

/**
 * شمارنده انیمیشنی اعداد (MO-01) — ارقام KPI با easing نرم از صفر تا مقدار می‌شمارند.
 * حس «پول واقعی» به‌جای ظاهرشدن یکجای اعداد.
 */
import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"

/** easing خروجی نرم مثل اپ‌های بانکی */
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4)

export function AnimatedNumber({
  value,
  duration = 900,
  format,
  className,
}: {
  value: number
  duration?: number
  /** فرمت‌کننده نهایی (مثل formatTomanCompact) */
  format?: (n: number) => string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const current = Math.round(from + (value - from) * easeOutQuart(t))
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration, reduceMotion])

  return <span className={className}>{format ? format(display) : display}</span>
}
