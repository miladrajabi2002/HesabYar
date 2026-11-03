"use client"

/**
 * ردیف قابل کشیدن (سوایپ) برای فهرست‌ها روی صفحهٔ لمسی، به سبک Mail
 *  • موقعیت‌ها منطقی‌اند و در فارسی آینه می‌شوند: کشیدن چپ→راست اکشن‌های `trailing` را از لبهٔ چپ
 *    بیرون می‌آورد و کشیدن راست→چپ اکشن‌های `leading` را از لبهٔ راست.
 *  • رها کردن بعد از نیمهٔ سینی → سینی باز می‌ماند؛ کشیدن بلند (بیش از FULL_SWIPE عرض ردیف) اولین اکشن
 *    همان سمت را مستقیم اجرا می‌کند و هنگام مسلح شدن یک لرزش کوتاه می‌دهد.
 *  • حرکت فقط وقتی گرفته می‌شود که آشکارا افقی باشد، پس با اسکرول عمودی درگیر نمی‌شود؛ لمسی که از
 *    لبهٔ صفحه شروع شود به حرکت «برگشت» مرورگر سپرده می‌شود.
 *  • هر بار فقط یک ردیف باز است؛ اسکرول، لمس جای دیگر یا لمس خود ردیف آن را می‌بندد. روی ماوس/ترک‌پد
 *    کاری نمی‌کند، پس هر اکشن باید در منو یا صفحهٔ جزئیات ردیف هم باشد.
 *  • با `hint`، اولین ردیفی که کامل روی صفحه است هر بار که صفحه باز می‌شود اکشن‌هایش را کمی نشان
 *    می‌دهد؛ اگر در همان بازدید خودشان ردیفی را بکشند، دیگر در آن صفحه اشاره نمی‌کند.
 *  • کشیدن کامل ردیف را تا لبه بیرون می‌برد و رنگ اکشن کل ردیف را می‌گیرد؛ اکشن `navigates` همین‌طور
 *    می‌ماند تا صفحهٔ بعد باز شود، بقیه بعد از مکثی کوتاه با فنر برمی‌گردند.
 *  • بعد از اکشن، ردیف `removes` بیرون می‌لغزد و جمع می‌شود تا فهرست پیش از تازه‌سازی بسته شود؛ بقیهٔ
 *    ردیف‌ها با فنر برمی‌گردند و آیکون اکشن برای تأیید یک تپش کوچک می‌زند.
 */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export interface SwipeAction {
  key: string
  label: string
  icon: LucideIcon
  tone?: "danger" | "brand" | "ok" | "warning" | "supplier" | "neutral"
  /** ردیف بعد از موفقیت از فهرست می‌رود (حذف) */
  removes?: boolean
  /** به صفحهٔ دیگری می‌رود: ردیف کامل کنار می‌رود و رنگ اکشن تا باز شدن صفحهٔ بعد می‌ماند */
  navigates?: boolean
  /** اگر شکست خورد `false` برگردانید تا ردیف `removes` برگردد */
  onAction: () => void | boolean | Promise<unknown>
}

const ACTION_WIDTH = 76
const LOCK_DISTANCE = 8
const EDGE_GUARD = 20
const FULL_SWIPE = 0.6
const OPEN_VELOCITY = 450 // px/s
const SNAP = { type: "spring" as const, stiffness: 560, damping: 44, mass: 0.7 }
/** برگشت بعد از اکشنی که ردیف را حذف نمی‌کند: کمی نرم‌تر، تا «انجام شد» خوانده شود */
const RETURN = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 }
/** کشیدن کامل: ردیف تا لبه بیرون می‌رود و رنگ اکشن کل ردیف را می‌گیرد */
const COMMIT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const }
/** مکث کوتاه روی رنگ پرشده پیش از برگشت، تا اجرا شدن دیده شود */
const COMMIT_HOLD = 180
const HINT_PEEK = 56
/** سینی تا این اندازه زیر ردیف ادامه دارد تا گوشه‌های گرد ردیف هیچ‌وقت شکاف نشان ندهند */
const RAIL_TUCK = 28
/** ردیف حذف‌شده‌ای که بعد از این مدت هنوز در فهرست است برمی‌گردد تا جای خالی نماند */
const REMOVE_FALLBACK = 5000

