/**
 * آواتار رنگی ثابت برای هر شخص — lib/avatar.ts (UI-07)
 * رنگ بر اساس هش نام — هر شخص همیشه همان رنگ را می‌گیرد.
 */

const PALETTE = [
  { bg: "#0e7c66", fg: "#ffffff" }, // سبز سازمانی
  { bg: "#0f766e", fg: "#ffffff" },
  { bg: "#b45309", fg: "#ffffff" },
  { bg: "#be185d", fg: "#ffffff" },
  { bg: "#7c3aed", fg: "#ffffff" },
  { bg: "#c2410c", fg: "#ffffff" },
  { bg: "#15803d", fg: "#ffffff" },
  { bg: "#a21caf", fg: "#ffffff" },
  { bg: "#334155", fg: "#ffffff" },
  { bg: "#4d7c0f", fg: "#ffffff" },
  { bg: "#b91c1c", fg: "#ffffff" },
  { bg: "#0e7490", fg: "#ffffff" },
]

/** هش ساده و پایدار از رشته */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function avatarColor(name: string): { bg: string; fg: string } {
  return PALETTE[hashString(name) % PALETTE.length]
}

/** حروف اول نام برای نمایش داخل آواتار (حداکثر ۲ حرف) */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return "؟"
  if (parts.length === 1) return parts[0].slice(0, 1)
  return parts[0].slice(0, 1) + parts[1].slice(0, 1)
}
