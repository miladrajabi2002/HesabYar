"use client"

/**
 * چیدمان یکپارچهٔ تنظیمات (مشترک با حساب‌یار)
 *  • موبایل: گروه‌های ردیفی به سبک تنظیمات گوشی؛ هر ردیف مقدار فعلی را نشان می‌دهد و جزئیاتش در شیت باز می‌شود
 *  • دسکتاپ: فهرست بخش‌ها در ستون کنار و محتوای همان بخش در کارت‌ها، با کنترل‌ها مستقیم و بدون شیت
 * هر مورد یک بار تعریف می‌شود (عنوان، مقدار، محتوا و دکمهٔ پایین) و هر دو نما از همان ساخته می‌شوند.
 */
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react"
import { ChevronLeft } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

export interface SettingsItem {
  id: string
  icon?: ReactNode
  /** رنگ کاشی آیکون */
  tone?: string
  label: string
  /** مقدار فعلی کنار عنوان (مثلاً «۲ دستگاه»، «خاموش») */
  value?: ReactNode
  /** کنترل کنار عنوان (سوییچ) — روی موبایل کلیک روی متن شیت را باز می‌کند و سوییچ مستقل است */
  trailing?: ReactNode
  /** توضیح کوتاه زیر عنوان در کارت دسکتاپ و بالای شیت موبایل */
  description?: string
  /** جزئیات: در موبایل داخل شیت، در دسکتاپ داخل کارت */
  content?: ReactNode
  /** دکمه‌های پایین جزئیات */
  footer?: ReactNode
  /** بدون جزئیات: کاری که کلیک انجام می‌دهد */
  onClick?: () => void
  danger?: boolean
  /** کارت دسکتاپ تمام‌عرض باشد */
  wide?: boolean
  hidden?: boolean
}

export interface SettingsSection {
  id: string
  label: string
  icon?: ReactNode
  tone?: string
  description?: string
  danger?: boolean
  items: SettingsItem[]
}

const subscribeDesktop = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 1024px)")
  m.addEventListener("change", cb)
  return () => m.removeEventListener("change", cb)
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  )
}

