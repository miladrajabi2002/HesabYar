"use client"

/**
 * لوگوی حساب‌یار (نسخهٔ ۴) — فاکتور سفید روی کاشی زمردی + سکهٔ طلایی با تیک
 * vector و شارپ در هر اندازه؛ animated: خطوط فاکتور کشیده می‌شوند و سکه با فنر می‌پرد.
 * همین طرح در public/logo.svg و آیکون‌های PWA (public/icons) هم استفاده شده است.
 */
import { useId } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

export function BrandLogo({
  size = 40,
  className,
  animated = false,
}: {
  size?: number
  className?: string
  animated?: boolean
}) {
  const uid = useId().replace(/:/g, "")
  const reduce = useReducedMotion()
  const anim = animated && !reduce
  const g = `hy-bg-${uid}`
  const shine = `hy-sh-${uid}`
  const gold = `hy-gd-${uid}`

  const line = (i: number) =>
    anim
      ? {
          initial: { scaleX: 0 },
          animate: { scaleX: 1 },
          transition: { delay: 0.35 + i * 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
          style: { transformBox: "fill-box" as const, transformOrigin: "right center" },
        }
      : {}

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="لوگوی حساب‌یار"
      className={cn("shrink-0 select-none drop-shadow-[0_6px_14px_rgba(11,122,98,0.28)]", className)}
    >
      <defs>
        <linearGradient id={g} x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#19c29b" />
          <stop offset="0.55" stopColor="#0b8a6d" />
          <stop offset="1" stopColor="#065c4a" />
        </linearGradient>
        <radialGradient id={shine} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 6) rotate(50) scale(30)">
          <stop stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gold} x1="28" y1="25" x2="40" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd25e" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${g})`} />
      <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${shine})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" stroke="#fff" strokeOpacity="0.16" />

      {/* فاکتور */}
      <motion.g
        initial={anim ? { y: 6, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 20 }}
      >
        <path
          d="M15.5 9.5h15a2.5 2.5 0 0 1 2.5 2.5v24.6l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5V12a2.5 2.5 0 0 1 2.5-2.5z"
          fill="#fff"
        />
        <motion.rect x="17" y="14.5" width="12.5" height="3.2" rx="1.6" fill="#0b8a6d" {...line(0)} />
        <motion.rect x="17" y="20.5" width="12.5" height="2.2" rx="1.1" fill="#c8ddd6" {...line(1)} />
        <motion.rect x="17" y="25" width="8" height="2.2" rx="1.1" fill="#c8ddd6" {...line(2)} />
      </motion.g>

      {/* سکه */}
      <motion.g
        initial={anim ? { scale: 0, rotate: -90 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 420, damping: 14 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <circle cx="34" cy="33.5" r="8.2" fill={`url(#${gold})`} stroke="#fff" strokeWidth="2.4" />
        <motion.path
          d="M30.6 33.7l2.4 2.4 4.6-5"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={anim ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.9, duration: 0.35 }}
        />
      </motion.g>
    </svg>
  )
}
