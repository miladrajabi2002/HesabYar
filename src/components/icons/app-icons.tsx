"use client"

/**
 * آیکون‌های اختصاصی حساب‌یار — دوتُن و متحرک
 *
 *  • حالت عادی: خطی و سبک (stroke ۱٫۷۵)
 *  • حالت فعال (active): لایهٔ پرشدهٔ کم‌رنگ ظاهر می‌شود، خطوط دوباره «کشیده» می‌شوند
 *    و کل آیکون یک حرکت امضا دارد (pop / tilt / swing / bounce / spin / slide)
 *  • هاور دسکتاپ: همان حرکت امضا با CSS (globals.css → .group:hover .hy-icon)
 *  • prefers-reduced-motion رعایت می‌شود
 *
 * رنگ از currentColor می‌آید؛ پس داخل کاشی رنگی سفید و در منو رنگ متن است.
 */
import { createContext, useContext, type ReactNode } from "react"
import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion"
import { cn } from "@/lib/utils"

type MotionKind = "pop" | "tilt" | "swing" | "bounce" | "spin" | "slide"

export interface AppIconProps {
  active?: boolean
  className?: string
  /** ضخامت خط — پیش‌فرض ۱٫۷۵ (فعال ۲) */
  strokeWidth?: number
  /** لایهٔ پرشده همیشه دیده شود (برای کاشی‌های رنگی) */
  duotone?: boolean
}

const Ctx = createContext({ active: false, animate: false, duotone: false })

const DRAW = { duration: 0.6, ease: [0.65, 0, 0.35, 1] as const }

/** خط با انیمیشن «کشیده شدن» هنگام فعال شدن */
function S({ d, delay = 0 }: { d: string; delay?: number }) {
  const { active, animate } = useContext(Ctx)
  return (
    <motion.path
      d={d}
      initial={false}
      animate={active && animate ? { pathLength: [0, 1] } : { pathLength: 1 }}
      transition={{ ...DRAW, delay }}
    />
  )
}

