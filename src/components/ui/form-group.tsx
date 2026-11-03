"use client"

/**
 * قطعات «فهرست گروهی» فرم‌ها (نسخهٔ ۷) — مشترک بین فرم شخص و فرم کالا:
 * عنوان گروه، فیلد درون‌گروهی (برچسب کوچک بالا، ورودی بدون قاب) و ردیف «افزودن ›».
 */
import type { ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export function GroupTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h3 className="text-label font-extrabold text-foreground/85">{title}</h3>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** قاب گروه: ردیف‌ها با خط جداکننده */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card", className)}>
      {children}
    </div>
  )
}

/** فیلد درون‌گروهی: برچسب کوچک بالا، ورودی بدون قاب زیرش */
export function InlineField({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="block px-3.5 pb-1.5 pt-2.5 transition-colors focus-within:bg-primary/[0.04]">
      <span className="flex items-center gap-1.5 text-caption font-bold text-foreground/70">
        {label}
        {optional && <span className="font-medium text-muted-foreground">اختیاری</span>}
      </span>
      {children}
    </label>
  )
}

export const bareInput =
  "h-9 w-full bg-transparent text-body font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"

export function AddRow({ label, onClick, value }: { label: string; onClick: () => void; value?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[3.25rem] w-full items-center gap-3 px-3.5 text-start transition-colors hover:bg-accent/40"
    >
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-label text-muted-foreground">{value ?? "افزودن"}</span>
      <ChevronLeft className="size-4 text-muted-foreground/60" />
    </button>
  )
}
