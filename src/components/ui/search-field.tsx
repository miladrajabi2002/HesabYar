"use client"

/**
 * فیلد جستجوی صفحه‌ها (فاکتورها، اشخاص، کالاها، انتخاب‌گرها) — یک شکل در همه‌جا
 *  • دکمهٔ پاک‌کردن، نشانگر در حال جستجو، Esc: اول پاک می‌کند بعد فوکوس را برمی‌دارد
 *  • کیبورد موبایل دکمهٔ «جستجو» دارد و با Enter بسته می‌شود
 *  • hotkey: در دسکتاپ کلید «/» از هر جای صفحه فیلد را فوکوس می‌کند
 */
import { useEffect, useRef } from "react"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconSearch } from "@/components/icons/app-icons"

export function SearchField({
  value,
  onChange,
  placeholder,
  loading = false,
  hotkey = false,
  autoFocus,
  variant = "outline",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  loading?: boolean
  hotkey?: boolean
  autoFocus?: boolean
  /** outline: روی پس‌زمینهٔ صفحه | filled: داخل کارت و شیت */
  variant?: "outline" | "filled"
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!hotkey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" && e.code !== "Slash") return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hotkey])

  return (
    <div
      className={cn(
        "group/search relative flex h-12 items-center gap-2.5 rounded-2xl border ps-3.5 pe-2 transition-[border-color,box-shadow,background-color]",
        "focus-within:border-ring focus-within:bg-card focus-within:ring-[3px] focus-within:ring-ring/15",
        variant === "filled" ? "border-transparent bg-muted" : "border-input bg-card hover:border-foreground/20",
        className
      )}
    >
      <IconSearch className="size-[1.05rem] shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (value) {
              e.preventDefault()
              e.stopPropagation()
              onChange("")
            } else {
              ref.current?.blur()
            }
          } else if (e.key === "Enter") {
            // موبایل: زدن «جستجو» کیبورد را می‌بندد تا نتیجه دیده شود
            if (window.matchMedia("(pointer: coarse)").matches) ref.current?.blur()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder ?? "جستجو"}
        className="peer h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/75 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {loading && <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("")
            ref.current?.focus()
          }}
          aria-label="پاک کردن جستجو"
          className="grid size-8 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <span className="grid size-5 place-items-center rounded-full bg-foreground/12">
            <X className="size-3" strokeWidth={2.8} />
          </span>
        </button>
      ) : hotkey ? (
        <kbd
          aria-hidden
          className="me-1 hidden h-6 min-w-6 place-items-center rounded-md border border-border bg-muted/70 px-1.5 font-sans text-caption font-bold text-muted-foreground lg:grid lg:peer-focus:hidden"
        >
          /
        </kbd>
      ) : null}
    </div>
  )
}