/** لایهٔ پرشدهٔ دوتُن — در حالت فعال با فنر ظاهر می‌شود */
function F({ d, opacity = 0.22 }: { d: string; opacity?: number }) {
  const { active, animate, duotone } = useContext(Ctx)
  const on = active || duotone
  return (
    <motion.path
      d={d}
      fill="currentColor"
      stroke="none"
      initial={false}
      animate={{ opacity: on ? opacity : 0, scale: on ? 1 : 0.6 }}
      transition={animate ? { type: "spring", stiffness: 420, damping: 22 } : { duration: 0 }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    />
  )
}

/** نقطهٔ توپر (بدون خط) */
function Dot({ cx, cy, r = 1.1 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
}

// نسخهٔ ۷ (حرکت کمتر): آیکون‌ها با فعال شدن دیگر تکان نمی‌خورند؛ فقط ضخامت خط و رنگ تغییر می‌کند
const REST: TargetAndTransition = { scale: 1, rotate: 0, x: 0, y: 0 }

function makeIcon(name: string, motionKind: MotionKind, body: () => ReactNode) {
  function Icon({ active = false, className, strokeWidth, duotone = false }: AppIconProps) {
    const animate = !useReducedMotion()
    return (
      <Ctx.Provider value={{ active, animate, duotone }}>
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth ?? (active ? 2 : 1.75)}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          data-motion={motionKind}
          className={cn("hy-icon size-5 shrink-0", className)}
          initial={false}
          animate={REST}
          style={{ originX: "50%", originY: motionKind === "swing" ? "15%" : "50%" }}
        >
          {body()}
        </motion.svg>
      </Ctx.Provider>
    )
  }
  Icon.displayName = `AppIcon(${name})`
  return Icon
}

// ───────────────────────── ناوبری اصلی ─────────────────────────

export const IconDashboard = makeIcon("dashboard", "pop", () => (
  <>
    <F d="M6 3.5h2.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 10V6A2.5 2.5 0 0 1 6 3.5zM15.5 11.5H18a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5h-2.5A2.5 2.5 0 0 1 13 18v-4a2.5 2.5 0 0 1 2.5-2.5z" />
    <S d="M6 3.5h2.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 10V6A2.5 2.5 0 0 1 6 3.5z" />
    <S d="M15.5 3.5H18A2.5 2.5 0 0 1 20.5 6v.5A2.5 2.5 0 0 1 18 9h-2.5A2.5 2.5 0 0 1 13 6.5V6a2.5 2.5 0 0 1 2.5-2.5z" delay={0.08} />
    <S d="M15.5 11.5H18a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5h-2.5A2.5 2.5 0 0 1 13 18v-4a2.5 2.5 0 0 1 2.5-2.5z" delay={0.16} />
    <S d="M6 15h2.5a2.5 2.5 0 0 1 2.5 2.5v.5a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18v-.5A2.5 2.5 0 0 1 6 15z" delay={0.24} />
  </>
))

export const IconInvoice = makeIcon("invoice", "tilt", () => (
  <>
    <F d="M7 3h10a2 2 0 0 1 2 2v15.6l-2.4-1.4-2.3 1.4-2.3-1.4-2.3 1.4-2.3-1.4L5 20.6V5a2 2 0 0 1 2-2z" />
    <S d="M7 3h10a2 2 0 0 1 2 2v15.6l-2.4-1.4-2.3 1.4-2.3-1.4-2.3 1.4-2.3-1.4L5 20.6V5a2 2 0 0 1 2-2z" />
    <S d="M9 8h6" delay={0.2} />
    <S d="M9 11.5h6" delay={0.28} />
    <S d="M9 15h3" delay={0.36} />
  </>
))

export const IconCalendar = makeIcon("calendar", "swing", () => (
  <>
    <F d="M6.5 5h11a3 3 0 0 1 3 3v2h-17V8a3 3 0 0 1 3-3z" opacity={0.3} />
    <S d="M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
    <S d="M8 3v3.5M16 3v3.5" delay={0.15} />
    <S d="M3.5 10h17" delay={0.22} />
    <Dot cx={8.5} cy={14} />
    <Dot cx={12} cy={14} />
    <Dot cx={15.5} cy={14} />
    <Dot cx={8.5} cy={17.2} />
    <Dot cx={12} cy={17.2} />
  </>
))

export const IconCheque = makeIcon("cheque", "slide", () => (
  <>
    <F d="M5 6h14a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 19 18H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 6z" />
    <S d="M5 6h14a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 19 18H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 6z" />
    <S d="M6 10h5M6 13.5h3" delay={0.2} />
    <S d="M13.2 14.3c.9-1.6 1.7-1.7 2.1-.2.3 1.3 1.1 1.4 1.8.2.4-.6.9-.8 1.4-.3" delay={0.32} />
  </>
))

export const IconPeople = makeIcon("people", "bounce", () => (
  <>
    <F d="M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM3 19.5c.6-3.3 3-5.5 6-5.5s5.4 2.2 6 5.5z" />
    <S d="M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" />
    <S d="M3 19.5c.6-3.3 3-5.5 6-5.5s5.4 2.2 6 5.5" delay={0.15} />
    <S d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4" delay={0.25} />
    <S d="M17.6 14.3c1.8.8 3 2.6 3.4 5.2" delay={0.32} />
  </>
))

export const IconBox = makeIcon("box", "bounce", () => (
  <>
    <F d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <S d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <S d="M4 7.5l8 4.5 8-4.5" delay={0.18} />
    <S d="M12 12v9" delay={0.26} />
    <S d="M8 5.3l8 4.5" delay={0.34} />
  </>
))

export const IconBank = makeIcon("bank", "pop", () => (
  <>
    <F d="M3.5 9L12 4l8.5 5z" opacity={0.35} />
    <S d="M3.5 9L12 4l8.5 5H3.5z" />
    <S d="M5.8 11.5v5.5M9.9 11.5v5.5M14.1 11.5v5.5M18.2 11.5v5.5" delay={0.18} />
    <S d="M4 20h16" delay={0.3} />
  </>
))

export const IconChart = makeIcon("chart", "pop", () => (
  <>
    <F d="M5.2 12h1.6a1.2 1.2 0 0 1 1.2 1.2v6.3H4v-6.3A1.2 1.2 0 0 1 5.2 12zM11.2 7h1.6A1.2 1.2 0 0 1 14 8.2v11.3h-4V8.2A1.2 1.2 0 0 1 11.2 7zM17.2 3.5h1.6A1.2 1.2 0 0 1 20 4.7v14.8h-4V4.7a1.2 1.2 0 0 1 1.2-1.2z" />
    <S d="M5.2 12h1.6a1.2 1.2 0 0 1 1.2 1.2v6.3H4v-6.3A1.2 1.2 0 0 1 5.2 12z" />
    <S d="M11.2 7h1.6A1.2 1.2 0 0 1 14 8.2v11.3h-4V8.2A1.2 1.2 0 0 1 11.2 7z" delay={0.1} />
    <S d="M17.2 3.5h1.6A1.2 1.2 0 0 1 20 4.7v14.8h-4V4.7a1.2 1.2 0 0 1 1.2-1.2z" delay={0.2} />
  </>
))

export const IconSettings = makeIcon("settings", "slide", () => (
  <>
    <F d="M15 4.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM9 14.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z" opacity={0.4} />
    <S d="M4 7h8.8M17.2 7H20" />
    <S d="M15 4.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z" delay={0.12} />
    <S d="M4 17h2.8M11.2 17H20" delay={0.2} />
    <S d="M9 14.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z" delay={0.28} />
  </>
))

// ───────────────────────── عمومی ─────────────────────────

export const IconPlus = makeIcon("plus", "spin", () => (
  <>
    <S d="M12 5v14" />
    <S d="M5 12h14" delay={0.1} />
  </>
))

export const IconSearch = makeIcon("search", "tilt", () => (
  <>
    <F d="M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
    <S d="M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
    <S d="M15 15l4.5 4.5" delay={0.2} />
  </>
))

export const IconApps = makeIcon("apps", "spin", () => (
  <>
    <F d="M7 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zM17 14.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" opacity={0.35} />
    <S d="M7 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" />
    <S d="M17 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" delay={0.08} />
    <S d="M17 14.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" delay={0.16} />
    <S d="M7 14.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" delay={0.24} />
  </>
))

export const IconBell = makeIcon("bell", "swing", () => (
  <>
    <F d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <S d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <S d="M10 20.5h4" delay={0.15} />
  </>
))

export const IconLogout = makeIcon("logout", "slide", () => (
  <>
    <S d="M14 4h3a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-3" />
    <S d="M10 16l-4-4 4-4" delay={0.15} />
    <S d="M6 12h9" delay={0.22} />
  </>
))

export const IconSale = makeIcon("sale", "bounce", () => (
  <>
    <S d="M7 17L17 7" />
    <S d="M8.5 7H17v8.5" delay={0.15} />
  </>
))

export const IconPurchase = makeIcon("purchase", "bounce", () => (
  <>
    <S d="M17 7L7 17" />
    <S d="M15.5 17H7V8.5" delay={0.15} />
  </>
))



/** نگاشت مسیر → آیکون و رنگ امضای بخش */
export const SECTION_META = {
  "/": { icon: IconDashboard, hue: "var(--hue-dashboard)" },
  "/invoices": { icon: IconInvoice, hue: "var(--hue-invoices)" },
  "/calendar": { icon: IconCalendar, hue: "var(--hue-calendar)" },
  "/checks": { icon: IconCheque, hue: "var(--hue-checks)" },
  "/people": { icon: IconPeople, hue: "var(--hue-people)" },
  "/products": { icon: IconBox, hue: "var(--hue-products)" },
  "/accounts": { icon: IconBank, hue: "var(--hue-accounts)" },
  "/reports": { icon: IconChart, hue: "var(--hue-reports)" },
  "/settings": { icon: IconSettings, hue: "var(--hue-settings)" },
} as const

export type SectionHref = keyof typeof SECTION_META
