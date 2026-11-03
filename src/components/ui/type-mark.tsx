"use client"

/**
 * نشان نوع فاکتور (نسخهٔ ۵) — جایگزین آیکون‌های قدیمی سبد/رسید
 *  • فروش: کاشی زمردی + برگهٔ فاکتور با فلش «بیرون» (کالا رفت، پول آمد)
 *  • خرید: کاشی نیلی + جعبهٔ کالا با فلش «داخل» (کالا آمد، پول رفت)
 *  یک کاشی نرم با گرادیان ملایم و لبهٔ روشن؛ هاور: آیکون کمی بالا می‌پرد.
 * رنگ‌ها: --sale / --purchase (globals.css)
 */
import { cn } from "@/lib/utils"

export function InvoiceTypeMark({
  type,
  size = 44,
  className,
}: {
  type: string
  size?: number
  className?: string
}) {
  const sale = type === "SALE"
  const icon = Math.round(size * 0.5)
  return (
    <span
      aria-label={sale ? "فروش" : "خرید"}
      style={{ width: size, height: size, ["--tile" as string]: sale ? "var(--sale)" : "var(--purchase)" }}
      className={cn("type-mark relative grid shrink-0 place-items-center rounded-[32%]", className)}
    >
      <svg
        viewBox="0 0 24 24"
        width={icon}
        height={icon}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="type-mark-glyph"
        aria-hidden
      >
        {sale ? (
          <>
            {/* برگهٔ فاکتور */}
            <path d="M6 3.5h8.5L18 7v13.5H6z" fill="currentColor" fillOpacity={0.16} />
            <path d="M14.5 3.5V7H18" />
            <path d="M8.8 11h4.4M8.8 14.5h3" />
            {/* فلش بیرون */}
            <path d="M15.2 17.8l4.6-4.6M16.2 13.2h3.6v3.6" strokeWidth={2.2} />
          </>
        ) : (
          <>
            {/* جعبهٔ کالا */}
            <path d="M3.8 8.2L11 4.5l7.2 3.7v8.3L11 20.2l-7.2-3.7z" fill="currentColor" fillOpacity={0.16} />
            <path d="M3.8 8.2L11 12l7.2-3.8M11 12v8.2" />
            {/* فلش داخل */}
            <path d="M21 13.3l-4.3 4.3M16.7 14.2v3.4h3.4" strokeWidth={2.2} />
          </>
        )}
      </svg>
    </span>
  )
}

/** برچسب کوچک نوع فاکتور */
export function InvoiceTypePill({ type, className }: { type: string; className?: string }) {
  const sale = type === "SALE"
  return (
    <span
      style={{ ["--tile" as string]: sale ? "var(--sale)" : "var(--purchase)" }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--tile)_11%,transparent)] px-2 py-0.5 text-micro font-bold text-[color:var(--tile)]",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-[color:var(--tile)]" />
      {sale ? "فروش" : "خرید"}
    </span>
  )
}
