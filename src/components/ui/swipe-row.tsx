"use client"

/**
 * ردیف قابل کشیدن (سوایپ) — موبایل، با رفتاری شبیه iOS Mail
 *  • کشیدن به چپ → اکشن‌های trailing از لبهٔ راست بیرون می‌آیند (مثل پاس / تسویه)
 *  • کشیدن به راست → اکشن‌های leading از لبهٔ چپ بیرون می‌آیند (مثل حذف / برگشت)
 *  | ردیف ۱:۱ با انگشت حرکت می‌کند؛ سمتی که اکشن ندارد فقط کمی کش می‌آید (rubber-band)
 *  | عبور از نیمهٔ عرض → اولین اکشن «مسلح» می‌شود: پهن می‌شود، آیکون به لبهٔ ردیف می‌چسبد و لرزش کوتاه
 *    رها کردن در این حالت اکشن را اجرا می‌کند؛ برگشتن پیش از رها کردن لغوش می‌کند
 *  | رها کردن با سرعت انگشت (flick) ادامه پیدا می‌کند — فنر با همان سرعت شروع می‌شود، نه از صفر
 *  | تا پایان اکشن (مثلاً پنجرهٔ تأیید حذف) رنگ اکشن پشت ردیف می‌ماند، بعد ردیف برمی‌گردد
 *  | قفل جهت: حرکت عمودی به اسکرول صفحه سپرده می‌شود و ردیف تکان نمی‌خورد
 *  | با باز شدن یک ردیف یا لمس هر جای دیگر، ردیف باز بسته می‌شود؛ لمس روی ردیف باز فقط آن را می‌بندد
 *  • در دسکتاپ (اشاره‌گر دقیق) کشیدن غیرفعال است و ردیف مثل قبل کلیک می‌خورد
 *  • اشارهٔ کشیدن (swipe hint): وقتی لیست باز می‌شود، ۰٫۷ ثانیه بعد اولین ردیفی که کامل روی صفحه است
 *    حدود ۵۶px کنار می‌رود تا کمی از دکمهٔ اکشن دیده شود و برمی‌گردد. هر بازدید یک بار، در کل حداکثر ۳ بار؛
 *    با اولین کشیدن واقعی کاربر برای همیشه خاموش می‌شود. شمارش در localStorage با کلید hesabyar:swipe-hint.
 *    با «کاهش حرکت» گوشی یا روی دستگاه بدون صفحهٔ لمسی پخش نمی‌شود. برای فعال‌سازی در هر لیست، به ردیف‌ها hint بدهید
 *    (همهٔ ردیف‌ها می‌توانند hint داشته باشند؛ خودش اولین ردیف کامل‌دیده را انتخاب می‌کند).
 *    برای دیدن دوباره هنگام تست، کلید hesabyar:swipe-hint را از localStorage پاک کنید.
 */
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"

export interface SwipeAction {
  key: string
  label: string
  icon: ReactNode
  /** رنگ پس‌زمینه (CSS) */
  color: string
  onAction: () => void | Promise<unknown>
}

const ACTION_W = 76
/** فاصلهٔ لازم پیش از تشخیص جهت */
const SLOP = 8
/** نسبت عرض برای مسلح شدن / خلع سلاح (هیسترزیس تا مرز لرزش نزند) */
const ARM_AT = 0.5
const DISARM_AT = 0.44
/** سرعت (px/s) که رها کردن را «پرتاب» حساب می‌کند */
const FLICK_V = 550

const SPRING = { type: "spring", stiffness: 430, damping: 40, mass: 1, restDelta: 0.5 } as const
const ARM_SPRING = { type: "spring", stiffness: 620, damping: 34 } as const

const openRows = typeof window !== "undefined" ? new EventTarget() : null

// ───────── اشارهٔ کشیدن (swipe hint) ─────────
const HINT_KEY = "hesabyar:swipe-hint"
const HINT_MAX = 3
const HINT_DELAY = 700
const HINT_DISTANCE = 56
/** فضای پایین صفحه که نوار شناور موبایل می‌پوشاند */
const HINT_BOTTOM_INSET = 96

type HintState = { count: number; done: boolean }
let hintPlayedThisVisit = false
let hintTimer: ReturnType<typeof setTimeout> | null = null
const hintCandidates = new Map<string, { el: () => HTMLElement | null; play: () => void }>()

function readHint(): HintState | null {
  try {
    const v = JSON.parse(localStorage.getItem(HINT_KEY) || "{}") as Partial<HintState>
    return { count: Number(v.count) || 0, done: !!v.done }
  } catch {
    return null // بدون دسترسی به حافظه، اشاره پخش نمی‌شود
  }
}

