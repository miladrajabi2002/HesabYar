"use client"

/**
 * آواتار شخص — آیکون نقش (نسخهٔ ۸: بدون حرف اول نام)
 *  CUSTOMER (مشتری)  → آبی، نشان آدمک (سر و شانه)
 *  SUPPLIER (فروشنده) → بنفش، نشان مغازه (سایبان + ویترین)
 *  BOTH (هر دو)       → کاشی دورنگ مورب (آبی/بنفش) + نشان فلش دوطرفه
 */
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

const ROLE_TONE: Record<string, string> = {
  CUSTOMER: "var(--role-customer)",
  SUPPLIER: "var(--role-supplier)",
}

function RoleGlyph({ role, size }: { role?: string | null; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }
  if (role === "SUPPLIER")
    return (
      <svg {...common}>
        <path d="M4 9.5 5.5 4h13L20 9.5" />
        <path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0" />
        <path d="M5.5 12v8h13v-8" />
        <path d="M10 20v-4.5h4V20" />
      </svg>
    )
  if (role === "BOTH")
    return (
      <svg {...common}>
        <path d="M4 9h15l-3.5-3.5M20 15H5l3.5 3.5" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  )
}

/**
 * آواتار نقش (نسخهٔ ۸) — بدون حرف اول نام: آیکون نقش روی کاشی رنگی همان نقش
 * (آدمک = مشتری، مغازه = فروشنده، فلش دوطرفه = هر دو). «name» فقط برای سازگاری می‌ماند.
 */
export function RoleAvatar({
  role,
  size = 40,
  className,
}: {
  role?: string | null
  name?: string | null
  size?: number
  className?: string
}) {
  const both = role === "BOTH"
  const tone = ROLE_TONE[role ?? ""] ?? "var(--muted-foreground)"
  return (
    <span
      aria-label={ROLE_LABELS[role ?? ""] ?? "شخص"}
      role="img"
      className={cn("relative inline-grid shrink-0 select-none place-items-center rounded-[32%]", className)}
      style={{
        width: size,
        height: size,
        background: both
          ? "linear-gradient(135deg, color-mix(in srgb, var(--role-customer) 13%, white) 0 50%, color-mix(in srgb, var(--role-supplier) 14%, white) 50% 100%)"
          : `color-mix(in srgb, ${tone} 12%, white)`,
        color: both ? "var(--foreground)" : tone,
      }}
    >
      <RoleGlyph role={role} size={Math.round(size * 0.5)} />
    </span>
  )
}

/** برچسب فارسی نقش */
export const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "مشتری",
  SUPPLIER: "فروشنده",
  BOTH: "مشتری و فروشنده",
}

/** برچسب رنگی نقش — برای «هر دو» دو نقطهٔ رنگی کنار هم */
export function RoleBadge({ role, className }: { role?: string | null; className?: string }) {
  if (!role) return null
  const both = role === "BOTH"
  const tone = ROLE_TONE[role] ?? "var(--muted-foreground)"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-bold",
        className
      )}
      style={{
        color: both ? "var(--foreground)" : tone,
        borderColor: `color-mix(in srgb, ${both ? "var(--role-supplier)" : tone} 22%, transparent)`,
        background: `color-mix(in srgb, ${both ? "var(--role-customer)" : tone} 7%, transparent)`,
      }}
    >
      {both ? (
        <span className="flex -space-x-0.5 space-x-reverse">
          <span className="size-1.5 rounded-full bg-[color:var(--role-customer)]" />
          <span className="size-1.5 rounded-full bg-[color:var(--role-supplier)]" />
        </span>
      ) : (
        <span className="size-1.5 rounded-full" style={{ background: tone }} />
      )}
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

/** نسیهٔ بازِ بیش از این تعداد روز معوق است — همان آستانهٔ بنر فاکتورها (lib/finance OVERDUE_DAYS) */
const OVERDUE_DAYS = 30

/** برچسب کوتاه قدمت مانده: «امروز» / «۱۲ روز» / «۲ ماه» */
export function formatOpenDays(days: number): string {
  if (days <= 0) return "امروز"
  if (days < 60) return `${toPersianDigits(days)} روز`
  return `${toPersianDigits(Math.floor(days / 30))} ماه`
}

/**
 * آواتار تراز (نسخهٔ ۸) — بدون حلقه و بدون حرف: یک نگاه = «این کیست و حسابش چطور است»
 *  • آیکون نقش (مشتری/فروشنده/هر دو) روی کاشی
 *  • رنگ کاشی = وضعیت حساب: کهربایی «به ما بدهکار است»، نیلی «ما بدهکاریم»، خاکستری «تسویه»
 *  • نشان گوشه: ساعت قرمز = بیش از ۳۰ روز بدون پرداخت (معوق)، تیک سبز = تسویه‌شده
 *  متن «بدهکار/طلبکار» و قدمت همیشه کنار مبلغ نوشته می‌شود (BalanceTag) — رنگ تنها نیست.
 */
export function BalanceAvatar({
  role,
  balance,
  openDays,
  size = 48,
  className,
}: {
  role?: string | null
  balance: number
  /** روزهای باز ماندن مانده (null = نامعلوم) */
  openDays?: number | null
  size?: number
  className?: string
}) {
  const settled = balance === 0
  const overdue = !settled && openDays != null && openDays > OVERDUE_DAYS
  const tone = settled ? "var(--muted-foreground)" : balance > 0 ? "var(--warning-ink)" : "var(--role-supplier)"
  const badge = Math.max(16, Math.round(size * 0.4))
  const label = settled
    ? "تسویه‌شده"
    : `${balance > 0 ? "به ما بدهکار است" : "ما بدهکاریم"}${openDays != null ? ` — ${formatOpenDays(openDays)}${overdue ? "، معوق" : ""}` : ""}`
  return (
    <span
      role="img"
      aria-label={`${ROLE_LABELS[role ?? ""] ?? "شخص"} — ${label}`}
      className={cn("relative inline-grid shrink-0 select-none place-items-center rounded-[32%]", className)}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${tone} ${settled ? 9 : 13}%, white)`,
        color: tone,
      }}
    >
      <RoleGlyph role={role} size={Math.round(size * 0.48)} />
      {(overdue || settled) && (
        <span
          aria-hidden
          className="absolute -bottom-1 -left-1 grid place-items-center rounded-full text-white ring-2 ring-card"
          style={{ width: badge, height: badge, background: overdue ? "var(--destructive)" : "var(--income)" }}
        >
          <svg
            width={Math.round(badge * 0.62)}
            height={Math.round(badge * 0.62)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {overdue ? (
              <>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4.5l3 1.5" />
              </>
            ) : (
              <path d="m6 12.5 4 4 8-9" />
            )}
          </svg>
        </span>
      )}
    </span>
  )
}

/** برچسب متنی وضعیت حساب کنار مبلغ: «بدهکار» / «طلبکار» / «تسویه» */
export function BalanceTag({ balance, className }: { balance: number; className?: string }) {
  const tone = balance > 0 ? "warning" : balance < 0 ? "purchase" : "neutral"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption font-bold leading-4",
        tone === "warning" && "bg-warning/12 text-warning-ink",
        tone === "purchase" && "bg-purchase/10 text-purchase",
        tone === "neutral" && "bg-muted text-muted-foreground",
        className
      )}
    >
      {balance > 0 ? "بدهکار" : balance < 0 ? "طلبکار" : "تسویه"}
    </span>
  )
}
