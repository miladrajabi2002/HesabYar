"use client"

/**
 * لوگوی حساب‌یار (نسخهٔ ۵) — تیک «حساب درست» که خط رشد هم هست و به سکهٔ طلایی می‌رسد
 * vector و شارپ در هر اندازه؛ animated: تیک کشیده می‌شود، سکه با فنر می‌نشیند و خط دفتر باز می‌شود.
 * همین طرح در public/logo.svg، آیکون‌های PWA و صفحات چاپ (lib/brand.ts) استفاده شده است.
 */
import { useId } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { BRAND_MARK } from "@/lib/brand"
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
  const { check, coin, ledger } = BRAND_MARK

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
        <linearGradient id={g} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1cc79d" />
          <stop offset="0.5" stopColor="#0b8a6d" />
          <stop offset="1" stopColor="#05503f" />
        </linearGradient>
        <radialGradient
          id={shine}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(10 4) rotate(55) scale(34)"
        >
          <stop stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gold} x1="30" y1="11" x2="39" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd86b" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${g})`} />
      <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${shine})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" stroke="#fff" strokeOpacity="0.16" />

      {/* خط دفتر */}
      <motion.rect
        x={ledger.x}
        y={ledger.y}
        width={ledger.w}
        height={ledger.h}
        rx={ledger.h / 2}
        fill="#fff"
        fillOpacity={0.38}
        initial={anim ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformBox: "fill-box", transformOrigin: "right center" }}
      />

      {/* تیک / خط رشد */}
      <motion.path
        d={check}
        stroke="#fff"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={anim ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.3, duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
      />

      {/* سکه */}
      <motion.circle
        cx={coin.cx}
        cy={coin.cy}
        r={coin.r}
        fill={`url(#${gold})`}
        stroke="#fff"
        strokeWidth={2.2}
        initial={anim ? { scale: 0, y: 6 } : false}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.75, type: "spring", stiffness: 480, damping: 13 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  )
}
