"use client"

/**
 * جشن موفقیت (MO-02) — تیک متحرک بزرگ بعد از ثبت فاکتور/تسویه
 * + هپتیک تلگرام در مینی‌اپ.
 */
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { useTelegram } from "@/hooks/use-telegram"
import { useSyncExternalStore } from "react"

export function SuccessCelebration({
  show,
  title = "ثبت شد",
  subtitle,
}: {
  show: boolean
  title?: string
  subtitle?: string
}) {
  const { haptic } = useTelegram()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  useEffect(() => {
    if (show) haptic.success()
  }, [show, haptic])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[200] grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[3px]" />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="relative flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card px-10 py-8 shadow-2xl"
          >
            {/* حلقه‌های موج + تیک */}
            <div className="relative grid size-24 place-items-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-income/15"
                initial={{ scale: 0.6, opacity: 0.8 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
              />
              <motion.span
                className="absolute inset-0 rounded-full bg-income/20"
                initial={{ scale: 0.6, opacity: 0.7 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
              />
              <motion.svg
                viewBox="0 0 52 52"
                className="size-20 text-income"
                initial="hidden"
                animate="visible"
              >
                <motion.circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  variants={{
                    hidden: { pathLength: 0, opacity: 0 },
                    visible: {
                      pathLength: 1,
                      opacity: 1,
                      transition: { duration: 0.45, ease: "easeOut" },
                    },
                  }}
                />
                <motion.path
                  d="M15 27 L23 35 L38 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={{
                    hidden: { pathLength: 0 },
                    visible: {
                      pathLength: 1,
                      transition: { duration: 0.3, delay: 0.35, ease: "easeOut" },
                    },
                  }}
                />
              </motion.svg>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="text-center"
            >
              <p className="text-base font-extrabold">{title}</p>
              {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
