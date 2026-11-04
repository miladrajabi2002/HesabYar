"use client"

/**
 * انتخاب‌گر یکدست (الگوی app) — جایگزین انتخاب‌گرهای اختصاصی در اپ
 *  • دسکتاپ (موس): فهرست شناور زیر فیلد با Base UI — کلید ↑↓، Enter، Esc و تایپ برای پرش
 *  • موبایل (لمس): باتم‌شیت با ردیف‌های بزرگ، تیک گزینهٔ فعلی و جستجو وقتی گزینه‌ها زیادند
 *  اندازه‌ها: «md» هم‌قد فیلدهای فرم · «sm» جمع‌وجور برای ردیف تنظیمات
 */
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { BottomSheet } from "./bottom-sheet"
import { SearchField } from "./search-field"
import { haptic } from "@/hooks/use-haptics"
import { cn } from "@/lib/utils"

export type SelectOption<V extends string = string> = {
  value: V
  label: string
  /** توضیح کوتاه زیر عنوان گزینه */
  hint?: string
  icon?: ReactNode
  disabled?: boolean
}

const POINTER_QUERY = "(hover: hover) and (pointer: fine)"
function subscribePointer(cb: () => void) {
  const media = window.matchMedia(POINTER_QUERY)
  media.addEventListener("change", cb)
  return () => media.removeEventListener("change", cb)
}
const getPointer = () => window.matchMedia(POINTER_QUERY).matches

/** از این تعداد بیشتر، شیت موبایل فیلد جستجو می‌گیرد */
const SEARCH_FROM = 8

const triggerSize = {
  md: "field flex items-center gap-2 text-start",
  sm: "flex h-9 max-w-48 items-center gap-1.5 rounded-xl bg-muted px-3 text-label font-bold outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  placeholder = "انتخاب کنید",
  title,
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: V
  onChange: (value: V) => void
  options: SelectOption<V>[]
  placeholder?: string
  /** عنوان باتم‌شیت موبایل و برچسب دسترسی‌پذیری */
  title?: string
  size?: "md" | "sm"
  disabled?: boolean
  className?: string
  "aria-label"?: string
}) {
  const desktop = useSyncExternalStore(subscribePointer, getPointer, () => false)
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  const label = ariaLabel ?? title

  const face = (
    <>
      {selected?.icon && <span className="flex shrink-0 items-center">{selected.icon}</span>}
      <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground/70")}>
        {selected?.label ?? placeholder}
      </span>
      <ChevronDown
        aria-hidden
        className={cn(
          "shrink-0 text-muted-foreground transition-transform duration-200",
          size === "sm" ? "size-3.5" : "size-4",
          open && "rotate-180"
        )}
        strokeWidth={2.4}
      />
    </>
  )

  if (desktop) {
    return (
      <SelectPrimitive.Root
        value={value}
        onValueChange={(v) => v !== null && onChange(v as V)}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        items={options.map((o) => ({ value: o.value, label: o.label }))}
      >
        <SelectPrimitive.Trigger
          aria-label={label}
          className={cn(triggerSize[size], "cursor-pointer data-popup-open:border-ring", className)}
        >
          {face}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner
            sideOffset={6}
            align="start"
            alignItemWithTrigger={false}
            collisionPadding={12}
            className="z-[120] outline-none"
          >
            <SelectPrimitive.Popup
              dir="rtl"
              data-slot="select-popup"
              className={cn(
                "max-h-[min(22rem,var(--available-height))] min-w-(--anchor-width) max-w-[min(22rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-[0_12px_36px_-10px_rgba(0,0,0,0.28)] outline-none",
                "transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0"
              )}
            >
              <SelectPrimitive.List>
                {options.map((o) => (
                  <SelectPrimitive.Item
                    key={o.value}
                    value={o.value}
                    disabled={o.disabled}
                    className="flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm outline-none transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-45 data-highlighted:bg-accent data-selected:font-bold"
                  >
                    {o.icon && <span className="flex shrink-0 items-center">{o.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <SelectPrimitive.ItemText className="block truncate">{o.label}</SelectPrimitive.ItemText>
                      {o.hint && <span className="block truncate text-xs font-normal text-muted-foreground">{o.hint}</span>}
                    </span>
                    <SelectPrimitive.ItemIndicator className="shrink-0 text-primary">
                      <Check className="size-4" strokeWidth={2.6} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          haptic.tap()
          setOpen(true)
        }}
        className={cn(triggerSize[size], "active:scale-[0.99]", className)}
      >
        {face}
      </button>
      <SelectSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title ?? ariaLabel ?? placeholder}
        options={options}
        value={value}
        onPick={(v) => {
          haptic.tap()
          setOpen(false)
          if (v !== value) onChange(v)
        }}
      />
    </>
  )
}

function SelectSheet<V extends string>({
  open,
  onClose,
  title,
  options,
  value,
  onPick,
}: {
  open: boolean
  onClose: () => void
  title: string
  options: SelectOption<V>[]
  value: V
  onPick: (value: V) => void
}) {
  const [query, setQuery] = useState("")
  const searchable = options.length > SEARCH_FROM
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q))
  }, [options, query])

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setQuery("")
        onClose()
      }}
      title={title}
      size={searchable ? "tall" : "auto"}
      desktopMode="dialog"
    >
      {searchable && (
        <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="جستجو…" variant="filled" />
        </div>
      )}
      <div role="listbox" aria-label={title} className="space-y-0.5 pb-1">
        {shown.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={on}
              disabled={o.disabled}
              onClick={() => {
                setQuery("")
                onPick(o.value)
              }}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors active:bg-accent disabled:opacity-45",
                on ? "bg-primary/10 font-bold" : "hover:bg-accent/60"
              )}
            >
              {o.icon && <span className="flex shrink-0 items-center">{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base">{o.label}</span>
                {o.hint && <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{o.hint}</span>}
              </span>
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full transition-colors",
                  on ? "bg-primary text-primary-foreground" : "border border-border"
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
        {shown.length === 0 && <p className="py-8 text-center text-label text-muted-foreground">موردی پیدا نشد</p>}
      </div>
    </BottomSheet>
  )
}
