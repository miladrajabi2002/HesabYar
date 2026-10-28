"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"
import { formatNumberFa } from "@/lib/money"

interface CountUpProps {
  value: number
  duration?: number
  className?: string
  /** تابع قالب‌بندی خروجی */
  format?: (n: number) => string
}

/** شمارنده عددی نرم با easing و ارقام فارسی */
export function CountUp({ value, duration = 900, className, format }: CountUpProps) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduced) return
    const from = fromRef.current
    const to = value
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = to
    }
  }, [value, duration, reduced])

  if (reduced) {
    return <span className={className}>{format ? format(value) : formatNumberFa(value)}</span>
  }
  return <span className={className}>{format ? format(display) : formatNumberFa(Math.round(display))}</span>
}
