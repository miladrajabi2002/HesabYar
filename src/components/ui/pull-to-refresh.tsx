"use client"

/**
 * کشیدن به پایین برای تازه‌سازی (لمسی؛ اسکرول بومی مرورگر با overscroll-behavior خاموش است)
 *  • از بالای صفحه که بکشی، یک دکمهٔ گرد از زیر هدر پایین می‌آید؛ حلقه‌اش با کشش پر می‌شود و
 *    آیکون می‌چرخد، محتوا با مقاومت کش‌سان کمی پایین می‌رود
 *  • از آستانه که گذشت: لرزش + «رها کن»؛ رها کردن = چرخش تا پایان تازه‌سازی، بعد تیک و برگشت فنری
 *  • فقط transform/opacity؛ با شیت باز، صفحهٔ اسکرول‌شده یا لمس داخل یک ناحیهٔ اسکرول‌شده فعال نمی‌شود
 */
import { ReactNode, useEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { Check } from "lucide-react"

const THRESHOLD = 76
const MAX = 132

/** مقاومت کش‌سان: هرچه بیشتر بکشی کمتر جلو می‌رود */
const rubber = (d: number) => MAX * (1 - Math.exp(-d / (MAX * 1.15)))

function scrolledAncestor(el: EventTarget | null): boolean {
  let n = el as HTMLElement | null
  while (n && n !== document.body) {
    if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true
    if (n.getAttribute?.("role") === "dialog") return true
    n = n.parentElement
  }
  return false
}

export function PullToRefresh({
  onRefresh,
  children,
  icon,
  haptic,
  topOffset = "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
  disabled = false,
}: {
  onRefresh: () => Promise<unknown>
  children: ReactNode
  /** آیکون وسط دایره (مثلاً نشان برند) */
  icon?: ReactNode
  haptic?: (kind: "tick" | "success") => void
  topOffset?: string
  disabled?: boolean
}) {
  const reduce = useReducedMotion()
  const pull = useMotionValue(0)
  const [state, setState] = useState<"idle" | "pulling" | "armed" | "refreshing" | "done">("idle")
  const stateRef = useRef(state)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  const hapticRef = useRef(haptic)
  useEffect(() => {
    onRefreshRef.current = onRefresh
    hapticRef.current = haptic
  }, [onRefresh, haptic])
  const set = (s: typeof state) => {
    stateRef.current = s
    setState(s)
  }

  const progress = useTransform(pull, [0, THRESHOLD], [0, 1], { clamp: true })
  const badgeY = useTransform(pull, (v) => v - 56)
  const badgeOpacity = useTransform(pull, [0, 24], [0, 1])
  const badgeScale = useTransform(pull, [0, THRESHOLD, MAX], [0.6, 1, 1.08])
  const iconRotate = useTransform(pull, [0, MAX], [0, 300])
  const contentRef = useRef<HTMLDivElement>(null)
  const dash = useTransform(progress, (p) => 113 * (1 - p))

  // محتوا با مقاومت پایین می‌رود؛ در حالت عادی هیچ transformی نمی‌ماند (تا fixedهای داخلش خراب نشوند)
  useEffect(
    () =>
      pull.on("change", (v) => {
        const el = contentRef.current
        if (el) el.style.transform = v > 0.5 ? `translate3d(0, ${(v * 0.42).toFixed(1)}px, 0)` : ""
      }),
    [pull]
  )

  useEffect(() => {
    if (disabled) return
    const coarse = window.matchMedia?.("(pointer: coarse)").matches
    if (!coarse) return

    const onStart = (e: TouchEvent) => {
      if (stateRef.current === "refreshing" || stateRef.current === "done") return
      if (e.touches.length !== 1 || window.scrollY > 0 || document.body.style.overflow === "hidden") return
      if (scrolledAncestor(e.target)) return
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      active.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dy = e.touches[0].clientY - start.current.y
      const dx = e.touches[0].clientX - start.current.x
      if (!active.current) {
        // اول جهت مشخص شود: کشیدن افقی (ردیف‌های کشیدنی، تقویم) یا رو به بالا = کاری نداریم
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) return void (start.current = null)
        if (dy < 6) return
        if (window.scrollY > 0) return void (start.current = null)
        active.current = true
        set("pulling")
      }
      const v = rubber(Math.max(0, dy - 6))
      pull.set(v)
      const armed = v >= THRESHOLD
      if (armed && stateRef.current !== "armed") {
        set("armed")
        hapticRef.current?.("tick")
      } else if (!armed && stateRef.current === "armed") set("pulling")
    }
    const onEnd = async () => {
      if (!start.current) return
      start.current = null
      if (!active.current) return
      active.current = false
      if (stateRef.current !== "armed") {
        set("idle")
        void animate(pull, 0, { type: "spring", stiffness: 420, damping: 34 })
        return
      }
      set("refreshing")
      void animate(pull, THRESHOLD * 0.86, { type: "spring", stiffness: 420, damping: 32 })
      const t0 = Date.now()
      try {
        await onRefreshRef.current()
      } catch {
        /* خطا را خود صفحه نشان می‌دهد */
      }
      // حداقل زمان تا چرخش دیده شود و پرش نزند
      await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - t0))))
      set("done")
      hapticRef.current?.("success")
      await new Promise((r) => setTimeout(r, 520))
      await animate(pull, 0, { type: "spring", stiffness: 360, damping: 30 })
      set("idle")
    }

    window.addEventListener("touchstart", onStart, { passive: true })
    // passive: لیسنر غیرپسیو روی window هر اسکرولِ لمسیِ کل اپ را منتظر جاوااسکریپت نگه می‌داشت
    // (موقع عوض کردن تب یا باز شدن شیت که رشتهٔ اصلی شلوغ است، اسکرول «گیر» می‌کرد).
    // preventDefault لازم نیست: بالای صفحه overscroll-behavior خاموش است و کشیدن به پایین اسکرولی ندارد.
    window.addEventListener("touchmove", onMove, { passive: true })
    window.addEventListener("touchend", onEnd)
    window.addEventListener("touchcancel", onEnd)
    return () => {
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      window.removeEventListener("touchcancel", onEnd)
    }
  }, [disabled, pull])

  const busy = state === "refreshing"
  const armed = state === "armed"
  return (
    <>
      <motion.div
        aria-hidden={state === "idle"}
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
        style={{ top: topOffset, y: badgeY, opacity: badgeOpacity }}
      >
        <motion.div className="flex flex-col items-center gap-1.5" style={{ scale: reduce ? 1 : badgeScale }}>
          <span className="relative grid size-11 place-items-center rounded-full border border-border bg-card shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)]">
            <svg viewBox="0 0 40 40" className={`absolute inset-0 size-full -rotate-90 ${busy ? "ptr-spin" : ""}`}>
              <circle cx="20" cy="20" r="18" fill="none" strokeWidth="2.5" className="stroke-muted" />
              <motion.circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={busy ? "40 113" : "113"}
                style={busy ? undefined : { strokeDashoffset: dash }}
                className={armed || busy || state === "done" ? "stroke-primary" : "stroke-foreground/35"}
              />
            </svg>
            <motion.span
              className="relative grid place-items-center text-primary"
              style={{ rotate: busy || state === "done" || reduce ? 0 : iconRotate }}
              animate={state === "done" ? { scale: [0.6, 1.15, 1] } : armed ? { scale: 1.12 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
            >
              {state === "done" ? <Check className="size-5 text-income" strokeWidth={3} /> : icon}
            </motion.span>
          </span>
          <span className="rounded-full bg-card/90 px-2.5 py-0.5 text-micro font-bold text-muted-foreground shadow-sm backdrop-blur">
            {state === "done" ? "به‌روز شد" : busy ? "در حال تازه‌سازی…" : armed ? "رها کن" : "بکش برای تازه‌سازی"}
          </span>
        </motion.div>
      </motion.div>
      <div ref={contentRef}>{children}</div>
    </>
  )
}
