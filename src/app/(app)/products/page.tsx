"use client"

/**
 * کالاها — موجودی زنده انبار + قیمت آخرین خرید/فروش
 * کلیک روی هر کالا: شیت جزئیات (آمار خرید/فروش + گردش اخیر)
 * + عکس کالا (ADV-05): اختیاری؛ در فرم کالا اضافه می‌شود، بندانگشتی در لیست و گالری جزئیات
 */
import { useEffect, useRef, useState } from "react"
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
  Barcode,
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
  Download,
  ImagePlus,
  FileText,
  X,
} from "lucide-react"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { formatUnit, PRODUCT_UNITS } from "@/lib/units"
import { AmountInput } from "@/components/ui/amount-input"
import { EmptyState } from "@/components/ui/empty-state"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Attachment, postAttachmentForm, useAttachmentUrls } from "@/lib/attachment-client"
import { cn } from "@/lib/utils"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { Segmented } from "@/components/ui/segmented"
import { PriceHistoryChart, type PricePoint } from "@/components/charts/price-history-chart"

interface Product {
  id: string
  name: string
  brand: string | null
  code: string | null
  unit: string
  /** عکس کالا (اختیاری) — شناسهٔ اولین پیوست تصویری (ADV-05) */
  photoId: string | null
  stock: number
  initialStock: number
  initialStockCostPrice: number
  avgCostPrice: number
  lastPurchasePrice: number
  lastSalePrice: number
  /** حد هشدار موجودی (۰ = بدون حد) */
  minStock?: number
}

