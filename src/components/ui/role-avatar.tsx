"use client"

/**
 * آواتار نقش‌محور شخص — به‌جای حروف اول نام، نقش شخص را با آیکون نشان می‌دهد:
 *  CUSTOMER (مشتری) → سبد خرید    SUPPLIER (فروشنده/تأمین‌کننده) → مغازه
 *  BOTH (هر دو) → هر دو آیکون کنار هم
 */
import { ShoppingBag, Store, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  CUSTOMER: { bg: "bg-primary/12", fg: "text-primary" },
  SUPPLIER: { bg: "bg-warning/15", fg: "text-warning" },
  BOTH: { bg: "bg-primary/10", fg: "text-primary" },
}

export function RoleAvatar({
  role,
  size = 40,
  className,
}: {
  role?: string | null
  size?: number
  className?: string
}) {
  const st = ROLE_STYLE[role ?? ""] ?? { bg: "bg-muted", fg: "text-muted-foreground" }
  const iconSize = Math.max(14, Math.round(size * 0.5))

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-2xl",
        st.bg,
        st.fg,
        className
      )}
      style={{ width: size, height: size }}
    >
      {role === "BOTH" ? (
        <span className="flex items-center gap-[0.12em]" style={{ fontSize: iconSize }}>
          <ShoppingBag style={{ width: iconSize, height: iconSize }} strokeWidth={2.1} />
          <Store style={{ width: iconSize, height: iconSize }} strokeWidth={2.1} className="text-warning" />
        </span>
      ) : role === "CUSTOMER" ? (
        <ShoppingBag style={{ width: iconSize, height: iconSize }} strokeWidth={2.1} />
      ) : role === "SUPPLIER" ? (
        <Store style={{ width: iconSize, height: iconSize }} strokeWidth={2.1} />
      ) : (
        <UserRound style={{ width: iconSize, height: iconSize }} strokeWidth={2.1} />
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
