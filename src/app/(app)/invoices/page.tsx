"use client"

/**
 * لیست فاکتورها — فیلتر نوع/شخص/ماه، جستجو؛ کارت‌های عمودی (بدون اسکرول افقی)
 */
import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Plus,
  FileText,
  ShoppingBag,
  Package,
  Filter,
  Loader2,
  ChevronLeft,
  Search,
  CalendarDays,
  X,
} from "lucide-react"
import { apiGet } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, jalaliOf, nowTehran, JALALI_MONTHS } from "@/lib/jalali"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Invoice {
  id: string
  number: number
  type: string
  date: string
  total: number
  paidCash: number
  paidChecks: number
  credit: number
  status: string
  note: string | null
  person: { id: string; name: string }
  items: { id: string; productName: string; quantity: number; unit: string; total: number }[]
  checks: { id: string; amount: number; status: string }[]
}

function monthLabelOf(dateStr: string): string {
  const j = jalaliOf(new Date(dateStr))
  return `${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`
}

function InvoicesPageInner() {
  const searchParams = useSearchParams()
  const [type, setType] = useState<"ALL" | "SALE" | "PURCHASE">("ALL")
  const [personId, setPersonId] = useState<string | null>(searchParams.get("person"))
  const [personName, setPersonName] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [personSheet, setPersonSheet] = useState(false)

  const params = new URLSearchParams()
  if (type !== "ALL") params.set("type", type)
  if (personId) params.set("personId", personId)
  if (q) params.set("q", q)
  params.set("pageSize", "50")

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", type, personId, q],
    queryFn: () => apiGet<{ invoices: Invoice[]; total: number }>(`/api/invoices?${params}`),
  })

  const { data: peopleData } = useQuery({
    queryKey: ["people", "all"],
    queryFn: () => apiGet<{ people: { id: string; name: string }[] }>("/api/people"),
    enabled: personSheet,
  })

  const invoices = data?.invoices ?? []
  // جستجوی محلی بر نام شخص/شماره فاکتور
  const filtered = q
    ? invoices.filter(
        (i) =>
          i.person.name.includes(q) ||
          String(i.number).includes(q.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))
      )
    : invoices

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">فاکتورها</h1>
        <Link href="/invoices/new?type=SALE">
          <Button className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab">
            <Plus className="size-4" />
            فاکتور جدید
          </Button>
        </Link>
      </div>

      {/* فیلترها */}
      <div className="mb-4 space-y-2.5">
        <div className="flex gap-2">
          {(
            [
              { key: "ALL", label: "همه" },
              { key: "SALE", label: "فروش" },
              { key: "PURCHASE", label: "خرید" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setType(f.key)}
              className={cn(
                "flex-1 rounded-2xl border py-2.5 text-xs font-bold transition-all sm:flex-none sm:px-6",
                type === f.key
                  ? f.key === "SALE"
                    ? "border-income bg-income/10 text-income"
                    : f.key === "PURCHASE"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی شخص یا شماره فاکتور…"
              className="h-11 w-full rounded-2xl border border-input bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setPersonSheet(true)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-xs font-bold transition-colors",
              personId
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {personId ? <X className="size-3.5" /> : <Filter className="size-3.5" />}
            {personId ? (personName ?? "شخص") : "فیلتر شخص"}
          </button>
        </div>
      </div>

      {/* لیست */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">فاکتوری نیست</p>
          <p className="mt-1 text-xs text-muted-foreground">
            با دکمه «فاکتور جدید» اولین خرید یا فروش را ثبت کنید
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="block rounded-3xl border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-card-hover active:scale-[0.995]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                  )}
                >
                  {inv.type === "SALE" ? <ShoppingBag className="size-5" /> : <Package className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-extrabold">{inv.person.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                        inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {inv.type === "SALE" ? "فروش" : "خرید"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                    <CalendarDays className="size-3" />
                    <span className="nums">{formatJalaliWithWeekday(new Date(inv.date))}</span>
                    <span className="mx-1">•</span>
                    <span className="nums">شماره {toPersianDigits(inv.number)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="nums text-sm font-extrabold">{formatToman(inv.total, false)}</div>
                  <div className="mt-0.5">
                    {inv.credit > 0 ? (
                      <span className="rounded-md bg-warning/10 px-1.5 py-px text-[0.6rem] font-bold text-warning">
                        مانده {formatToman(inv.credit, false)}
                      </span>
                    ) : (
                      <span className="rounded-md bg-income/10 px-1.5 py-px text-[0.6rem] font-bold text-income">
                        تسویه ✓
                      </span>
                    )}
                  </div>
                </div>
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground/50" />
              </div>
              {inv.items.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1 border-t border-dashed pt-2.5">
                  {inv.items.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className="nums max-w-full truncate rounded-lg bg-muted px-2 py-1 text-[0.62rem] text-muted-foreground"
                    >
                      {toPersianDigits(it.quantity)} {it.unit} {it.productName}
                    </span>
                  ))}
                  {inv.items.length > 3 && (
                    <span className="rounded-lg bg-muted px-2 py-1 text-[0.62rem] text-muted-foreground">
                      +{toPersianDigits(inv.items.length - 3)} مورد
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* شیت فیلتر شخص */}
      <BottomSheet
        open={personSheet}
        onClose={() => setPersonSheet(false)}
        title="فیلتر بر اساس شخص"
        size="tall"
      >
        <div className="space-y-2">
          <SheetOption
            title="همه اشخاص"
            onClick={() => {
              setPersonId(null)
              setPersonName(null)
              setPersonSheet(false)
            }}
          />
          {(peopleData?.people ?? []).map((p) => (
            <SheetOption
              key={p.id}
              title={p.name}
              selected={personId === p.id}
              onClick={() => {
                setPersonId(p.id)
                setPersonName(p.name)
                setPersonSheet(false)
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <InvoicesPageInner />
    </Suspense>
  )
}
