"use client"

/**
 * باتم‌شیت موبایل — ایده از پروژه vignet
 * موبایل: از پایین با انیمیشن فنری بالا می‌آید + دستگیره درگ
 * دسکتاپ: به دیالگ وسط صفحه تبدیل می‌شود
 */
import { Fragment, ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

const sheetVariants = {
  hidden: { y: "100%" },
  visible: {
    y: 0,
    transition: { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.85 },
  },
  exit: { y: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const } },
}

const dialogVariants = {
  hidden: { opacity: 0, scale: 0.97, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, scale: 0.985, y: 6, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "auto",
  desktopMode = "dialog",
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
  /** desktop: «dialog» وسط صفحه | «sheet» همان باتم‌شیت | «hidden» فقط موبایل */
  desktopMode?: "dialog" | "sheet" | "hidden"
  hideHeader?: boolean
  className?: string
  contentClassName?: string
}) {
  const reactId = useId()
  const titleId = `${reactId}-sheet-title`
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const [isDesktop, setIsDesktop] = useState(false)
  const reduceMotion = useReducedMotion()

  // تشخیص سمت کلاینت بدون setState داخل افکت
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (desktopMode === "hidden") return
    const media = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(media.matches)
    const rafId = window.requestAnimationFrame(update)
    media.addEventListener("change", update)
    return () => {
      window.cancelAnimationFrame(rafId)
      media.removeEventListener("change", update)
    }
  }, [desktopMode])

  useEffect(() => {
    if (!open) return
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const raf = window.requestAnimationFrame(() => closeRef.current?.focus())

    function onKeyDown(event: KeyboardEvent) {
      const modals = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      )
      if (modals.at(-1) !== panelRef.current) return
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
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open])

  if (!mounted) return null

  const asDialog = isDesktop && desktopMode === "dialog"
  const hiddenDesktop = isDesktop && desktopMode === "hidden"
  if (hiddenDesktop) return null

  const maxHeight =
    size === "full" ? "100dvh" : size === "tall" ? "min(88dvh, 44rem)" : "min(82dvh, 38rem)"

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0 z-[100]",
            asDialog && "grid place-items-center p-6"
          )}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
        >
          {/* لایه پس‌زمینه */}
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="بستن"
            onClick={() => onCloseRef.current()}
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
          />

          {/* پنل */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            variants={asDialog ? dialogVariants : reduceMotion ? undefined : sheetVariants}
            initial={asDialog ? "hidden" : reduceMotion ? { opacity: 0 } : "hidden"}
            animate={asDialog ? "visible" : reduceMotion ? { opacity: 1 } : "visible"}
            exit={asDialog ? "exit" : reduceMotion ? { opacity: 0 } : "exit"}
            className={cn(
              "absolute inset-x-0 bottom-0 flex w-full flex-col overflow-hidden border border-b-0 border-black/10 bg-card text-card-foreground shadow-[0_16px_50px_-8px_rgba(0,0,0,0.28)] outline-none",
              size === "full" ? "h-full rounded-none" : "rounded-t-3xl",
              asDialog &&
                "md:relative md:inset-auto md:h-auto md:max-w-lg md:rounded-3xl md:border-b md:shadow-2xl",
              className
            )}
          >
            {/* دستگیره + هدر */}
            {!hideHeader && (
              <div className="relative shrink-0 border-b border-border/60 bg-card/95 px-4 pb-3 pt-2 backdrop-blur-xl">
                <span
                  aria-hidden
                  className="mx-auto mb-2 block h-1.5 w-11 rounded-full bg-foreground/15"
                />
                <div className="flex min-h-9 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="truncate text-[0.95rem] font-bold leading-tight">
                      {title}
                    </h2>
                    {description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
                    )}
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => onCloseRef.current()}
                    aria-label="بستن"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
            {hideHeader && open && (
              <span
                aria-hidden
                className="absolute left-1/2 top-1.5 z-10 h-1.5 w-11 -translate-x-1/2 rounded-full bg-foreground/15"
              />
            )}

            {/* محتوا */}
            <div
              className={cn(
                "min-h-0 flex-1 overscroll-contain px-4 py-4",
                !footer &&
                  "[padding-bottom:max(1rem,calc(env(safe-area-inset-bottom) + var(--tg-safe-bottom,0px)))]",
                contentClassName
              )}
            >
              {children}
            </div>

            {/* فوتر */}
            {footer && (
              <div className="shrink-0 border-t border-border/60 bg-card/95 px-4 pt-3 backdrop-blur-xl [padding-bottom:max(0.9rem,calc(env(safe-area-inset-bottom) + var(--tg-safe-bottom,0px)))]">
                {footer}
              </div>
            )}
          </motion.div>
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
          : "border-border bg-card hover:bg-accent/60",
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