function Tile({ icon, tone = "var(--primary)", size = "md" }: { icon: ReactNode; tone?: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center", size === "lg" ? "size-9 rounded-xl" : "size-[1.875rem] rounded-[9px]")}
      style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, white)` }}
    >
      {icon}
    </span>
  )
}

export function SettingsLayout({ sections, header, asideFooter, mobileFooter }: { sections: SettingsSection[]; header?: ReactNode; asideFooter?: ReactNode; mobileFooter?: ReactNode }) {
  const desktop = useIsDesktop()
  const visible = sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden) })).filter((s) => s.items.length)
  return desktop ? <DesktopSettings sections={visible} header={header} asideFooter={asideFooter} /> : <MobileSettings sections={visible} header={header} footer={mobileFooter} />
}

// ───────────────────────── موبایل ─────────────────────────

function MobileSettings({ sections, header, footer }: { sections: SettingsSection[]; header?: ReactNode; footer?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  const all = sections.flatMap((s) => s.items)
  const item = all.find((i) => i.id === open) ?? null
  return (
    <div className="mx-auto max-w-2xl">
      {header}
      {sections.map((s, si) => (
        <section key={s.id} id={s.id} aria-label={s.label} className="scroll-mt-24">
          <h2 className={cn("mx-1 mb-2 text-label font-extrabold", si ? "mt-5" : "mt-0", s.danger ? "text-destructive" : "text-foreground/80")}>{s.label}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {s.items.map((i) => (
              <Cell key={i.id} item={i} onOpen={i.content ? () => setOpen(i.id) : i.onClick} />
            ))}
          </div>
        </section>
      ))}
      {footer}
      <BottomSheet open={!!item} onClose={() => setOpen(null)} title={item?.label} description={item?.description} footer={item?.footer} size={item?.wide ? "tall" : "auto"}>
        {item?.content ?? null}
      </BottomSheet>
    </div>
  )
}

function Cell({ item, onOpen }: { item: SettingsItem; onOpen?: () => void }) {
  const cls = "flex min-h-[3.125rem] w-full items-center gap-2.5 px-3.5 text-start"
  const head = (
    <>
      {item.icon && <Tile icon={item.icon} tone={item.danger ? "var(--destructive)" : item.tone} />}
      <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", item.danger && "font-bold text-destructive")}>{item.label}</span>
    </>
  )
  if (onOpen && item.trailing) {
    return (
      <div className={cls}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
          {head}
          {item.value && <span className="nums shrink-0 text-label text-muted-foreground">{item.value}</span>}
        </button>
        {item.trailing}
      </div>
    )
  }
  const body = (
    <>
      {head}
      {item.value && <span className="nums max-w-[45%] shrink-0 truncate text-label text-muted-foreground">{item.value}</span>}
      {item.trailing}
      {onOpen && !item.trailing && <ChevronLeft className="size-4 shrink-0 text-muted-foreground/70" />}
    </>
  )
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(cls, "transition-colors hover:bg-accent/50 active:bg-accent/70", item.danger && "hover:bg-destructive/5")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

// ───────────────────────── دسکتاپ ─────────────────────────

function DesktopSettings({ sections, header, asideFooter }: { sections: SettingsSection[]; header?: ReactNode; asideFooter?: ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? "")
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1)
      if (h && sections.some((s) => s.id === h)) setActive(h)
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
    // فقط بار اول و با تغییر hash
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const section = sections.find((s) => s.id === active) ?? sections[0]
  if (!section) return null
  const select = (id: string) => {
    setActive(id)
    history.replaceState(null, "", `#${id}`)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const rows = section.items.filter((i) => !i.content)
  const cards = section.items.filter((i) => i.content)
  // کارت تک‌افتاده (بدون جفت در ستون کناری) تمام‌عرض می‌شود تا جای خالی نماند
  const fullWidth: boolean[] = []
  let col = 0
  cards.forEach((c, idx) => {
    const next = cards[idx + 1]
    if (c.wide) {
      fullWidth.push(true)
      col = 0
    } else if (col === 0 && (!next || next.wide)) {
      fullWidth.push(true)
    } else {
      fullWidth.push(false)
      col = col ? 0 : 1
    }
  })

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[15rem_minmax(0,1fr)] items-start gap-8">
      <aside className="sticky top-20 space-y-3">
        <nav aria-label="بخش‌های تنظیمات" className="rounded-3xl border border-border bg-card p-2">
          {sections.map((s) => {
            const on = s.id === section.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-11 w-full items-center gap-2.5 rounded-2xl px-2.5 text-start text-sm transition-colors",
                  on ? "bg-primary/10 font-extrabold text-foreground" : "font-medium text-foreground/75 hover:bg-accent hover:text-foreground",
                  s.danger && "text-destructive"
                )}
              >
                {s.icon && <Tile icon={s.icon} tone={s.danger ? "var(--destructive)" : s.tone} />}
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
              </button>
            )
          })}
        </nav>
        {asideFooter}
      </aside>

      <div className="min-w-0">
        {header}
        <div className="mb-5 flex items-center gap-3">
          {section.icon && <Tile icon={section.icon} tone={section.danger ? "var(--destructive)" : section.tone} size="lg" />}
          <div>
            <h2 className="text-title font-extrabold">{section.label}</h2>
            {section.description && <p className="text-label text-muted-foreground">{section.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((i, idx) => (
            <section key={i.id} className={cn("flex flex-col overflow-hidden rounded-3xl border border-border bg-card", fullWidth[idx] && "xl:col-span-2", i.danger && "border-destructive/30")}>
              <header className="flex items-center gap-3 px-5 pt-4">
                {i.icon && <Tile icon={i.icon} tone={i.danger ? "var(--destructive)" : i.tone} size="lg" />}
                <div className="min-w-0 flex-1">
                  <h3 className={cn("truncate text-body font-extrabold", i.danger && "text-destructive")}>{i.label}</h3>
                  {i.description && <p className="text-caption leading-5 text-muted-foreground">{i.description}</p>}
                </div>
                {i.value && !i.trailing && <span className="nums shrink-0 rounded-full bg-muted px-2.5 py-1 text-caption font-bold text-muted-foreground">{i.value}</span>}
                {i.trailing}
              </header>
              <div className="flex-1 px-5 pb-4 pt-3">{i.content}</div>
              {i.footer && (
                <div className="flex justify-end gap-2 border-t border-border/70 bg-muted/30 px-5 py-3 [&>div]:flex [&>div]:gap-2 [&_a]:!h-10 [&_a]:!w-auto [&_a]:!rounded-xl [&_a]:!px-4 [&_button]:!h-10 [&_button]:!w-auto [&_button]:!rounded-xl [&_button]:!px-4">{i.footer}</div>
              )}
            </section>
          ))}
          {rows.length > 0 && (
            <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card xl:col-span-2">
              {rows.map((i) => (
                <Cell key={i.id} item={i} onOpen={i.onClick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