const TONE: Record<NonNullable<SwipeAction["tone"]>, string> = {
  danger: "bg-destructive text-destructive-foreground",
  brand: "bg-primary text-primary-foreground",
  ok: "bg-income text-white",
  warning: "bg-warning text-warning-foreground",
  supplier: "bg-[var(--role-supplier)] text-white",
  neutral: "bg-muted-foreground text-background",
}

/** ردیف باز فعلی، تا باز شدن ردیف دیگر آن را ببندد */
let openRow: { close: () => void } | null = null
/**
 * هر صفحه یک اشاره، که اولین ردیفِ hint‌دار داخل دید (یا کشیدن خود کاربر) آن را برمی‌دارد. وقتی همهٔ
 * ردیف‌های hint‌دار unmount شدند، یعنی از صفحه رفته‌اند، آزاد می‌شود تا برگشتن دوباره اشاره کند.
 */
let hintClaimed = false
/** همهٔ ردیف‌های hint‌دارِ mount‌شده، تا بالاترینِ روی صفحه اشاره کند */
const hintedRows = new Set<HTMLElement>()

/** کاربر در همین صفحه ردیفی را کشید؛ اشارهٔ این بازدید دیگر لازم نیست */
function markLearned() {
  hintClaimed = true
}

function fullyVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight
}

/** ردیف hint‌دار دیگری بالاتر از این، کامل روی صفحه است؟ پس او اول است */
function rowAboveIsVisible(element: HTMLElement) {
  for (const other of hintedRows) {
    if (other === element) continue
    const above = other.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    if (above && fullyVisible(other)) return true
  }
  return false
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)")
    const update = () => setCoarse(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return coarse
}

