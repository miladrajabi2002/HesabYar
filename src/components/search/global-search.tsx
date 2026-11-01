"use client"

/**
 * جستجوی سراسری یکپارچه (ADV-01) — یک میانبر که بین
 * فاکتور، شخص، جنس و چک هم‌زمان جستجو می‌کند.
 * باز شدن: دکمه جستجو در هدر + میانبر Ctrl+K / Cmd+K
 */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Search, FileText, Users, Package, CheckSquare2, Loader2, CornerDownLeft } from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatTomanCompact } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { BankLogo } from "@/components/ui/bank-logo"
import { PersonAvatar } from "@/components/ui/person-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useTelegram } from "@/hooks/use-telegram"

interface SearchResults {
  invoices: {
    id: string
    number: number
    type: string
    total: number
    credit: number
    date: string
    person: { name: string }
  }[]
  people: { id: string; name: string; phone: string | null; company: string | null; role: string; balance: number }[]
  products: { id: string; name: string; brand: string | null; unit: string }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    status: string
    direction: string
    dueDate: string
    person: { name: string }
  }[]
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const { haptic } = useTelegram()

  // جستجوی debounce شده
  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debouncedQ],
    queryFn: () => apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: open && debouncedQ.length >= 2,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (open) {
      setQ("")
      setTimeout(() => inputRef.current?.focus(), 250)
    }
  }, [open])

  const go = (href: string) => {
    haptic.tap()
    onClose()
    router.push(href)
  }

  const r = data
  const hasResults =
    !!r && (r.invoices.length > 0 || r.people.length > 0 || r.products.length > 0 || r.checks.length > 0)

  return (
    <BottomSheet open={open} onClose={onClose} title="جستجوی سراسری" description="فاکتور، شخص، جنس، چک…" size="tall">
      <div className="relative mb-3">
        <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="مثلاً نام مشتری، شماره فاکتور یا سریال چک…"
          className="field ps-10"
          inputMode="search"
        />
        {isFetching && (
          <Loader2 className="absolute inset-y-0 end-3 my-auto size-4 animate-spin text-primary" />
        )}
      </div>

      {debouncedQ.length < 2 ? (
        <div className="grid grid-cols-2 gap-2 py-2">
          {[
            { icon: FileText, label: "فاکتورها", hint: "شماره یا شخص" },
            { icon: Users, label: "اشخاص", hint: "نام یا موبایل" },
            { icon: Package, label: "اجناس", hint: "نام، برند یا کد" },
            { icon: CheckSquare2, label: "چک‌ها", hint: "سریال یا مبلغ" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/70 bg-muted/40 p-3 text-center">
              <s.icon className="mx-auto size-5 text-primary" />
              <p className="mt-1.5 text-[0.7rem] font-bold">{s.label}</p>
              <p className="text-[0.6rem] text-muted-foreground">{s.hint}</p>
            </div>
          ))}
        </div>
      ) : !hasResults && !isFetching ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          چیزی پیدا نشد — عبارت دیگری امتحان کنید
        </p>
      ) : (
        <div className="max-h-[52vh] space-y-4 overflow-y-auto pe-1">
          {/* فاکتورها */}
          {r && r.invoices.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                <FileText className="size-3.5" /> فاکتورها
              </p>
              <div className="space-y-1.5">
                {r.invoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => go(`/invoices/${inv.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-accent/50"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">
                        {inv.person.name} — فاکتور {inv.number}
                      </span>
                      <span className="nums block text-[0.65rem] text-muted-foreground">
                        {formatJalaliShort(new Date(inv.date))} • {inv.type === "SALE" ? "فروش" : "خرید"}
                        {inv.credit > 0 ? ` • مانده ${formatTomanCompact(inv.credit)}` : " • تسویه"}
                      </span>
                    </span>
                    <span className="nums shrink-0 text-xs font-extrabold">
                      {formatTomanCompact(inv.total)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* اشخاص */}
          {r && r.people.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                <Users className="size-3.5" /> اشخاص
              </p>
              <div className="space-y-1.5">
                {r.people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => go(`/people/${p.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-accent/50"
                  >
                    <PersonAvatar name={p.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{p.name}</span>
                      <span className="nums block truncate text-[0.65rem] text-muted-foreground">
                        {[p.phone, p.company].filter(Boolean).join(" • ") || "شخص"}
                      </span>
                    </span>
                    {p.balance !== 0 && (
                      <span
                        className={`nums shrink-0 text-[0.7rem] font-bold ${
                          p.balance > 0 ? "text-warning" : "text-destructive"
                        }`}
                      >
                        {formatTomanCompact(Math.abs(p.balance))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* اجناس */}
          {r && r.products.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                <Package className="size-3.5" /> اجناس
              </p>
              <div className="space-y-1.5">
                {r.products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => go(`/products`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-accent/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Package className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">
                        {p.name}
                        {p.brand ? <span className="text-muted-foreground"> — {p.brand}</span> : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* چک‌ها */}
          {r && r.checks.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold text-muted-foreground">
                <CheckSquare2 className="size-3.5" /> چک‌ها
              </p>
              <div className="space-y-1.5">
                {r.checks.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go(`/checks`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-accent/50"
                  >
                    <BankLogo bankKey={c.bankKey} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{c.person.name}</span>
                      <span className="nums block text-[0.65rem] text-muted-foreground">
                        {c.direction === "RECEIVED" ? "دریافتی" : "صادره"} • سررسید{" "}
                        {formatJalaliShort(new Date(c.dueDate))}
                        {c.serial ? ` • ${c.serial}` : ""}
                      </span>
                    </span>
                    <span className="nums shrink-0 text-xs font-extrabold">{formatTomanCompact(c.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-3 flex items-center justify-center gap-1 text-[0.6rem] text-muted-foreground">
        <CornerDownLeft className="size-3" />
        برای باز شدن جزئیات روی نتیجه بزنید
      </p>
    </BottomSheet>
  )
}

/** دکمه + میانبر جستجو — داخل AppShell */
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onOpen])

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.94 }}
      aria-label="جستجوی سراسری"
      className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Search className="size-[1.1rem]" />
    </motion.button>
  )
}

export { AnimatePresence }
