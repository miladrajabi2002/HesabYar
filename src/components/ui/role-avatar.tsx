"use client"

/**
 * آواتار شخص (نسخهٔ ۵) — حرف اول نام روی کاشی رنگی نقش + نشان کوچک نقش در گوشه
 *  CUSTOMER (مشتری)  → آبی، نشان کیسهٔ خرید
 *  SUPPLIER (فروشنده) → بنفش، نشان کامیون
 *  BOTH (هر دو)       → کاشی دورنگ مورب (آبی/بنفش) + نشان فلش دوطرفه
 * بدون نام، به‌جای حرف، آیکون نقش وسط کاشی می‌نشیند.
 */
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
  if (role === "CUSTOMER")
    return (
      <svg {...common}>
        <path d="M6 8h12l-1 12H7z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
    )
  if (role === "SUPPLIER")
    return (
      <svg {...common}>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.6" />
        <circle cx="17" cy="17.5" r="1.6" />
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

/** اولین حرف معنادار نام (بدون «آقای/خانم/شرکت») */
function initialOf(name?: string | null): string {
  if (!name) return ""
  const cleaned = name.trim().replace(/^(آقای|آقا|خانم|شرکت|فروشگاه|جناب)\s+/, "")
  return Array.from(cleaned)[0] ?? ""
}

export function RoleAvatar({
  role,
  name,
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
  const letter = initialOf(name)
  const badge = Math.max(14, Math.round(size * 0.42))

  const bg = both
    ? "linear-gradient(135deg, color-mix(in srgb, var(--role-customer) 16%, white) 0 50%, color-mix(in srgb, var(--role-supplier) 18%, white) 50% 100%)"
    : `linear-gradient(155deg, color-mix(in srgb, ${tone} 10%, white), color-mix(in srgb, ${tone} 22%, white))`

  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 select-none place-items-center rounded-[34%]", className)}
      style={{
        width: size,
        height: size,
        background: bg,
        color: both ? "var(--foreground)" : tone,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${both ? "var(--role-supplier)" : tone} 16%, transparent)`,
      }}
    >
      {letter ? (
        <span className="font-black leading-none" style={{ fontSize: Math.round(size * 0.42) }}>
          {letter}
        </span>
      ) : (
        <RoleGlyph role={role} size={Math.round(size * 0.48)} />
      )}
      {letter && role && (
        <span
          className="absolute -bottom-1 -left-1 grid place-items-center rounded-full text-white ring-2 ring-card"
          style={{
            width: badge,
            height: badge,
            background: both
              ? "linear-gradient(135deg, var(--role-customer) 0 50%, var(--role-supplier) 50% 100%)"
              : tone,
          }}
          title={ROLE_LABELS[role]}
        >
          <RoleGlyph role={role} size={Math.round(badge * 0.62)} />
        </span>
      )}
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
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
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