export function SwipeRow({
  leading = [],
  trailing = [],
  disabled = false,
  hint = false,
  className,
  children,
}: {
  /** ابتدای سطر (در فارسی لبهٔ راست) — با کشیدن راست→چپ */
  leading?: SwipeAction[]
  /** انتهای سطر (در فارسی لبهٔ چپ) — با کشیدن چپ→راست */
  trailing?: SwipeAction[]
  disabled?: boolean
  /** اشارهٔ کوتاه به اکشن‌ها وقتی ردیف دیده شد، برای آموزش حرکت */
  hint?: boolean
  /** شکل ردیف (گردی، حاشیه) — سینی‌ها با همین بریده می‌شوند */
  className?: string
  children: ReactNode
}) {
  const coarse = useCoarsePointer()
  const reduceMotion = useReducedMotion()
  const { webApp } = useTelegram()
  const rootRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [rtl, setRtl] = useState(false)
  const [openSide, setOpenSide] = useState<"leading" | "trailing" | null>(null)
  const [armed, setArmed] = useState<"leading" | "trailing" | null>(null)
  const [busy, setBusy] = useState(false)
  /** سمتی که اکشنش همین الان اجرا شد، تا آیکونش هنگام برگشت ردیف تپش بزند */
  const [confirmed, setConfirmed] = useState<"leading" | "trailing" | null>(null)
  // ردیف تا پایان اکشن خودش قابل کشیدن می‌ماند، حتی اگر اکشن در میانه غیرفعالش کند (پاس شدن چک)،
  // تا انیمیشن برگشت نیمه‌کاره نماند.
  const enabled = coarse && (!disabled || busy) && (leading.length > 0 || trailing.length > 0)

  // سمت فیزیکی هر سینی منطقی: x مثبت لبهٔ چپ را نشان می‌دهد.
  const sideForX = (value: number): "leading" | "trailing" | null => {
    if (value === 0) return null
    const revealsLeft = value > 0
    return revealsLeft === rtl ? "trailing" : "leading"
  }
  const signFor = (side: "leading" | "trailing") => ((side === "trailing") === rtl ? 1 : -1)
  const stateRef = useRef({ leading, trailing, rtl, openSide, busy, reduceMotion })
  useLayoutEffect(() => {
    stateRef.current = { leading, trailing, rtl, openSide, busy, reduceMotion }
  })
  const actionsFor = (side: "leading" | "trailing") => (side === "leading" ? stateRef.current.leading : stateRef.current.trailing)
  // شناسهٔ ثابت برای ثبت ردیف باز، که بستن و جاانداختن ردیف را هم خودش دارد.
  const [handle] = useState(() => {
    const row = {
      settle(target: number, side: "leading" | "trailing" | null) {
        setOpenSide(side)
        animate(x, target, stateRef.current.reduceMotion ? { duration: 0 } : SNAP)
        if (side) {
          // حرکت را خودشان پیدا کردند؛ اشاره دیگر لازم نیست.
          markLearned()
          if (openRow && openRow !== row) openRow.close()
          openRow = row
        } else if (openRow === row) {
          openRow = null
        }
      },
      close() {
        setArmed(null)
        row.settle(0, null)
      },
    }
    return row
  })
  const settle = handle.settle

  const tick = () => {
    const haptic = webApp?.HapticFeedback
    if (haptic) haptic.impactOccurred("light")
    else navigator.vibrate?.(10)
  }

  const commitTick = () => {
    const haptic = webApp?.HapticFeedback
    if (haptic) haptic.notificationOccurred("success")
    else navigator.vibrate?.([12, 40, 12])
  }

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  async function perform(action: SwipeAction) {
    try {
      return (await action.onAction()) !== false
    } catch {
      return false
    }
  }

  /** `full` یعنی با کشیدن کامل اجرا شد، نه با لمس دکمهٔ سینی باز */
  async function run(action: SwipeAction, side: "leading" | "trailing", full = false) {
    if (stateRef.current.busy) return
    setBusy(true)
    markLearned()
    if (openRow === handle) openRow = null
    const root = rootRef.current

    // فقط اکشن اول کل ردیف را پر می‌کند.
    const first = actionsFor(side)[0] === action
    if (action.navigates && first && root) {
      // رنگ اکشن کل ردیف را می‌گیرد و همین‌طور می‌ماند تا صفحهٔ بعد جایش را بگیرد.
      setArmed(side)
      setOpenSide(null)
      setConfirmed(side)
      commitTick()
      await Promise.all([animate(x, signFor(side) * root.offsetWidth, reduceMotion ? { duration: 0 } : COMMIT), perform(action)])
      await wait(REMOVE_FALLBACK)
      // ناوبری انجام نشد یا برگشتند؛ ردیف را سر جایش بیاور.
      if (!root.isConnected) return
      setArmed(null)
      setConfirmed(null)
      await animate(x, 0, reduceMotion ? { duration: 0 } : RETURN)
      setBusy(false)
      return
    }

    if (full && first && !action.removes && root) {
      // ردیف تا لبه می‌رود، رنگ پر می‌شود و آیکون تپش می‌زند؛ بعد از اجرا با فنر برمی‌گردد.
      setArmed(side)
      setOpenSide(null)
      setConfirmed(side)
      commitTick()
      await Promise.all([
        animate(x, signFor(side) * root.offsetWidth, reduceMotion ? { duration: 0 } : COMMIT).then(() => wait(reduceMotion ? 0 : COMMIT_HOLD)),
        perform(action),
      ])
      setArmed(null)
      await animate(x, 0, reduceMotion ? { duration: 0 } : RETURN)
      setConfirmed(null)
      setBusy(false)
      return
    }

    if (!action.removes || !root) {
      // ردیف هم‌زمان با اجرای اکشن با فنر برمی‌گردد؛ تپش آیکون می‌گوید انجام شد.
      setArmed(null)
      setOpenSide(null)
      setConfirmed(side)
      await Promise.all([animate(x, 0, reduceMotion ? { duration: 0 } : RETURN), perform(action)])
      setConfirmed(null)
      setBusy(false)
      return
    }

    // اکشن اول هنگام بیرون رفتن ردیف کل سینی را پر می‌کند، بعد ردیف جمع می‌شود
    // تا فهرست پیش از تازه‌سازی بسته شود.
    setArmed(side)
    const height = root.offsetHeight
    await animate(x, signFor(side) * root.offsetWidth, reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 1, 1] })
    const fold = animate(root, { height: [height, 0], opacity: [1, 0] }, { duration: reduceMotion ? 0 : 0.26, ease: [0.32, 0.72, 0, 1] })
    const [ok] = await Promise.all([perform(action), fold])
    if (ok) {
      await wait(REMOVE_FALLBACK)
      // معمولاً تا الان تازه‌سازی آن را برداشته؛ وگرنه برش گردان.
      if (!root.isConnected) return
    }
    setArmed(null)
    setOpenSide(null)
    x.set(0)
    await animate(root, { height: [0, root.scrollHeight], opacity: [0, 1] }, { duration: reduceMotion ? 0 : 0.26, ease: [0.32, 0.72, 0, 1] })
    root.style.height = ""
    setBusy(false)
  }

  useEffect(() => {
    setRtl(getComputedStyle(rootRef.current ?? document.documentElement).direction === "rtl")
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !root) return

    let start: { x: number; y: number; offset: number; t: number } | null = null
    let mode: "pending" | "horizontal" | "vertical" = "pending"
    let lastX = 0
    let lastT = 0
    let velocity = 0
    let suppressClick = false

    const railWidth = (side: "leading" | "trailing") => actionsFor(side).length * ACTION_WIDTH

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || stateRef.current.busy) return
      const touch = event.touches[0]
      if (touch.clientX < EDGE_GUARD || touch.clientX > window.innerWidth - EDGE_GUARD) return
      // ردیف را وسط حرکت (فنر یا اشاره) بگیر، نه اینکه با آن بجنگی.
      x.stop()
      start = { x: touch.clientX, y: touch.clientY, offset: x.get(), t: performance.now() }
      mode = "pending"
      lastX = touch.clientX
      lastT = start.t
      velocity = 0
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return
      const touch = event.touches[0]
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (mode === "pending") {
        if (Math.hypot(dx, dy) < LOCK_DISTANCE) return
        mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? "horizontal" : "vertical"
        if (mode === "vertical") {
          start = null
          return
        }
        markLearned()
        if (openRow && openRow !== handle) openRow.close()
      }
      if (mode !== "horizontal") return
      if (event.cancelable) event.preventDefault()

      const now = performance.now()
      velocity = ((touch.clientX - lastX) / Math.max(1, now - lastT)) * 1000
      lastX = touch.clientX
      lastT = now

      let next = start.offset + dx
      const side = sideForX(next)
      const width = root.offsetWidth
      if (!side || actionsFor(side).length === 0) {
        next = Math.sign(next) * Math.min(16, Math.abs(next) * 0.15)
      } else if (Math.abs(next) > width * 0.92) {
        next = Math.sign(next) * width * 0.92
      }
      x.set(next)

      const nextArmed = side && actionsFor(side).length > 0 && Math.abs(next) > width * FULL_SWIPE ? side : null
      setArmed((current) => {
        if (current !== nextArmed && nextArmed) tick()
        return nextArmed
      })
    }

    const onTouchEnd = () => {
      if (!start) return
      const wasHorizontal = mode === "horizontal"
      start = null
      if (!wasHorizontal) return
      suppressClick = true
      window.setTimeout(() => { suppressClick = false }, 400)

      const offset = x.get()
      const side = sideForX(offset)
      const width = root.offsetWidth
      if (!side || actionsFor(side).length === 0) {
        handle.close()
        return
      }
      const first = actionsFor(side)[0]
      if (Math.abs(offset) > width * FULL_SWIPE && first) {
        void run(first, side, true)
        return
      }
      const rail = railWidth(side)
      const towardOpen = Math.sign(velocity) === Math.sign(offset)
      if (Math.abs(offset) > rail / 2 || (towardOpen && Math.abs(velocity) > OPEN_VELOCITY)) {
        setArmed(null)
        settle(signFor(side) * rail, side)
      } else {
        handle.close()
      }
    }

    // لمس روی ردیف باز فقط آن را می‌بندد و مقصد ردیف را باز نمی‌کند.
    const onClickCapture = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-swipe-action]")) return
      if (suppressClick || stateRef.current.openSide) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick = false
        if (stateRef.current.openSide) handle.close()
      }
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchmove", onTouchMove, { passive: false })
    root.addEventListener("touchend", onTouchEnd)
    root.addEventListener("touchcancel", onTouchEnd)
    root.addEventListener("click", onClickCapture, true)
    return () => {
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchmove", onTouchMove)
      root.removeEventListener("touchend", onTouchEnd)
      root.removeEventListener("touchcancel", onTouchEnd)
      root.removeEventListener("click", onClickCapture, true)
    }
    // هندلرها آخرین پراپ‌ها را از stateRef می‌خوانند.
  }, [enabled, rtl])

  // اسکرول یا لمس هر جای دیگر، ردیف باز را می‌بندد.
  useEffect(() => {
    if (!openSide) return
    const onScroll = () => handle.close()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) handle.close()
    }
    window.addEventListener("scroll", onScroll, { passive: true, capture: true })
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [openSide])

  useEffect(() => () => {
    if (openRow === handle) openRow = null
  }, [handle])

  // اشاره: ردیف را وقتی داخل دید آمد کمی به سمت سینی اولش ببر و برگردان.
  useEffect(() => {
    const root = rootRef.current
    if (!enabled || !hint || !root) return
    // حتی اگر این ردیف اشاره نکند ثبت می‌شود، تا صفحه فقط با رفتن آخرین ردیف hint‌دار «ترک‌شده» حساب شود.
    hintedRows.add(root)
    const side = stateRef.current.leading.length ? "leading" : "trailing"
    let timer = 0
    // برداشته شده ولی هنوز پخش نشده. ردیفی که دوباره رندر یا unmount شود یا نتواند پخش کند آن را پس
    // می‌دهد، تا تازه‌سازی زندهٔ فهرست یا رندر دوباره در ۰٫۷ ثانیهٔ اول اشارهٔ صفحه را نبلعد.
    let pending = false
    const release = () => {
      if (!pending) return
      pending = false
      hintClaimed = false
    }
    const observer = reduceMotion || hintClaimed ? null : new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.9 || hintClaimed) return
      if (rowAboveIsVisible(root)) return
      hintClaimed = true
      pending = true
      observer?.disconnect()
      timer = window.setTimeout(() => {
        if (document.hidden || stateRef.current.openSide || stateRef.current.busy || x.get() !== 0) {
          release()
          return
        }
        pending = false
        const peek = signFor(side) * HINT_PEEK
        void animate(x, [0, peek, peek, 0], { duration: 1.1, times: [0, 0.32, 0.55, 1], ease: [0.32, 0.72, 0, 1] })
      }, 700)
    }, { threshold: 0.9 })
    observer?.observe(root)
    return () => {
      hintedRows.delete(root)
      observer?.disconnect()
      window.clearTimeout(timer)
      release()
      // آخرین ردیف hint‌دار رفت: از صفحه رفته‌اند، پس صفحهٔ بعد دوباره اشاره می‌کند.
      if (hintedRows.size === 0) hintClaimed = false
    }
  }, [enabled, hint, reduceMotion, rtl])

  if (!enabled) return <div className={className}>{children}</div>

  return (
    <div ref={rootRef} className={cn("relative isolate overflow-hidden", className)}>
      {(["leading", "trailing"] as const).map((side) => {
        const actions = side === "leading" ? leading : trailing
        if (!actions.length) return null
        // leading در ابتدای سطر، trailing در انتهای سطر.
        return (
          <Rail
            key={side}
            side={side}
            actions={actions}
            x={x}
            rtl={rtl}
            open={openSide === side}
            armed={armed === side}
            confirmed={confirmed === side}
            onRun={(action) => void run(action, side)}
          />
        )
      })}
      {/* لایهٔ ردیف باید مات باشد: پس‌زمینهٔ نیمه‌شفاف ردیف (حالت لمس، کارت تازه) وگرنه رنگ سینی زیرش را نشان می‌دهد. */}
      <motion.div style={{ x }} className="relative z-10 touch-pan-y bg-card">
        {children}
      </motion.div>
    </div>
  )
}