function writeHint(v: HintState) {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/** کاربر خودش یک ردیف را کشید → اشاره برای همیشه خاموش */
function markSwiped() {
  const h = readHint()
  if (h && !h.done) writeHint({ ...h, done: true })
}

/** بعد از ۰٫۷ ثانیه، بالاترین ردیفِ کامل‌دیده را انتخاب و اشاره را پخش کن */
function scheduleHint() {
  if (hintTimer || hintPlayedThisVisit) return
  hintTimer = setTimeout(() => {
    hintTimer = null
    if (hintPlayedThisVisit) return
    const h = readHint()
    if (!h || h.done || h.count >= HINT_MAX) return
    let best: { top: number; play: () => void } | null = null
    for (const c of hintCandidates.values()) {
      const r = c.el()?.getBoundingClientRect()
      if (!r || r.height === 0 || r.top < 0 || r.bottom > window.innerHeight - HINT_BOTTOM_INSET) continue
      if (!best || r.top < best.top) best = { top: r.top, play: c.play }
    }
    if (!best) return
    hintPlayedThisVisit = true
    writeHint({ count: h.count + 1, done: false })
    best.play()
  }, HINT_DELAY)
}

/** کش‌آمدن پلاستیکی: هرچه بیشتر بکشی، کمتر جلو می‌رود و هرگز از dim رد نمی‌شود */
function rubber(over: number, dim: number) {
  return (1 - 1 / ((over * 0.55) / dim + 1)) * dim
}

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

type Side = "lead" | "trail"

interface Gesture {
  id: number
  startX: number
  startY: number
  from: number
  lock: "x" | "y" | null
  samples: { t: number; x: number }[]
}

export function SwipeRow({
  children,
  leading = [],
  trailing = [],
  className,
  hint = false,
  disabled = false,
  fullSwipe = true,
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
  /** کشیدن کامل، اولین اکشن هر سمت را اجرا کند */
  fullSwipe?: boolean
}) {
  const id = useId()
  const coarse = useCoarsePointer()
  const reduce = useReducedMotion()
  const { webApp } = useTelegram()
  const x = useMotionValue(0)
  /** ۰ تا ۱ — حالت مسلح (با فنر، تا جابه‌جایی آیکون نرم باشد) */
  const armed = useMotionValue(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const armedRef = useRef(false)
  const openRef = useRef(false)
  const busyRef = useRef(false)
  const suppressClickRef = useRef(false)
  const [side, setSide] = useState<Side | null>(null)
  const [open, setOpen] = useState(false)
  const enabled = coarse && !disabled && (leading.length > 0 || trailing.length > 0)

  const leadW = leading.length * ACTION_W
  const trailW = trailing.length * ACTION_W

  // فقط سمتی که دیده می‌شود رندر شود (تغییر علامت x به‌ندرت رخ می‌دهد)
  useEffect(
    () =>
      x.on("change", (v) => {
        const next: Side | null = v > 0.5 ? "lead" : v < -0.5 ? "trail" : null
        setSide((s) => (s === next ? s : next))
      }),
    [x]
  )

  const tick = (strong = false) => {
    const h = webApp?.HapticFeedback
    if (h) h.impactOccurred(strong ? "medium" : "light")
    else navigator.vibrate?.(strong ? 14 : 8)
  }

  const setArmed = (on: boolean, silent = false) => {
    if (armedRef.current === on) return
    armedRef.current = on
    if (!silent) tick()
    animate(armed, on ? 1 : 0, reduce ? { duration: 0 } : ARM_SPRING)
  }

  const width = () => wrapRef.current?.offsetWidth ?? 360

  const settle = (to: number, velocity = 0) => {
    const wasOpen = openRef.current
    openRef.current = to !== 0
    setOpen(to !== 0)
    if (to === 0) setArmed(false, true)
    if (to !== 0 && !wasOpen) openRows?.dispatchEvent(new CustomEvent("open", { detail: id }))
    return animate(x, to, reduce ? { duration: 0.15 } : { ...SPRING, velocity })
  }

  // بستن وقتی ردیف دیگری باز شد
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== id && (openRef.current || x.get() !== 0) && !busyRef.current) {
        openRef.current = false
        setOpen(false)
        animate(x, 0, SPRING)
      }
    }
    openRows?.addEventListener("open", onOpen)
    return () => openRows?.removeEventListener("open", onOpen)
  }, [id, x])

  // لمس هر جای دیگر صفحه (از جمله شروع اسکرول) → بستن
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (busyRef.current) return
      if (wrapRef.current?.contains(e.target as Node)) return
      openRef.current = false
      setOpen(false)
      animate(x, 0, SPRING)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [open, x])

  // اشارهٔ کشیدن — این ردیف نامزد می‌شود؛ هماهنگ‌کننده اولین ردیف کامل‌دیده را انتخاب می‌کند
  useEffect(() => {
    if (!hint || !enabled || reduce) return
    if (!window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints === 0) return
    hintCandidates.set(id, {
      el: () => wrapRef.current,
      play: async () => {
        const dir = trailW ? -1 : 1
        await animate(x, dir * HINT_DISTANCE, { duration: 0.38, ease: [0.22, 1, 0.36, 1] })
        await new Promise((r) => setTimeout(r, 260))
        if (gestureRef.current || openRef.current) return
        await animate(x, 0, { type: "spring", stiffness: 320, damping: 28 })
      },
    })
    scheduleHint()
    return () => {
      hintCandidates.delete(id)
    }
  }, [hint, enabled, reduce, trailW, x, id])

  /** فاصلهٔ خام انگشت → جابه‌جایی نمایشی ردیف */
  const resolve = (raw: number) => {
    const s = Math.sign(raw)
    const a = Math.abs(raw)
    const actions = s > 0 ? leading : trailing
    const openW = s > 0 ? leadW : trailW
    if (!actions.length) return s * rubber(a, 36)
    const w = width()
    const limit = fullSwipe ? w - 12 : openW
    const dim = fullSwipe ? 24 : openW * 0.5
    return s * (a <= limit ? a : limit + rubber(a - limit, dim))
  }

  const velocity = (g: Gesture) => {
    const now = performance.now()
    const recent = g.samples.filter((p) => now - p.t < 100)
    if (recent.length < 2) return 0
    const first = recent[0]
    const last = recent[recent.length - 1]
    const dt = last.t - first.t
    return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0
  }

  const commit = async (a: SwipeAction, dir: number, v: number) => {
    busyRef.current = true
    armedRef.current = true
    tick(true)
    // ردیف تا لبه می‌رود و رنگ اکشن کل ردیف را می‌پوشاند
    animate(armed, 1, ARM_SPRING)
    await animate(
      x,
      dir * width(),
      reduce ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 46, velocity: v, restDelta: 1 }
    )
    try {
      await a.onAction()
    } finally {
      // اگر ردیف حذف شد، این‌ها روی نمونهٔ از بین‌رفته بی‌اثرند
      await new Promise((r) => setTimeout(r, 120))
      busyRef.current = false
      settle(0)
    }
  }

  const run = async (a: SwipeAction) => {
    busyRef.current = true
    try {
      await a.onAction()
    } finally {
      busyRef.current = false
      settle(0)
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busyRef.current || (e.pointerType === "mouse" && e.button !== 0)) return
    x.stop()
    suppressClickRef.current = openRef.current
    gestureRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      from: x.get(),
      lock: null,
      samples: [{ t: performance.now(), x: e.clientX }],
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || g.id !== e.pointerId || g.lock === "y") return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.lock) {
      if (Math.hypot(dx, dy) < SLOP) return
      if (Math.abs(dx) < Math.abs(dy) * 1.2) {
        g.lock = "y"
        return
      }
      g.lock = "x"
      markSwiped()
      suppressClickRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      wrapRef.current?.setAttribute("data-dragging", "")
      openRows?.dispatchEvent(new CustomEvent("open", { detail: id }))
      // از نقطهٔ فعلی شروع کن تا ردیف به اندازهٔ SLOP نپرد
      g.startX = e.clientX
    }
    const now = performance.now()
    g.samples.push({ t: now, x: e.clientX })
    if (g.samples.length > 8) g.samples.shift()

    const next = resolve(g.from + (e.clientX - g.startX))
    x.set(next)

    if (fullSwipe) {
      const actions = next > 0 ? leading : trailing
      const ratio = Math.abs(next) / width()
      if (!actions.length) setArmed(false)
      else if (!armedRef.current && ratio >= ARM_AT) setArmed(true)
      else if (armedRef.current && ratio < DISARM_AT) setArmed(false)
    }
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || g.id !== e.pointerId) return
    gestureRef.current = null
    wrapRef.current?.removeAttribute("data-dragging")
    if (g.lock !== "x") return

    const off = x.get()
    const v = e.type === "pointercancel" ? 0 : velocity(g)

    if (armedRef.current) {
      const a = off > 0 ? leading[0] : trailing[0]
      if (a) return void commit(a, Math.sign(off), v)
    }

    const toward = (target: number) => settle(target, v)
    // پرتاب: جهت سرعت تصمیم می‌گیرد
    if (Math.abs(v) > FLICK_V) {
      if (off > 0) return void toward(v > 0 && leadW ? leadW : 0)
      if (off < 0) return void toward(v < 0 && trailW ? -trailW : 0)
    }
    if (off > leadW / 2 && leadW) return void toward(leadW)
    if (off < -trailW / 2 && trailW) return void toward(-trailW)
    toward(0)
  }

  if (!enabled) return <div className={className}>{children}</div>

  return (
    <div
      ref={wrapRef}
      className={cn("relative isolate overflow-hidden data-[dragging]:select-none", className)}
    >
      {side === "lead" && leading.length > 0 && (
        <ActionTray actions={leading} edge="left" x={x} armed={armed} open={open} onRun={run} />
      )}
      {side === "trail" && trailing.length > 0 && (
        <ActionTray actions={trailing} edge="right" x={x} armed={armed} open={open} onRun={run} />
      )}

      <motion.div
        style={{ x, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          // کلیک بعد از کشیدن یا روی ردیف باز → فقط بستن
          if (suppressClickRef.current || openRef.current || busyRef.current) {
            e.preventDefault()
            e.stopPropagation()
            if (openRef.current && !busyRef.current) settle(0)
          }
          suppressClickRef.current = false
        }}
        className="relative z-10 will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  )
}

