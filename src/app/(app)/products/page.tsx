"use client"

/**
 * اجناس — موجودی زنده انبار + قیمت آخرین خرید/فروش + افزودن/ویرایش
 */
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Package,
  Plus,
  Search,
  Loader2,
  AlertTriangle,
  Pencil,
  Boxes,
} from "lucide-react"
import { apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Product {
  id: string
  name: string
  brand: string | null
  code: string | null
  unit: string
  minStock: number
  stock: number
  lastPurchasePrice: number
  lastSalePrice: number
  lowStock: boolean
}

const UNITS = ["عدد", "کیلوگرم", "پاکت", "کارتن", "متر", "بسته"] as const

function ProductForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  editing: Product | null
}) {
  const [name, setName] = useState(editing?.name ?? "")
  const [brand, setBrand] = useState(editing?.brand ?? "")
  const [code, setCode] = useState(editing?.code ?? "")
  const [unit, setUnit] = useState<string>(editing?.unit ?? "عدد")
  const [minStock, setMinStock] = useState(editing?.minStock ?? 0)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام جنس را وارد کنید")
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/products/${editing.id}`, {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
          minStock,
        })
        toast.success("جنس ویرایش شد ✅")
      } else {
        await apiPost("/api/products", {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
          minStock,
        })
        toast.success("جنس اضافه شد ✅")
      }
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش جنس" : "جنس جدید"}
      size="tall"
      footer={
        <Button onClick={submit} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          ذخیره
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نام جنس *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً الکترود E7018 قطر ۳.۲"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">برند</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="اصفهان" />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">کد جنس</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="E70-32" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">واحد شمارش</label>
          <div className="flex flex-wrap gap-1.5">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                  unit === u
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            حد هشدار موجودی (وقتی موجودی کمتر از این شد، هشدار می‌دهد)
          </label>
          <input
            value={minStock || ""}
            onChange={(e) => {
              const latin = e.target.value.replace(/[^\d.]/g, "")
              setMinStock(latin ? Number(latin) : 0)
            }}
            inputMode="decimal"
            dir="ltr"
            placeholder="۰"
            className="nums h-11 w-full rounded-xl border border-input bg-card px-3 text-end text-sm outline-none focus-visible:border-ring"
          />
        </div>
      </div>
    </BottomSheet>
  )
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [lowOnly, setLowOnly] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (lowOnly) params.set("lowStock", "true")

  const { data, isLoading } = useQuery({
    queryKey: ["products", q, lowOnly],
    queryFn: () => apiGet<{ products: Product[] }>(`/api/products?${params}`),
  })

  const products = data?.products ?? []
  const totalValue = products.reduce((s, p) => s + p.stock * p.lastPurchasePrice, 0)
  const lowCount = products.filter((p) => p.lowStock).length

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">اجناس</h1>
        <Button
          onClick={() => {
            setEditing(null)
            setSheet(true)
          }}
          className="h-10 rounded-2xl px-4 text-xs font-bold shadow-fab"
        >
          <Plus className="size-4" />
          جنس جدید
        </Button>
      </div>

      {/* خلاصه */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-card">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <Boxes className="size-3.5" />
            تعداد اجناس
          </div>
          <p className="nums mt-1 text-base font-extrabold sm:text-lg">{toPersianDigits(products.length)}</p>
        </div>
        <div className="rounded-2xl border border-warning/25 bg-warning/10 p-3.5">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-warning">
            <AlertTriangle className="size-3.5" />
            رو به اتمام
          </div>
          <p className="nums mt-1 text-base font-extrabold text-warning sm:text-lg">
            {toPersianDigits(lowCount)}
          </p>
        </div>
      </div>

      {/* فیلتر */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام، برند یا کد…"
            className="h-11 w-full rounded-2xl border border-input bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => setLowOnly(!lowOnly)}
          className={cn(
            "flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-xs font-bold transition-colors",
            lowOnly
              ? "border-warning bg-warning/10 text-warning"
              : "border-border bg-card text-muted-foreground"
          )}
        >
          <AlertTriangle className="size-3.5" />
          کم‌موجود
        </button>
      </div>

      {/* لیست */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <Package className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">جنسی ثبت نشده</p>
          <p className="mt-1 text-xs text-muted-foreground">
            اجناس را همین‌جا بسازید یا موقع ثبت فاکتور سریع اضافه کنید
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {products.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-3xl border bg-card p-4 shadow-card transition-all hover:shadow-card-hover",
                p.lowStock ? "border-warning/40" : "border-border/70"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    p.lowStock ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
                  )}
                >
                  {p.lowStock ? <AlertTriangle className="size-5" /> : <Package className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{p.name}</div>
                  <div className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                    {[p.brand, p.code ? `کد ${p.code}` : null].filter(Boolean).join(" • ") || `واحد: ${p.unit}`}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div
                    className={cn(
                      "nums text-sm font-extrabold",
                      p.lowStock ? "text-warning" : "text-primary"
                    )}
                  >
                    {toPersianDigits(p.stock)} {p.unit}
                  </div>
                  <div className="text-[0.6rem] text-muted-foreground">موجودی</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p)
                    setSheet(true)
                  }}
                  className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent"
                  aria-label="ویرایش"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              {(p.lastPurchasePrice > 0 || p.lastSalePrice > 0) && (
                <div className="mt-2.5 flex gap-2 border-t border-dashed pt-2.5 text-[0.62rem]">
                  {p.lastPurchasePrice > 0 && (
                    <span className="nums rounded-lg bg-destructive/5 px-2 py-1 text-destructive">
                      آخرین خرید: {formatToman(p.lastPurchasePrice, false)}
                    </span>
                  )}
                  {p.lastSalePrice > 0 && (
                    <span className="nums rounded-lg bg-income/5 px-2 py-1 text-income">
                      آخرین فروش: {formatToman(p.lastSalePrice, false)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {sheet && (
        <ProductForm
          key={editing?.id ?? "new"}
          open={sheet}
          editing={editing}
          onClose={() => {
            setSheet(false)
            setEditing(null)
          }}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["products"] })
          }}
        />
      )}
    </div>
  )
}