function Rail({
  side,
  actions,
  x,
  rtl,
  open,
  armed,
  confirmed,
  onRun,
}: {
  side: "leading" | "trailing"
  actions: SwipeAction[]
  x: MotionValue<number>
  rtl: boolean
  open: boolean
  armed: boolean
  confirmed: boolean
  onRun: (action: SwipeAction) => void
}) {
  const reduceMotion = useReducedMotion()
  // فقط وقتی ردیف به سمت این سینی می‌رود دیده می‌شود.
  const onLeft = (side === "trailing") === rtl
  const opacity = useTransform(x, (value) => ((onLeft ? value > 0 : value < 0) ? 1 : 0))
  const width = useTransform(x, (value) => Math.max(actions.length * ACTION_WIDTH, Math.abs(value)) + RAIL_TUCK)
  const first = actions[0]
  // نوار زیر ردیف به اکشنِ نزدیک‌تر به ردیف می‌چسبد.
  const edge = armed ? first : actions[actions.length - 1]

  // چیدمان فیزیکی (dir="ltr") تا اکشن اول همیشه کنار لبهٔ صفحه باشد. بعد از عرض خود سینی، دکمه‌ها با
  // کشیدن پهن می‌شوند تا پشت ردیف شکافی باز نشود؛ در حالت مسلح دکمهٔ اول همه را می‌گیرد. سینی به اندازهٔ
  // RAIL_TUCK زیر ردیف ادامه دارد (با رنگ اکشن لبه) تا گوشه‌های گرد ردیف روی رنگ بنشینند نه صفحه.
  return (
    <motion.div
      aria-hidden={!open}
      dir="ltr"
      style={{ opacity, width, [onLeft ? "paddingRight" : "paddingLeft"]: RAIL_TUCK }}
      className={cn(
        "absolute inset-y-0 flex",
        onLeft ? "left-0 flex-row" : "right-0 flex-row-reverse",
        edge && TONE[edge.tone ?? "neutral"],
      )}
    >
      {actions.map((action, index) => {
        const Icon = action.icon
        const flex = armed ? (index === 0 ? "1 1 0px" : "0 0 0px") : `1 1 ${ACTION_WIDTH}px`
        return (
          <button
            key={action.key}
            type="button"
            data-swipe-action=""
            tabIndex={open ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation()
              onRun(action)
            }}
            className={cn(
              "flex h-full min-w-0 overflow-hidden transition-[flex] duration-200 ease-out",
              // برچسب هنگام پهن شدن دکمه کنار لبهٔ ردیف می‌ماند.
              onLeft ? "justify-end" : "justify-start",
              TONE[action.tone ?? "neutral"],
            )}
            style={{ flex }}
          >
            <span
              dir="auto"
              className="flex h-full shrink-0 flex-col items-center justify-center gap-1 px-2 text-caption font-bold"
              style={{ width: ACTION_WIDTH }}
            >
              {/* وقتی رها کردن اجرایش می‌کند کمی بزرگ می‌شود؛ بعد از اجرا تپش می‌زند. */}
              <motion.span
                className="flex"
                animate={{ scale: index > 0 || reduceMotion ? 1 : confirmed ? [1, 1.32, 1] : armed ? 1.18 : 1 }}
                transition={confirmed ? { duration: 0.36, times: [0, 0.4, 1], ease: [0.32, 0.72, 0, 1] } : SNAP}
              >
                <Icon className="size-5" aria-hidden="true" />
              </motion.span>
              <span className="max-w-full truncate">{action.label}</span>
            </span>
          </button>
        )
      })}
      {armed && first && <span className="sr-only">{first.label}</span>}
    </motion.div>
  )
}
