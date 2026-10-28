"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { EntityIcon } from "./money-display"
import { COLOR_PALETTE, ICON_MAP, PICKER_ICONS } from "@/lib/icon-map"
import { cn } from "@/lib/utils"

/** انتخابگر آیکون + رنگ برای حساب/دسته */
export function IconColorPicker({
  icon,
  color,
  onChange,
}: {
  icon: string
  color: string
  onChange: (icon: string, color: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="icon-lg" className="rounded-xl" aria-label="انتخاب آیکون" />
          }
        >
            <span
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, color }}
            >
              {(() => {
                const I = ICON_MAP[icon] ?? ICON_MAP.CircleDollarSign
                return <I className="size-4" />
              })()}
            </span>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="grid grid-cols-8 gap-1.5">
            {PICKER_ICONS.map((name) => {
              const I = ICON_MAP[name]
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name, color)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
                    icon === name && "bg-primary/10 text-primary"
                  )}
                >
                  <I className="size-4" />
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`رنگ ${c}`}
            onClick={() => onChange(icon, c)}
            className={cn(
              "size-7 rounded-full border-2 transition-transform duration-150 hover:scale-110 active:scale-95",
              color === c ? "border-foreground/60 scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  )
}

export { EntityIcon }
