"use client"

/**
 * اجناس — موجودی زنده انبار + قیمت آخرین خرید/فروش
 * کلیک روی هر جنس: شیت جزئیات (آمار خرید/فروش + گردش اخیر)
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Package,
  Plus,
  Search,
  Loader2,
  Pencil,
  Boxes,
  Banknote,
  ArrowDownLeft,
  ArrowUpRight,
  Barcode,
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react"
import { apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
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
  stock: number
  lastPurchasePrice: number
  lastSalePrice: number
}

interface Movement {
  id: string
  invoiceId: string
  invoiceNumber: number
  type: string
  date: string
  personName: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

interface ProductDetails {
  product: Product
  stats: {
    stock: number
    purchasedQty: number
    purchasedAmount: number
    avgPurchasePrice: number
    soldQty: number
    soldAmount: number
    avgSalePrice: number
    lastPurchasePrice: number
    lastSalePrice: number
  }
  movements: Movement[]
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
        })
        toast.success("جنس ویرایش شد ✅")
      } else {
        await apiPost("/api/products", {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
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
                  "rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors",
                  unit === u
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

/** شیت جزئیات جنس — کلیک روی کارت جنس */
function ProductDetailsSheet({
  product,
  onClose,
  onEdit,
}: {
  product: Product | null
  onClose: () => void
  onEdit: (p: Product) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-details", product?.id],
    queryFn: () => apiGet<ProductDetails>(`/api/products/${product!.id}`),
    enabled: !!product,
  })

  const s = data?.stats

  return (
    <BottomSheet
      open={!!product}
      onClose={onClose}
      title={product?.name ?? ""}
      description={product ? [product.brand, product.code ? `کد ${product.code}` : null].filter(Boolean).join(" • ") || `واحد: ${product.unit}` : ""}
      size="tall"
      footer={
        <Button
          onClick={() => product && onEdit(product)}
          className="h-12 w-full rounded-2xl font-bold"
        >
          <Pencil className="size-4" />
          ویرایش جنس
        </Button>
      }
    >
      {isLoading || !s ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* آمار اصلی */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <div className="flex items-center gap-1 text-[0.65rem] text-primary">
                <Scale className="size-3" />
                موجودی فعلی
              </div>
              <p className="nums mt-1 text-sm font-extrabold text-primary">
                {toPersianDigits(s.stock)} {data?.product.unit}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-3">
              <div className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                <Wallet className="size-3" />
                ارزش موجودی (خرید)
              </div>
              <p className="nums mt-1 text-sm font-extrabold">
                {formatTomanCompact(s.stock * (s.avgPurchasePrice || s.lastPurchasePrice))}
              </p>
            </div>
          </div>

          {/* خرید/فروش */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-destructive/5 p-3">
              <div className="flex items-center gap-1 text-[0.65rem] text-destructive">
                <ArrowDownLeft className="size-3" />
                مجموع خرید
              </div>
              <p className="nums mt-1 text-[0.8rem] font-extrabold text-destructive">
                {toPersianDigits(s.purchasedQty)} {data?.product.unit} • {formatTomanCompact(s.purchasedAmount)}
              </p>
              <div className="nums mt-1 text-[0.6rem] text-muted-foreground">
                {s.avgPurchasePrice > 0 ? `میانگین: ${formatToman(s.avgPurchasePrice, false)}` : "خریدی ثبت نشده"}
              </div>
            </div>
            <div className="rounded-2xl bg-income/5 p-3">
              <div className="flex items-center gap-1 text-[0.65rem] text-income">
                <ArrowUpRight className="size-3" />
                مجموع فروش
              </div>
              <p className="nums mt-1 text-[0.8rem] font-extrabold text-income">
                {toPersianDigits(s.soldQty)} {data?.product.unit} • {formatTomanCompact(s.soldAmount)}
              </p>
              <div className="nums mt-1 text-[0.6rem] text-muted-foreground">
                {s.avgSalePrice > 0 ? `میانگین: ${formatToman(s.avgSalePrice, false)}` : "فروشی ثبت نشده"}
              </div>
            </div>
          </div>

          {/* آخرین قیمت‌ها */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-[0.68rem]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="size-3.5" />
                آخرین خرید
              </span>
              <span className="nums font-extrabold">{formatToman(s.lastPurchasePrice, false)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-[0.68rem]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="size-3.5" />
                آخرین فروش
              </span>
              <span className="nums font-extrabold">{formatToman(s.lastSalePrice, false)}</span>
            </div>
          </div>

          {/* گردش اخیر */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
              <Barcode className="size-3.5 text-primary" />
              آخرین گردش‌ها
            </div>
            {data!.movements.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
                هنوز خرید یا فروشی برای این جنس ثبت نشده
              </p>
            ) : (
              <div className="space-y-1.5">
                {data!.movements.map((m) => {
                  const isPurchase = m.type === "PURCHASE"
                  return (
                    <Link
                      key={m.id}
                      href={`/invoices/${m.invoiceId}`}
                      className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-3 py-2 transition-colors hover:bg-accent/50"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-xl",
                          isPurchase ? "bg-destructive/10 text-destructive" : "bg-income/10 text-income"
                        )}
                      >
                        {isPurchase ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.7rem] font-bold">{m.personName}</div>
                        <div className="nums text-[0.6rem] text-muted-foreground">
                          {formatJalaliShort(new Date(m.date))} • فاکتور {toPersianDigits(m.invoiceNumber)} •{" "}
                          {toPersianDigits(m.quantity)} {m.unit} × {formatToman(m.unitPrice, false)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "nums shrink-0 text-[0.68rem] font-extrabold",
                          isPurchase ? "text-destructive" : "text-income"
                        )}
                      >
                        {formatTomanCompact(m.total)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)

  const params = new URLSearchParams()
  if (q) params.set("q", q)

  const { data, isLoading } = useQuery({
    queryKey: ["products", q],
    queryFn: () => apiGet<{ products: Product[] }>(`/api/products?${params}`),
  })

  const products = data?.products ?? []
  const totalValue = products.reduce(
    (s, p) => s + p.stock * (p.lastPurchasePrice || 0),
    0
  )

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
        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3.5">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-primary">
            <Banknote className="size-3.5" />
            ارزش موجودی
          </div>
          <p className="nums mt-1 text-base font-extrabold text-primary sm:text-lg">
            {formatTomanCompact(totalValue)}
          </p>
        </div>
      </div>

      {/* جستجو */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام، برند یا کد…"
            className="field ps-10"
          />
        </div>
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
              role="button"
              tabIndex={0}
              onClick={() => setDetail(p)}
              onKeyDown={(e) => e.key === "Enter" && setDetail(p)}
              className="cursor-pointer rounded-3xl border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-card-hover active:scale-[0.995]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Package className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{p.name}</div>
                  <div className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                    {[p.brand, p.code ? `کد ${p.code}` : null].filter(Boolean).join(" • ") || `واحد: ${p.unit}`}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="nums text-sm font-extrabold text-primary">
                    {toPersianDigits(p.stock)} {p.unit}
                  </div>
                  <div className="text-[0.6rem] text-muted-foreground">موجودی</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
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
            await queryClient.invalidateQueries({ queryKey: ["product-details"] })
          }}
        />
      )}

      <ProductDetailsSheet
        product={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => {
          setDetail(null)
          setEditing(p)
          setSheet(true)
        }}
      />
    </div>
  )
}
