"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { haptic } from "@/hooks/use-haptics"
import { cn } from "@/lib/utils"

/**
 * سوییچ — حس سوییچ iOS:
 *  • دستگیره با ease-out تند (نه ease پیش‌فرض) لیز می‌خورد؛ فقط transform، روی compositor
 *  • هنگام فشردن دستگیره کمی به سمت مقصد کش می‌آید (scale-x از لبهٔ فعلی) تا «گرفتن» حس شود
 *  • هر تغییر یک تیک لمسی کوتاه دارد
 */
function Switch({
  className,
  size = "default",
  onCheckedChange,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      onCheckedChange={(...args: Parameters<NonNullable<SwitchPrimitive.Root.Props["onCheckedChange"]>>) => {
        haptic.tap()
        onCheckedChange?.(...args)
      }}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,border-color,box-shadow] duration-200 ease-out outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background shadow-[0_1px_2px_rgb(16_24_40/0.18)] ring-0",
          "transition-[translate,scale,background-color] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          "data-unchecked:translate-x-0 data-checked:translate-x-[calc(100%-2px)] rtl:data-checked:-translate-x-[calc(100%-2px)]",
          // کش آمدن هنگام فشردن، از لبه‌ای که دستگیره الان آنجاست به سمت مقصد
          "group-active/switch:scale-x-[1.18] group-data-disabled/switch:scale-x-100",
          "data-unchecked:origin-left data-checked:origin-right rtl:data-unchecked:origin-right rtl:data-checked:origin-left",
          "dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
