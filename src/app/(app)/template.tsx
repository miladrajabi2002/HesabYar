"use client"

/**
 * انتقال صفحات (MO-07) — هر ناوبری، محتوای صفحه با یک حرکت نرم
 * fade + slide ظاهر می‌شود. template.tsx در هر تغییر مسیر دوباره mount
 * می‌شود؛ پس این انیمیشن دقیقاً روی «رفتن به صفحه بعد» اجرا می‌شود.
 */
import { motion, useReducedMotion } from "framer-motion"

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className="contents">{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="contents"
      style={{ display: "flow-root" }}
    >
      {children}
    </motion.div>
  )
}
