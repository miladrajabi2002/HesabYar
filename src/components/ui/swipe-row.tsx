"use client"

/**
 * ردیف قابل کشیدن (سوایپ) — موبایل
 *  • کشیدن به چپ → اکشن‌های trailing از لبهٔ راست بیرون می‌آیند (مثل پاس / تسویه)
 *  • کشیدن به راست → اکشن‌های leading از لبهٔ چپ بیرون می‌آیند (مثل حذف / برگشت)
 *  • کشیدن کامل (بیش از ۵۵٪ عرض) → اولین اکشن همان سمت مستقیم اجرا می‌شود
 *  • با باز شدن یک ردیف، ردیف باز قبلی بسته می‌شود؛ لمس روی ردیف باز فقط آن را می‌بندد
 *  • در دسکتاپ (اشاره‌گر دقیق) کشیدن غیرفعال است و ردیف مثل قبل کلیک می‌خورد
 *  • یک‌بار «اشاره» (nudge) به اولین ردیف تا کاربر بفهمد قابل کشیدن است
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "framer-motion"
import { cn } from "@/lib/utils"

export interface SwipeAction {
  key: string
  label: string
  icon: ReactNode
  /** رنگ پس‌زمینه (CSS) */
  color: string
  onAction: () => void
}

const ACTION_W = 76
const openRows = typeof window !== "undefined" ? new EventTarget() : null
const HINT_KEY = "hy-swipe-hint"

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)")
    const update = () => setCoarse(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return coarse
}

export function SwipeRow({
  children,
  leading = [],
  trailing = [],
  className,
  hint = false,
  disabled = false,
}: {
  children: ReactNode
  /** با کشیدن ردیف به راست، از لبهٔ چپ دیده می‌شود */
  leading?: SwipeAction[]
  /** با کشیدن ردیف به چپ، از لبهٔ راست دیده می‌شود */
  trailing?: SwipeAction[]
  className?: string
  /** اشارهٔ یک‌باره برای آموزش حرکت */
  hint?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const coarse = useCoarsePointer()
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(false)
  const draggedRef = useRef(false)
  const enabled = coarse && !disabled && (leading.length > 0 || trailing.length > 0)

  const leadW = leading.length * ACTION_W
  const trailW = trailing.length * ACTION_W

  // شفافیت و مقیاس آیکون‌ها با میزان کشیدن
  const leadProgress = useTransform(x, [0, Math.max(1, leadW)], [0, 1])
  const trailProgress = useTransform(x, [-Math.max(1, trailW), 0], [1, 0])

  const snap = (to: number) => {
    openRef.current = to !== 0
    animate(x, to, { type: "spring", stiffness: 520, damping: 42 })
    if (to !== 0) openRows?.dispatchEvent(new CustomEvent("open", { detail: id }))
  }
  // بستن وقتی ردیف دیگری باز شد
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== id && openRef.current) {
        openRef.current = false
        animate(x, 0, { type: "spring", stiffness: 520, damping: 42 })
      }
    }
    openRows?.addEventListener("open", onOpen)
    return () => openRows?.removeEventListener("open", onOpen)
  }, [id, x])

  // اشارهٔ یک‌باره
  useEffect(() => {
    if (!hint || !enabled || reduce) return
    let seen = false
    try {
      seen = localStorage.getItem(HINT_KEY) === "1"
    } catch {
      /* ignore */
    }
    if (seen) return
    const t = setTimeout(async () => {
      const dir = trailW ? -1 : 1
      await animate(x, dir * 54, { duration: 0.35, ease: [0.16, 1, 0.3, 1] })
      await animate(x, 0, { type: "spring", stiffness: 380, damping: 20 })
      try {
        localStorage.setItem(HINT_KEY, "1")
      } catch {
        /* ignore */
      }
    }, 900)
    return () => clearTimeout(t)
  }, [hint, enabled, reduce, trailW, x])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const width = wrapRef.current?.offsetWidth ?? 360
    const off = x.get()
    const v = info.velocity.x
    // کشیدن کامل → اجرای اولین اکشن
    if (off < -width * 0.55 && trailing[0]) {
      snap(0)
      trailing[0].onAction()
      return
    }
    if (off > width * 0.55 && leading[0]) {
      snap(0)
      leading[0].onAction()
      return
    }
    if ((off < -trailW / 2 || v < -500) && trailW) return snap(-trailW)
    if ((off > leadW / 2 || v > 500) && leadW) return snap(leadW)
    snap(0)
  }

  const run = (a: SwipeAction) => {
    snap(0)
    a.onAction()
  }

  if (!enabled) return <div className={className}>{children}</div>

  return (
    <div ref={wrapRef} className={cn("relative overflow-hidden rounded-3xl", className)}>
      {/* leading — لبهٔ چپ (زیر ردیف) */}
      {leading.length > 0 && (
        <motion.div style={{ opacity: leadProgress }} className="absolute inset-y-0 left-0 flex">
          {leading.map((a) => (
            <ActionButton key={a.key} action={a} progress={leadProgress} onClick={() => run(a)} />
          ))}
        </motion.div>
      )}
      {/* trailing — لبهٔ راست */}
      {trailing.length > 0 && (
        <motion.div style={{ opacity: trailProgress }} className="absolute inset-y-0 right-0 flex">
          {trailing.map((a) => (
            <ActionButton key={a.key} action={a} progress={trailProgress} onClick={() => run(a)} />
          ))}
        </motion.div>
      )}

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -trailW, right: leadW }}
        dragElastic={{ left: trailW ? 0.35 : 0.05, right: leadW ? 0.35 : 0.05 }}
        dragMomentum={false}
        style={{ x, touchAction: "pan-y" }}
        onDragStart={() => {
          draggedRef.current = true
        }}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // کلیک بعد از کشیدن یا روی ردیف باز → فقط بستن
          if (draggedRef.current || openRef.current) {
            e.preventDefault()
            e.stopPropagation()
            if (openRef.current) snap(0)
          }
          draggedRef.current = false
        }}
        onPointerDown={() => {
          draggedRef.current = false
        }}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  )
}

function ActionButton({
  action,
  progress,
  onClick,
}: {
  action: SwipeAction
  progress: MotionValue<number>
  onClick: () => void
}) {
  const scale = useTransform(progress, [0, 1], [0.6, 1])
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: ACTION_W, background: action.color }}
      className="flex h-full flex-col items-center justify-center gap-1 text-white active:brightness-90"
    >
      <motion.span style={{ scale }} className="grid size-9 place-items-center rounded-full bg-white/20">
        {action.icon}
      </motion.span>
      <span className="text-caption font-bold">{action.label}</span>
    </button>
  )
}