/** وضعیت موجودی بر اساس حد هشدار هر کالا (نسخهٔ ۷) — به‌جای نوار نسبت به پرموجودترین کالا */
function stockState(p: Pick<Product, "stock" | "minStock">): "out" | "low" | "ok" {
  if (p.stock <= 0) return "out"
  if ((p.minStock ?? 0) > 0 && p.stock <= (p.minStock ?? 0)) return "low"
  return "ok"
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
  /** عکس‌های پیوست کالا (ADV-05) */
  attachments: Attachment[]
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
  priceHistory?: PricePoint[]
}

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
  const [initialStock, setInitialStock] = useState(
    editing?.initialStock ? String(editing.initialStock) : ""
  )
  const [initialStockCost, setInitialStockCost] = useState<number>(
    editing?.initialStockCostPrice ?? 0
  )
  const [saving, setSaving] = useState(false)

  /* ── عکس کالا (ADV-05) — اختیاری؛ در کالا جدید بعد از ذخیره پیوست می‌شود ── */
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ url: string; filename: string; size?: number } | null>(null)
  // عکس‌های ثبت‌شدهٔ کالا (فقط حالت ویرایش)
  const { data: attData, refetch: refetchPhotos } = useQuery({
    queryKey: ["attachments", "PRODUCT", editing?.id ?? "new"],
    queryFn: () =>
      apiGet<{ attachments: Attachment[] }>(
        `/api/attachments?refType=PRODUCT&refId=${editing!.id}`
      ),
    enabled: !!editing,
  })
  const savedPhotos = attData?.attachments ?? []
  const savedUrls = useAttachmentUrls(
    savedPhotos.filter((a) => a.mime.startsWith("image/")).map((a) => a.id)
  )
  // عکس‌های انتخاب‌شدهٔ هنوز آپلودنشده (کالا جدید) — پیش‌نمایش محلی
  const [pending, setPending] = useState<{ file: File; url: string }[]>([])
  const pendingUrlsRef = useRef<string[]>([])

  /** آزادسازی پیش‌نمایش‌های محلی هنگام ترک صفحه */
  useEffect(() => {
    const urls = pendingUrlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  /** آپلود فوری عکس در حالت ویرایش — چند فایل پشت‌سرهم؛ خطای هرکدام مانع بقیه نیست */
  const uploadSavedPhotos = async (files: FileList) => {
    if (!editing) return
    setUploading(true)
    let okCount = 0
    let failCount = 0
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        failCount++
        continue
      }
      try {
        const fd = new FormData()
        fd.append("file", f)
        fd.append("refType", "PRODUCT")
        fd.append("refId", editing.id)
        await postAttachmentForm("/api/attachments", fd)
        okCount++
      } catch {
        failCount++
      }
    }
    setUploading(false)
    if (okCount > 0) {
      toast.success(`${toPersianDigits(okCount)} عکس پیوست شد`)
      await refetchPhotos()
    }
    if (failCount > 0) toast.error("برخی فایل‌ها آپلود نشدند — فقط تصویر تا ۸ مگابایت")
  }

  /** انتخاب فایل: ویرایش ← آپلود فوری؛ جدید ← صف تا بعد از ذخیرهٔ کالا */
  const onPickPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (editing) {
      void uploadSavedPhotos(files)
    } else {
      const items: { file: File; url: string }[] = []
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue
        const url = URL.createObjectURL(f)
        pendingUrlsRef.current.push(url)
        items.push({ file: f, url })
      }
      if (items.length === 0) {
        toast.error("فقط تصویر (JPG/PNG/WebP) مجاز است")
        return
      }
      setPending((p) => [...p, ...items])
    }
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  /** حذف عکس ثبت‌شده (ویرایش) */
  const removeSavedPhoto = async (att: Attachment) => {
    try {
      await apiDelete(`/api/attachments?id=${att.id}`)
      await refetchPhotos()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف عکس ناموفق بود")
    }
  }

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام کالا را وارد کنید")
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/products/${editing.id}`, {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
          initialStock: initialStock.trim() === "" ? 0 : initialStock.trim(),
          initialStockCostPrice: initialStockCost,
        })
        toast.success("کالا ویرایش شد")
      } else {
        const r = await apiPost<{ product: { id: string } }>("/api/products", {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
          initialStock: initialStock.trim() === "" ? 0 : initialStock.trim(),
          initialStockCostPrice: initialStockCost,
        })
        toast.success("کالا اضافه شد")
        // آپلود عکس‌های انتخاب‌شده — بعد از ساخت کالا؛ خطای عکس مانع ثبت کالا نیست (ADV-05)
        if (pending.length > 0 && r?.product?.id) {
          let okCount = 0
          for (const p of pending) {
            try {
              const fd = new FormData()
              fd.append("file", p.file)
              fd.append("refType", "PRODUCT")
              fd.append("refId", r.product.id)
              await postAttachmentForm("/api/attachments", fd)
              okCount++
            } catch {
              /* عکس این یکی آپلود نشد — بقیه ادامه می‌یابند */
            }
          }
          if (okCount > 0) toast.success(`${toPersianDigits(okCount)} عکس کالا پیوست شد`)
          if (okCount < pending.length) toast.error("برخی عکس‌ها آپلود نشدند")
          setPending([])
        }
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
    <>
      <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش کالا" : "کالا جدید"}
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
          <label className="mb-1.5 block text-label font-bold text-foreground/80">نام کالا *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً الکترود E7018 قطر ۳.۲"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-label font-bold text-foreground/80">برند</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="اصفهان" />
          </div>
          <div>
            <label className="mb-1.5 block text-label font-bold text-foreground/80">کد کالا</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="E70-32" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">واحد شمارش</label>
          <div className="flex flex-wrap gap-1.5">
            {PRODUCT_UNITS.map((u) => (
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
                {formatUnit(u)}
              </button>
            ))}
          </div>
        </div>
        {/* عکس کالا (ADV-05) — اختیاری و مستقل از هر وضعیت */}
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <ImagePlus className="size-3.5" />
              عکس کالا (اختیاری)
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              className="h-8 shrink-0 rounded-xl px-2.5 text-caption font-bold"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {uploading ? "در حال بارگذاری…" : "افزودن تصویر"}
            </Button>
          </div>
          <p className="mb-2 text-caption leading-relaxed text-muted-foreground">
            عکس در لیست کالاها و هنگام انتخاب کالا در فاکتور نمایش داده می‌شود — اجباری نیست.
            {editing ? "" : " بعد از ذخیرهٔ کالا پیوست می‌شود."}
          </p>

          {savedPhotos.length === 0 && pending.length === 0 ? (
            <p className="rounded-xl bg-muted/40 px-2.5 py-4 text-center text-caption text-muted-foreground">
              هنوز عکسی ندارد — می‌توانید همین‌جا عکس کالا را بگیرید یا انتخاب کنید.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {savedPhotos.map((att) => {
                const isImage = att.mime.startsWith("image/")
                const url = savedUrls[att.id]
                return (
                  <div
                    key={att.id}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                  >
                    {isImage ? (
                      url ? (
                        <button
                          type="button"
                          onClick={() => setPreview({ url, filename: att.filename, size: att.size })}
                          aria-label={`پیش‌نمایش ${att.filename}`}
                          className="size-full cursor-zoom-in"
                        >
                          <img src={url} alt={att.filename} className="size-full object-cover" loading="lazy" />
                        </button>
                      ) : (
                        <div className="flex size-full items-center justify-center" aria-label="در حال بارگذاری عکس">
                          <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                        </div>
                      )
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                        <FileText className="size-5 text-muted-foreground" />
                        <span className="w-full truncate text-micro text-muted-foreground">{att.filename}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeSavedPhoto(att)}
                      aria-label={`حذف عکس ${att.filename}`}
                      className="absolute end-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-destructive"
                    >
                      <X className="size-3" strokeWidth={2.4} />
                    </button>
                  </div>
                )
              })}
              {pending.map((p, i) => (
                <div
                  key={`pending-${i}`}
                  className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-primary/40 bg-primary/5"
                >
                  <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-primary/80 py-px text-center text-micro font-bold text-white">
                    جدید
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="حذف از صف"
                    className="absolute end-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-destructive"
                  >
                    <X className="size-3" strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ورودی مخفی انتخاب تصویر (دوربین یا گالری) */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickPhotos(e.target.files)}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-label font-bold text-foreground/80">
            موجودی اولیه انبار
          </label>
          <Input
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
            inputMode="decimal"
            placeholder="مثلاً ۵۰ — اختیاری"
          />
          <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
            اگر از این کالا الان در انبار دارید، تعدادش را وارد کنید تا به موجودی انبار اضافه شود؛ بعد از این،
            موجودی با فاکتورهای خرید و فروش به‌روز می‌شود.
          </p>
        </div>
        {Number(initialStock.replace(/[^\d.-]/g, "")) > 0 && (
          <div>
            <label className="mb-1.5 block text-label font-bold text-foreground/80">
              قیمت خرید هر واحد (تومان)
            </label>
            <AmountInput
              value={initialStockCost}
              onChange={setInitialStockCost}
              placeholder="مثلاً ۵۰۰٬۰۰۰"
              showWords={false}
            />
            <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
              قیمت خرید هر واحد از موجودی اولیه — برای محاسبه صحیح سود موقع فروش این کالاها
            </p>
          </div>
        )}
      </div>
    </BottomSheet>

      {/* پیش‌نمایش عکس کالا */}
      <BottomSheet
        open={!!preview}
        onClose={() => setPreview(null)}
        title="پیش‌نمایش عکس کالا"
        description={preview?.filename}
      >
        <div className="space-y-3">
          {preview && (
            <img
              src={preview.url}
              alt={preview.filename}
              className="mx-auto max-h-[64dvh] max-w-full rounded-xl object-contain"
            />
          )}
          {preview && (
            <p className="text-center text-xs text-muted-foreground">
              {preview.filename} •{" "}
              <span className="nums">
                {toPersianDigits(Math.max(1, Math.round((preview.size ?? 0) / 1024)))} کیلوبایت
              </span>
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

/** شیت جزئیات کالا — کلیک روی کارت کالا */
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

  /* گالری عکس کالا (ADV-05) — پیش‌نمایش با کلیک */
  const galleryPhotos = data?.attachments ?? []
  const galleryUrls = useAttachmentUrls(
    galleryPhotos.filter((a) => a.mime.startsWith("image/")).map((a) => a.id)
  )
  const [preview, setPreview] = useState<{ url: string; filename: string; size?: number } | null>(null)

  return (
    <>
    <BottomSheet
      open={!!product}
      onClose={onClose}
      title={product ? [product.name, product.brand].filter(Boolean).join(" — ") : ""}
      description={product ? [product.code ? `کد ${product.code}` : null].filter(Boolean).join(" • ") || `واحد: ${formatUnit(product.unit)}` : ""}
      size="tall"
      footer={
        <Button
          onClick={() => product && onEdit(product)}
          className="h-12 w-full rounded-2xl font-bold"
        >
          <Pencil className="size-4" />
          ویرایش کالا
        </Button>
      }
    >
      {isLoading || !s ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* گالری عکس کالا (ADV-05) — اختیاری؛ کلیک = پیش‌نمایش */}
          {galleryPhotos.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <ImagePlus className="size-3.5 text-primary" />
                عکس‌های کالا
                <span className="nums rounded-full bg-muted px-1.5 py-px text-micro font-bold text-muted-foreground">
                  {toPersianDigits(galleryPhotos.length)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {galleryPhotos.map((att) => {
                  const isImage = att.mime.startsWith("image/")
                  const url = galleryUrls[att.id]
                  return (
                    <div
                      key={att.id}
                      className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                    >
                      {isImage ? (
                        url ? (
                          <button
                            type="button"
                            onClick={() => setPreview({ url, filename: att.filename, size: att.size })}
                            aria-label={`پیش‌نمایش ${att.filename}`}
                            className="size-full cursor-zoom-in"
                          >
                            <img src={url} alt={att.filename} className="size-full object-cover" loading="lazy" />
                          </button>
                        ) : (
                          <div className="flex size-full items-center justify-center" aria-label="در حال بارگذاری عکس">
                            <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                          </div>
                        )
                      ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                          <FileText className="size-5 text-muted-foreground" />
                          <span className="w-full truncate text-micro text-muted-foreground">{att.filename}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* آمار اصلی */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <div className="flex items-center gap-1 text-caption text-primary">
                <Scale className="size-3" />
                موجودی فعلی
              </div>
              <p className="nums mt-1 text-sm font-extrabold text-primary">
                {toPersianDigits(s.stock)} {formatUnit(data?.product.unit)}
              </p>
              {(data?.product.initialStock ?? 0) > 0 && (
                <p className="nums mt-0.5 text-micro text-primary/70">
                  شامل موجودی اولیه: {toPersianDigits(data!.product.initialStock)}
                  {(data!.product.initialStockCostPrice ?? 0) > 0 &&
                    ` • خرید هر واحد: ${formatToman(data!.product.initialStockCostPrice, false)}`}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-3">
              <div className="flex items-center gap-1 text-caption text-muted-foreground">
                <Wallet className="size-3" />
                ارزش موجودی (خرید)
              </div>
              <p className="nums mt-1 text-sm font-extrabold">
                {formatTomanCompact(s.stock * (s.avgPurchasePrice || s.lastPurchasePrice))}
              </p>
            </div>
          </div>

          {/* نمودار روند قیمت خرید/فروش */}
          <PriceHistoryChart history={data?.priceHistory ?? []} />

          {/* آخرین قیمت‌ها */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-caption">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="size-3.5" />
                {s.lastPurchasePrice > 0 ? "آخرین خرید" : "قیمت خرید اولیه"}
              </span>
              <span className="nums font-extrabold">
                {formatToman(s.lastPurchasePrice || data!.product.initialStockCostPrice, false)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-caption">
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
                هنوز خرید یا فروشی برای این کالا ثبت نشده
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
                      <InvoiceTypeMark type={isPurchase ? "PURCHASE" : "SALE"} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-caption font-bold">{m.personName}</div>
                        <div className="nums text-micro text-muted-foreground">
                          {formatJalaliShort(new Date(m.date))} • فاکتور {toPersianDigits(m.invoiceNumber)} •{" "}
                          {toPersianDigits(m.quantity)} {formatUnit(m.unit)} × {formatToman(m.unitPrice, false)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "nums shrink-0 text-caption font-extrabold",
                          isPurchase ? "text-purchase" : "text-income"
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

    {/* پیش‌نمایش عکس کالا */}
    <BottomSheet
      open={!!preview}
      onClose={() => setPreview(null)}
      title="پیش‌نمایش عکس کالا"
      description={preview?.filename}
    >
      <div className="space-y-3">
        {preview && (
          <img
            src={preview.url}
            alt={preview.filename}
            className="mx-auto max-h-[64dvh] max-w-full rounded-xl object-contain"
          />
        )}
        {preview && (
          <p className="text-center text-xs text-muted-foreground">
            {preview.filename} •{" "}
            <span className="nums">
              {toPersianDigits(Math.max(1, Math.round((preview.size ?? 0) / 1024)))} کیلوبایت
            </span>
          </p>
        )}
      </div>
    </BottomSheet>
    </>
  )
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState("")
  const [sheet, setSheet] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const [exporting, setExporting] = useState(false)
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all")

  // ADV-02: دانلود مطمئن CSV — window.location.href داخل مینی‌اپ تلگرام کوکی نشست ندارد
  // (احراز هویت فقط با هدر x-telegram-init-data)؛ پس با fetch + blob دانلود می‌کنیم.
  const downloadCsv = async (type: "invoices" | "people" | "products") => {
    try {
      setExporting(true)
      const headers: Record<string, string> = {}
      const initData = window.Telegram?.WebApp?.initData
      if (initData) headers["x-telegram-init-data"] = initData
      const res = await fetch(`/api/export?type=${type}`, { headers })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "خروجی ناموفق بود")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("content-disposition") || ""
      const m = /filename="?([^";]+)"?/.exec(cd)
      a.href = url
      a.download = m?.[1] || `hesabyar-${type}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success("فایل اکسل دانلود شد")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در خروجی")
    } finally {
      setExporting(false)
    }
  }

  const params = new URLSearchParams()
  if (q) params.set("q", q)

  const { data, isLoading } = useQuery({
    queryKey: ["products", q],
    queryFn: () => apiGet<{ products: Product[] }>(`/api/products?${params}`),
  })

  const allProducts = data?.products ?? []
  const products = allProducts.filter((p) =>
    stockFilter === "all" ? true : stockFilter === "low" ? stockState(p) === "low" : p.stock <= 0
  )
  // بندانگشتی عکس کالاها (ADV-05) — فقط کالاهایی که عکس دارند
  const photoIds = products.map((p) => p.photoId).filter((x): x is string => !!x)
  const photoUrls = useAttachmentUrls(photoIds)
  const totalValue = allProducts.reduce(
    (s, p) => s + p.stock * (p.avgCostPrice || p.lastPurchasePrice || 0),
    0
  )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="hidden text-2xl font-extrabold tracking-tight lg:block">کالاها</h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => downloadCsv("products")}
            variant="outline"
            disabled={exporting}
            className="h-10 rounded-2xl px-4 text-xs font-bold hover:bg-accent"
            aria-label="خروجی اکسل کالاها"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">اکسل</span>
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setSheet(true)
            }}
            className="h-10 rounded-xl px-4 text-label font-bold"
          >
            <Plus className="size-4" />
            افزودن کالا
          </Button>
        </div>
      </div>

      {/* خلاصه */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3">
        <div className="rounded-3xl border border-border/70 bg-card p-3.5 shadow-card">
          <div className="flex items-center gap-1.5 text-caption font-bold text-muted-foreground">
            <span className="icon-soft grid size-6 place-items-center rounded-lg" style={{ ["--tile" as string]: "var(--hue-products)" }}>
              <Boxes className="size-3.5" />
            </span>
            <span className="truncate">تعداد کالاها</span>
          </div>
          <p className="nums mt-2 text-base font-extrabold sm:text-lg">{toPersianDigits(allProducts.length)}</p>
        </div>
        <div className="rounded-3xl border border-border/70 bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-caption font-bold text-muted-foreground">
            <Banknote className="size-3.5 shrink-0" />
            <span className="truncate">ارزش موجودی</span>
          </div>
          <p className="nums mt-2 truncate text-base font-extrabold sm:text-lg">
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
            placeholder="جستجوی نام، برند یا کد کالا"
            className="field ps-10"
          />
        </div>
        <Segmented
          value={stockFilter}
          onChange={setStockFilter}
          options={[
            { key: "all", label: "همه", count: allProducts.length },
            { key: "low", label: "کم‌موجود", tone: "var(--warning-ink)", count: allProducts.filter((p) => stockState(p) === "low").length },
            { key: "out", label: "تمام‌شده", tone: "var(--destructive)", count: allProducts.filter((p) => p.stock <= 0).length },
          ]}
          className="mt-2 sm:max-w-sm"
        />
      </div>

      {/* لیست */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={q || stockFilter !== "all" ? Search : Package}
          title={q ? `کالایی با «${q}» پیدا نشد` : stockFilter !== "all" ? "کالایی در این دسته نیست" : "کالایی ثبت نشده"}
          description={
            q || stockFilter !== "all"
              ? "عبارت دیگری جستجو کنید یا فیلتر را بردارید."
              : "کالاها را همین‌جا بسازید یا موقع ثبت فاکتور سریع اضافه کنید."
          }
          secondaryLabel={q || stockFilter !== "all" ? "پاک کردن فیلترها" : undefined}
          onSecondary={
            q || stockFilter !== "all"
              ? () => {
                  setQ("")
                  setStockFilter("all")
                }
              : undefined
          }
        />
      ) : (
        // grid-cols-1 = minmax(0,1fr): ستون ضمنی auto با محتوای پهن کارت (تا عکس‌ها برسند) از صفحه بیرون می‌زد
        <div className="grid grid-cols-1 divide-y divide-border/60 overflow-hidden rounded-[1.25rem] border border-border/80 bg-card">
          {products.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(p)}
              onKeyDown={(e) => e.key === "Enter" && setDetail(p)}
              className="min-w-0 cursor-pointer px-3.5 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60"
            >
              <div className="flex items-center gap-3">
                {/* عکس کالا اگر داشته باشد، وگرنه آیکون پیش‌فرض (ADV-05) */}
                {p.photoId && photoUrls[p.photoId] ? (
                  <img
                    src={photoUrls[p.photoId]}
                    alt={p.name}
                    loading="lazy"
                    width={44}
                    height={44}
                    className="size-11 shrink-0 rounded-2xl border border-border/60 bg-muted object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Package className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.95rem] font-bold">
                    {p.name}
                    {p.brand ? <span className="font-medium text-muted-foreground"> — {p.brand}</span> : null}
                  </div>
                  <div className="nums mt-0.5 truncate text-caption text-muted-foreground">
                    {[
                      p.code ? `کد ${p.code}` : null,
                      p.lastSalePrice > 0 ? `فروش ${formatToman(p.lastSalePrice, false)}` : null,
                      p.lastPurchasePrice > 0 ? `خرید ${formatToman(p.lastPurchasePrice, false)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" | ") || `واحد: ${formatUnit(p.unit)}`}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="nums text-sm font-extrabold">
                    {toPersianDigits(Math.max(0, p.stock))} <span className="text-caption font-semibold text-muted-foreground">{formatUnit(p.unit)}</span>
                  </div>
                  {(() => {
                    const st = stockState(p)
                    return (
                      <span
                        className={cn(
                          "mt-1 inline-block rounded-full px-2 py-0.5 text-micro font-bold leading-4",
                          st === "out" ? "bg-destructive/10 text-destructive" : st === "low" ? "bg-warning/15 text-warning-ink" : "bg-income/10 text-income"
                        )}
                      >
                        {st === "out" ? "تمام شده" : st === "low" ? "کم" : "کافی"}
                      </span>
                    )
                  })()}
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