/**
 * سینی اکشن‌های یک سمت. اولین اکشن کنار لبه است.
 * عرض هر دکمه = سهم مساوی از فاصلهٔ باز شده؛ در حالت مسلح دکمهٔ اول همه را می‌گیرد.
 */
function ActionTray({
  actions,
  edge,
  x,
  armed,
  open,
  onRun,
}: {
  actions: SwipeAction[]
  edge: "left" | "right"
  x: MotionValue<number>
  armed: MotionValue<number>
  open: boolean
  onRun: (a: SwipeAction) => void
}) {
  return (
    <div className="absolute inset-0" aria-hidden={!open}>
      {actions.map((a, i) => (
        <ActionButton
          key={a.key}
          action={a}
          index={i}
          count={actions.length}
          edge={edge}
          x={x}
          armed={armed}
          open={open}
          onClick={() => onRun(a)}
        />
      ))}
    </div>
  )
}

function ActionButton({
  action,
  index,
  count,
  edge,
  x,
  armed,
  open,
  onClick,
}: {
  action: SwipeAction
  index: number
  count: number
  edge: "left" | "right"
  x: MotionValue<number>
  armed: MotionValue<number>
  open: boolean
  onClick: () => void
}) {
  const share = (d: number, k: number, i: number) => {
    const even = d / count
    if (i === 0) return even + (d - even) * k
    return even * (1 - k)
  }
  // عرض این دکمه و فاصله‌اش از لبه
  const w = useTransform([x, armed], ([xv, k]: number[]) => share(Math.abs(xv), k, index))
  const offset = useTransform([x, armed], ([xv, k]: number[]) => {
    let o = 0
    for (let j = 0; j < index; j++) o += share(Math.abs(xv), k, j)
    return o
  })
  // مرکز محتوا از لبهٔ بیرونی دکمه: تا وقتی باریک است وسط، بعد ثابت کنار لبه، در حالت مسلح چسبیده به ردیف
  const shift = useTransform([w, armed], ([wv, k]: number[]) => {
    const rest = Math.min(wv / 2, ACTION_W / 2)
    const stuck = index === 0 ? Math.max(rest, wv - ACTION_W / 2) : rest
    const c = rest + (stuck - rest) * k
    return (edge === "left" ? 1 : -1) * (c - ACTION_W / 2)
  })
  const opacity = useTransform(w, [14, ACTION_W * 0.7], [0, 1])
  const scale = useTransform([w, armed], ([wv, k]: number[]) => {
    const p = Math.min(1, Math.max(0, (wv - 14) / (ACTION_W * 0.7 - 14)))
    return 0.55 + 0.45 * p + (index === 0 ? 0.1 * k : 0)
  })

  return (
    <motion.button
      type="button"
      tabIndex={open ? 0 : -1}
      onClick={onClick}
      style={{ width: w, background: action.color, ...(edge === "left" ? { left: offset } : { right: offset }) }}
      className="absolute inset-y-0 overflow-hidden text-white active:brightness-90"
    >
      <motion.span
        style={{ x: shift, opacity, width: ACTION_W, ...(edge === "left" ? { left: 0 } : { right: 0 }) }}
        className="absolute inset-y-0 flex flex-col items-center justify-center gap-1"
      >
        <motion.span style={{ scale }} className="grid size-9 place-items-center rounded-full bg-white/20">
          {action.icon}
        </motion.span>
        <span className="whitespace-nowrap text-caption font-bold">{action.label}</span>
      </motion.span>
    </motion.button>
  )
}
