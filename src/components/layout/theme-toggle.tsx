"use client"

/**
 * تغییر پوسته روشن / تیره — قرص دوحالته با نشانگر لغزان
 * (حالت «سیستم» هم پشتیبانی می‌شود؛ با یک لمس بین روشن و تیره جابه‌جا می‌شود)
 */
import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"
import { IconMoon, IconSun } from "@/components/icons/app-icons"
import { cn } from "@/lib/utils"

const subscribe = () => () => {}

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const dark = mounted && resolvedTheme === "dark"

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label={dark ? "پوستهٔ روشن" : "پوستهٔ تیره"}
        className={cn(
          "group grid size-10 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95",
          className
        )}
      >
        {dark ? <IconSun active className="size-[1.2rem]" /> : <IconMoon className="size-[1.2rem]" />}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="پوسته"
      className={cn("relative grid grid-cols-2 rounded-2xl bg-muted p-1 text-xs font-bold", className)}
    >
      {(["light", "dark"] as const).map((t) => {
        const on = mounted && (t === "dark" ? dark : !dark)
        const Icon = t === "dark" ? IconMoon : IconSun
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(t)}
            className={cn(
              "group relative z-10 flex items-center justify-center gap-1.5 rounded-xl py-2 transition-colors",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {on && (
              <motion.span
                layoutId="theme-pill"
                className="absolute inset-0 -z-10 rounded-xl bg-card shadow-card"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            <Icon active={on} className="size-4" />
            {t === "dark" ? "تیره" : "روشن"}
          </button>
        )
      })}
    </div>
  )
}
