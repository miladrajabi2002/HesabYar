"use client"

/**
 * آواتار رنگی ثابت شخص (UI-07) — هر شخص بر اساس نامش همیشه همان رنگ را می‌گیرد.
 */
import { avatarColor, avatarInitials } from "@/lib/avatar"
import { cn } from "@/lib/utils"

export function PersonAvatar({
  name,
  size = 40,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const { bg, fg } = avatarColor(name)
  const initials = avatarInitials(name)
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 select-none items-center justify-center rounded-2xl font-bold", className)}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(11, Math.round(size * 0.36)),
      }}
    >
      {initials}
    </span>
  )
}
