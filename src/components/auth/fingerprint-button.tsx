"use client"

/**
 * دکمهٔ بزرگ اثر انگشت صفحهٔ ورود (مشترک با حساب‌یار)
 *  idle      خطوط اثر انگشت یک بار کشیده می‌شوند، حلقهٔ ثابت دور دیسک
 *  scanning  خطوط نفس می‌کشند، خط اسکن بالا و پایین می‌رود و دو هالهٔ ملایم بیرون می‌زنند
 *  success   خطوط به ترتیب جمع می‌شوند، حلقهٔ پیشرفت دور دیسک کامل می‌شود، دیسک سبز پر می‌شود و
 *            تیک بزرگ وسطش کشیده می‌شود؛ یک موج بیرون می‌رود (حدود ۰٫۹ ثانیه، بعد صفحه عوض می‌شود)
 *  error     لرزش کوتاه و رنگ قرمز
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

export type ScanState = "idle" | "scanning" | "success" | "error"

/** مدت انیمیشن موفقیت تا رفتن به صفحهٔ بعد */
export const SUCCESS_MS = 950

const FP_PATHS = [
  "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
  "M14 13.12c0 2.38 0 6.38-1 8.88",
  "M17.29 21.02c.12-.6.43-2.3.5-3.02",
  "M2 12a10 10 0 0 1 18-6",
  "M2 16h.01",
  "M21.8 16c.2-2 .131-5.354 0-6",
  "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
  "M8.65 22c.21-.66.45-1.32.57-2",
  "M9 6.8a6 6 0 0 1 9 5.2v2",
]

const EASE = [0.32, 0.72, 0, 1] as const

export function FingerprintButton({ state, onPress, label = "ورود با اثر انگشت یا چهره" }: { state: ScanState; onPress: () => void; label?: string }) {
  const reduce = useReducedMotion()
  const success = state === "success"
  const color = state === "error" ? "var(--destructive)" : success ? "var(--income)" : "var(--primary)"
  const R = 60 // شعاع حلقهٔ پیشرفت (viewBox 128)
  const C = 2 * Math.PI * R

  return (
    <motion.button
      type="button"
      onClick={onPress}
      disabled={success}
      aria-label={label}
      whileTap={success ? undefined : { scale: 0.93 }}
      animate={state === "error" && !reduce ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
      style={{ ["--fp" as string]: color }}
      className="relative grid size-32 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
    >
      {/* حلقهٔ ثابت + حلقهٔ پیشرفت موفقیت */}
      <svg viewBox="0 0 128 128" className="pointer-events-none absolute -inset-3 size-[calc(100%+1.5rem)] -rotate-90 overflow-visible" aria-hidden>
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="1" style={{ stroke: "color-mix(in srgb, var(--fp) 16%, transparent)", transition: "stroke .4s" }} />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="var(--income)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: success ? 0 : C, opacity: success ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: success ? 0.55 : 0.2, ease: EASE }}
        />
      </svg>

      {/* هاله‌های اسکن */}
      {!reduce &&
        state === "scanning" &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: "color-mix(in srgb, var(--fp) 35%, transparent)" }}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.55, ease: "easeOut" }}
          />
        ))}

      {/* موج موفقیت */}
      <AnimatePresence>
        {success && !reduce && (
          <motion.span
            key="wave"
            className="absolute inset-0 rounded-full bg-income"
            initial={{ scale: 0.9, opacity: 0.35 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* دیسک */}
      <motion.span
        className="absolute inset-2 rounded-full"
        initial={false}
        animate={success && !reduce ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
        style={{
          background: "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--fp) 22%, var(--card)), color-mix(in srgb, var(--fp) 8%, var(--card)) 70%)",
          boxShadow: "0 18px 40px -12px color-mix(in srgb, var(--fp) 55%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.5), inset 0 0 0 1px color-mix(in srgb, var(--fp) 25%, transparent)",
          transition: "background .45s, box-shadow .45s",
        }}
      />
      {/* پرشدن سبز دیسک */}
      <motion.span
        className="absolute inset-2 rounded-full bg-income"
        initial={false}
        animate={{ opacity: success ? 1 : 0, scale: success ? 1 : 0.4 }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, delay: success ? 0.3 : 0, ease: EASE }}
        style={{ boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35)" }}
      />

      {/* اثر انگشت */}
      <motion.svg
        viewBox="0 0 24 24"
        className="relative size-16 overflow-visible"
        fill="none"
        stroke="var(--fp)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        initial={false}
        animate={{ opacity: success ? 0 : 1, scale: success ? 0.7 : 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.3, delay: success ? 0.25 : 0, ease: EASE }}
      >
        <g opacity={0.22}>
          {FP_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {FP_PATHS.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            initial={reduce ? false : { pathLength: 0 }}
            animate={state === "scanning" && !reduce ? { pathLength: [0.15, 1, 0.15] } : success ? { pathLength: 0 } : { pathLength: 1 }}
            transition={
              state === "scanning"
                ? { duration: 1.4, repeat: Infinity, delay: i * 0.06, ease: "easeInOut" }
                : success
                  ? { duration: 0.3, delay: (FP_PATHS.length - i) * 0.02, ease: EASE }
                  : { duration: 0.9, delay: 0.25 + i * 0.07, ease: [0.65, 0, 0.35, 1] }
            }
          />
        ))}
        {state === "scanning" && !reduce && (
          <motion.line
            x1={1}
            x2={23}
            stroke="var(--fp)"
            strokeWidth={1.2}
            opacity={0.9}
            initial={{ y1: 2, y2: 2 }}
            animate={{ y1: [2, 22, 2], y2: [2, 22, 2] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.svg>

      {/* تیک بزرگ وسط دیسک */}
      <AnimatePresence>
        {success && (
          <motion.svg key="check" viewBox="0 0 24 24" className="absolute size-14 text-white" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.38, delay: 0.5, ease: EASE }} />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
