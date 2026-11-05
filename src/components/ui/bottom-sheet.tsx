"use client"

/**
 * باتم‌شیت موبایل — ایده از پروژه vignet
 * موبایل: از پایین با انیمیشن فنری بالا می‌آید + درگ واقعی دستگیره برای بستن (MO-04)
 * دسکتاپ: پیش‌فرض «کشو» — پنل کناری که از لبهٔ چپ صفحه (انتهای خط در RTL) باز می‌شود
 *   (الگوی SideSheet پروژهٔ vignet)؛ برای تأیید‌های کوچک «dialog» وسط صفحه
 */
import { Fragment, ReactNode, useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { acquireBodyScrollLock } from "@/lib/body-scroll-lock"

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

const DESKTOP_QUERY = "(min-width: 1024px)"
function subscribeDesktop(cb: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener("change", cb)
  return () => media.removeEventListener("change", cb)
}
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches

/**
 * منحنی باتم‌شیت iOS (همان vaul): شروع تند و نشستن بلند و نرم. cubic-bezier عمداً به‌جای فنر:
 * فنر framer روی WAAPI فقط با `linear()` روی compositor می‌ماند و جایی که مرورگر آن را ندارد (iOS
 * قدیمی‌تر) به حلقهٔ JS روی رشتهٔ اصلی برمی‌گشت؛ یعنی دقیقاً وقتی محتوای شیت mount می‌شد فریم‌های
 * اول می‌افتاد. cubic-bezier همه‌جا بومی است.
 */
const SHEET_EASE = [0.32, 0.72, 0, 1] as const
const SHEET_IN = 0.5
const SHEET_OUT = 0.3

/**
 * ورود/خروج باتم‌شیت با رشتهٔ transform (نه y) روی یک قاب جدا: framer مقدار transform را با WAAPI
 * روی compositor اجرا می‌کند، پس وقتی محتوای شیت همان لحظه mount می‌شود و رشتهٔ اصلی شلوغ است
 * انیمیشن ادامه می‌دهد. درگ دستگیره روی خود پنل (y) می‌ماند.
 */
const sheetVariants = {
  hidden: { transform: "translate3d(0, 100%, 0)" },
  visible: { transform: "translate3d(0, 0%, 0)", transition: { duration: SHEET_IN, ease: SHEET_EASE } },
  exit: { transform: "translate3d(0, 100%, 0)", transition: { duration: SHEET_OUT, ease: SHEET_EASE } },
}

/** قاب لغزندهٔ باتم‌شیت موبایل؛ در دسکتاپ/کاهش حرکت فقط خود پنل رندر می‌شود */
function SlideFrame({ slide, full, children }: { slide: boolean; full: boolean; children: ReactNode }) {
  if (!slide) return <>{children}</>
  return (
    <motion.div
      // لایهٔ جدا از همان اول: شروع انیمیشن منتظر ساختن لایه نمی‌ماند
      className={cn("absolute inset-x-0 bottom-0 will-change-transform", full && "top-0")}
      variants={sheetVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}

// دیالوگ و کشوی دسکتاپ هم با رشتهٔ transform (نه x/y/scale) تا روی compositor بمانند
const dialogVariants = {
  hidden: { opacity: 0, transform: "translate3d(0, 10px, 0) scale(0.97)" },
  visible: { opacity: 1, transform: "translate3d(0, 0px, 0) scale(1)", transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, transform: "translate3d(0, 6px, 0) scale(0.985)", transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const } },
}

const drawerVariants = (rtl: boolean) => ({
  hidden: { transform: `translate3d(${rtl ? "-104%" : "104%"}, 0, 0)`, opacity: 0.6 },
  visible: {
    transform: "translate3d(0%, 0, 0)",
    opacity: 1,
    transition: { duration: 0.42, ease: SHEET_EASE },
  },
  exit: {
    transform: `translate3d(${rtl ? "-104%" : "104%"}, 0, 0)`,
    opacity: 0.6,
    transition: { duration: 0.24, ease: SHEET_EASE },
  },
})

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "auto",
  desktopMode = "drawer",
  hideHeader = false,
  className,
  contentClassName,
}: {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: "auto" | "tall" | "full"
  /** desktop: «drawer» پنل کناری (پیش‌فرض) | «dialog» وسط صفحه | «sheet» همان باتم‌شیت | «hidden» فقط موبایل */
  desktopMode?: "drawer" | "dialog" | "sheet" | "hidden"
  hideHeader?: boolean
  className?: string
  contentClassName?: string
}) {
  const reactId = useId()
  const titleId = `${reactId}-sheet-title`
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const reduceMotion = useReducedMotion()
  // MO-04: درگ واقعی برای بستن — فقط از دستگیره شروع می‌شود تا اسکرول محتوا سالم بماند
  const dragControls = useDragControls()

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const { offset, velocity } = info
    // اگر زیاد کشید یا سریع پرتاب کرد → بسته شود؛ وگرنه فنر برمی‌گرداند
    if (offset.y > 120 || velocity.y > 600) {
      onCloseRef.current()
    }
  }, [])

  // تشخیص سمت کلاینت بدون setState داخل افکت
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  // دسکتاپ بودن همان رندر اول خوانده می‌شود: شیت‌هایی که تازه mount می‌شوند (فرم کالا/حساب)
  // قبلاً یک فریم به شکل باتم‌شیت موبایل بالا می‌آمدند و وسط انیمیشن به کشو تبدیل می‌شدند
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, () => false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])


  useEffect(() => {
    if (!open) return
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // قفل اسکرول با شمارش مرجع: با دو شیت تودرتو، فقط بسته‌شدن دومی قفل را آزاد می‌کند
    const releaseScrollLock = acquireBodyScrollLock()
    const raf = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }))

    function onKeyDown(event: KeyboardEvent) {
      const modals = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      )
      if (modals.at(-1) !== panelRef.current) return
      // فهرست شناور Select (دسکتاپ) روی شیت باز است — Esc فقط همان را می‌بندد
      if (document.querySelector('[data-slot="select-popup"]')) return
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(raf)
      releaseScrollLock()
      document.removeEventListener("keydown", onKeyDown)
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open])

  if (!mounted) return null

  const asDialog = isDesktop && desktopMode === "dialog"
  const asDrawer = isDesktop && desktopMode === "drawer"
  const rtl = document.documentElement.dir === "rtl"
  const hiddenDesktop = isDesktop && desktopMode === "hidden"
  const slide = !asDialog && !asDrawer && !reduceMotion
  if (hiddenDesktop) return null

  const maxHeight = asDrawer
    ? "none"
    : size === "full" ? "100dvh" : size === "tall" ? "min(88dvh, 44rem)" : "min(82dvh, 38rem)"

  return createPortal(
    <AnimatePresence>
      {open && (
        // پس‌زمینه و پنل هر کدام انیمیشن خودشان را دارند؛ AnimatePresence تا پایان خروج هر دو صبر می‌کند
        <motion.div className={cn("fixed inset-0 z-[100]", asDialog && "grid place-items-center p-6")}>
          {/* لایه پس‌زمینه */}
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="بستن"
            onClick={() => onCloseRef.current()}
            // تیرگی نرم ظاهر/محو می‌شود (قبلاً یک‌باره می‌پرید و فقط پنل حرکت داشت)
            initial={{ opacity: 0 }}
            // هم‌گام با پنل: تیرگی با همان منحنی و تقریباً همان مدت می‌آید و می‌رود
            animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : SHEET_IN * 0.8, ease: SHEET_EASE } }}
            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : SHEET_OUT, ease: SHEET_EASE } }}
            // بدون backdrop-filter: در وب‌اپ iOS بلور هنگام محو شدن با opacity والد هماهنگ نمی‌شد
            // و تکه‌ای تار روی هدر می‌ماند — فقط تیرگی ساده
            className={cn("absolute inset-0 cursor-default", asDrawer ? "bg-[rgb(15_26_23/0.34)]" : "bg-[rgb(15_26_23/0.45)]")}
          />

          {/* پنل — MO-04: در موبایل با کشیدن دستگیره به پایین بسته می‌شود */}
          <SlideFrame slide={slide} full={size === "full"}>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            style={{ maxHeight }}
            drag={asDialog || asDrawer || reduceMotion ? false : "y"}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            // برگشت بعد از کشیدن کوتاه: فنر سفت و بدون لرزش
            dragTransition={{ bounceStiffness: 600, bounceDamping: 46 }}
            onDragEnd={onDragEnd}
            variants={asDrawer ? drawerVariants(rtl) : asDialog ? dialogVariants : undefined}
            initial={asDialog || asDrawer ? "hidden" : slide ? undefined : { opacity: 0 }}
            animate={asDialog || asDrawer ? "visible" : slide ? undefined : { opacity: 1 }}
            exit={asDialog || asDrawer ? "exit" : slide ? undefined : { opacity: 0 }}
            className={cn(
              slide ? "relative" : "absolute",
              "flex flex-col overflow-hidden border border-black/10 bg-card text-card-foreground shadow-[0_16px_50px_-8px_rgba(0,0,0,0.28)] outline-none",
              asDrawer
                ? cn(
                    "inset-y-3 end-3 rounded-3xl",
                    size === "auto" ? "w-[min(28rem,calc(100vw-1.5rem))]" : "w-[min(34rem,calc(100vw-1.5rem))]"
                  )
                : cn(
                    "inset-x-0 bottom-0 w-full border-b-0",
                    size === "full" ? "h-full rounded-none" : "rounded-t-3xl"
                  ),
              asDialog &&
                "md:relative md:inset-auto md:h-auto md:max-w-lg md:rounded-3xl md:border-b md:shadow-2xl",
              className
            )}
          >
            {/* دستگیره + هدر — دستگیره واقعاً قابل کشیدن است (MO-04) */}
            {!hideHeader && (
              <div
                // کل سربرگ (نه فقط دستگیرهٔ باریک) شیت را می‌کشد؛ دکمه‌ها لمس عادی خودشان را دارند
                onPointerDown={(e) => {
                  if (asDialog || asDrawer || reduceMotion) return
                  if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return
                  dragControls.start(e)
                }}
                className={cn("relative shrink-0 bg-card px-5 pb-2 pt-1.5", (asDialog || asDrawer) ? "pt-5" : "touch-none")}
              >
                {/* نسخهٔ ۷: دستگیرهٔ دیدنی، عنوان بزرگ‌تر، دکمهٔ بستن گرد و کم‌رنگ، بدون خط زیر سربرگ */}
                <span
                  aria-hidden
                  className={cn(
                    "mx-auto mb-1.5 grid h-5 w-16 cursor-grab touch-none place-items-center active:cursor-grabbing",
                    (asDialog || asDrawer) && "hidden"
                  )}
                >
                  <span className="block h-[5px] w-10 rounded-full bg-foreground/15" />
                </span>
                <div className="flex min-h-9 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="truncate text-lg font-extrabold leading-snug">
                      {title}
                    </h2>
                    {description && (
                      <p className="mt-0.5 truncate text-label text-muted-foreground">{description}</p>
                    )}
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => onCloseRef.current()}
                    aria-label="بستن"
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            )}
            {hideHeader && open && (
              <span
                aria-hidden
                onPointerDown={(e) => {
                  if (!asDialog && !asDrawer && !reduceMotion) dragControls.start(e)
                }}
                className="absolute left-1/2 top-1.5 z-10 h-[1.4rem] w-16 -translate-x-1/2 cursor-grab touch-none rounded-full hover:bg-foreground/10"
              />
            )}

            {/* محتوا — اسکرول عمودی فعال تا محتوای بلند (مثل انتخاب بانک) قابل مرور باشد */}
            <div
              style={{ WebkitOverflowScrolling: "touch" }}
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5",
                hideHeader ? "pt-4" : "pt-2",
                // نکته: py-4 استفاده نشده چون در کسکید CSS روی [padding-bottom:] غلبه می‌کند
                // و فضای امن پایین (مینی‌اپ تلگرام) عملاً بی‌اثر می‌شد.
                // نکته ۲: داخل کلاس arbitrary نباید فاصله باشد وگرنه به چند کلاس جدا تجزیه می‌شود.
                footer
                  ? "pb-4"
                  : "[padding-bottom:max(1.25rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)))]",
                contentClassName
              )}
            >
              {children}
            </div>

            {/* فوتر */}
            {footer && (
              <div className="shrink-0 border-t border-border/70 bg-card px-5 pt-3 [padding-bottom:max(1.5rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)+1rem))]">
                {footer}
              </div>
            )}
          </motion.div>
          </SlideFrame>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** آیتم انتخابی بزرگ داخل باتم‌شیت — برای انتخاب‌های چندگزینه‌ای */
export function SheetOption({
  icon,
  title,
  subtitle,
  badge,
  selected,
  onClick,
  tone = "default",
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  badge?: ReactNode
  selected?: boolean
  onClick: () => void
  tone?: "default" | "danger" | "primary"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-all duration-150 active:scale-[0.99]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border/80 bg-card hover:bg-accent/50",
        tone === "danger" && !selected && "hover:bg-destructive/5",
        tone === "primary" && !selected && "border-primary/30 bg-primary/5"
      )}
    >
      {icon ? (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : tone === "primary"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-foreground"
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {badge}
    </button>
  )
}

export { Fragment }
