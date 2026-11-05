"use client"

/**
 * فیلدهای فرم کالا (نسخهٔ ۷) — هم‌الگوی فرم شخص؛ مشترک بین «کالای جدید/ویرایش» (کالاها)
 * و «کالای جدید» داخل شیت افزودن قلم فاکتور.
 *  • «اطلاعات اصلی»: نام + واحد شمارش (انتخاب‌گر یکدست)
 *  • «جزئیات بیشتر»: برند، کد و عکس — ردیف «افزودن ›» تا لمس نشده
 *  • «موجودی از قبل» (فقط صفحهٔ کالاها): تعداد و قیمت خرید هر واحد
 */
import { useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { AmountInput } from "@/components/ui/amount-input"
import { AddRow, Group, GroupTitle, InlineField, bareInput } from "@/components/ui/form-group"
import { Select } from "@/components/ui/select"
import { PRODUCT_UNITS, formatUnit } from "@/lib/units"
import { toPersianDigits } from "@/lib/money"
import { cn } from "@/lib/utils"

export interface ProductPhotoThumb {
  key: string
  /** بدون url = در حال بارگذاری */
  url?: string
  isNew?: boolean
  onRemove: () => void
  onOpen?: () => void
}

export function ProductFields({
  name,
  setName,
  brand,
  setBrand,
  code,
  setCode,
  unit,
  setUnit,
  photos,
  onPickPhoto,
  uploading,
  opening,
  autoFocusName,
}: {
  name: string
  setName: (v: string) => void
  brand: string
  setBrand: (v: string) => void
  code: string
  setCode: (v: string) => void
  unit: string
  setUnit: (v: string) => void
  photos: ProductPhotoThumb[]
  onPickPhoto: () => void
  uploading?: boolean
  /** موجودی اولیه — فقط در صفحهٔ کالاها */
  opening?: {
    stock: string
    setStock: (v: string) => void
    cost: number
    setCost: (n: number) => void
  }
  autoFocusName?: boolean
}) {
  const [openBrand, setOpenBrand] = useState(!!brand)
  const [openCode, setOpenCode] = useState(!!code)
  const openingQty = opening ? Number(opening.stock.replace(/[^\d.]/g, "")) || 0 : 0

  return (
    <div className="space-y-5 pb-1">
      <section>
        <GroupTitle title="اطلاعات اصلی" />
        <Group>
          <InlineField label="نام کالا">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً الکترود E7018 قطر ۳٫۲"
              autoFocus={autoFocusName}
              className={bareInput}
            />
          </InlineField>
          <div className="px-3.5 pb-3 pt-2.5">
            <span className="text-caption font-bold text-foreground/70">واحد شمارش</span>
            <Select
              size="sm"
              value={unit}
              onChange={setUnit}
              title="واحد شمارش"
              aria-label="واحد شمارش"
              className="mt-2 h-11 w-full max-w-none"
              options={PRODUCT_UNITS.map((u) => ({ value: u, label: formatUnit(u) }))}
            />
          </div>
        </Group>
      </section>

      <section>
        <GroupTitle title="جزئیات بیشتر" hint="اختیاری" />
        <Group>
          {openBrand ? (
            <InlineField label="برند">
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="مثلاً اصفهان"
                autoFocus={!brand}
                className={bareInput}
              />
            </InlineField>
          ) : (
            <AddRow label="برند" onClick={() => setOpenBrand(true)} />
          )}
          {openCode ? (
            <InlineField label="کد کالا">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="E70-32"
                dir="ltr"
                autoFocus={!code}
                className={cn(bareInput, "text-end")}
              />
            </InlineField>
          ) : (
            <AddRow label="کد کالا" onClick={() => setOpenCode(true)} />
          )}
          {photos.length === 0 && !uploading ? (
            <AddRow label="عکس کالا" onClick={onPickPhoto} />
          ) : (
            <div className="px-3.5 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">عکس کالا</span>
                <span className="nums text-caption text-muted-foreground">{toPersianDigits(photos.length)} عکس</span>
              </div>
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                {photos.map((p) => (
                  <div key={p.key} className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted">
                    {p.url ? (
                      <button type="button" onClick={p.onOpen} className="size-full" aria-label="پیش‌نمایش عکس" disabled={!p.onOpen}>
                        <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <span className="grid size-full place-items-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                      </span>
                    )}
                    {p.isNew && (
                      <span className="absolute inset-x-0 bottom-0 bg-primary/85 text-center text-caption font-bold leading-5 text-white">
                        جدید
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={p.onRemove}
                      aria-label="حذف عکس"
                      className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-destructive"
                    >
                      <X className="size-3" strokeWidth={2.4} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onPickPhoto}
                  disabled={uploading}
                  aria-label="افزودن عکس"
                  className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                </button>
              </div>
            </div>
          )}
        </Group>
      </section>

      {opening && (
        <section>
          <GroupTitle title="موجودی از قبل" hint="قبل از حساب‌یار" />
          <Group>
            <InlineField label={`تعداد در انبار (${formatUnit(unit)})`} optional>
              <input
                value={opening.stock}
                onChange={(e) => opening.setStock(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                placeholder="۰"
                className={cn(bareInput, "nums text-end")}
              />
            </InlineField>
            {openingQty > 0 && (
              <InlineField label={`قیمت خرید هر ${formatUnit(unit)}`}>
                <AmountInput bare value={opening.cost} onChange={opening.setCost} placeholder="به تومان" showWords={false} />
              </InlineField>
            )}
          </Group>
          <p className="mt-1.5 px-1 text-caption leading-5 text-muted-foreground">
            {openingQty > 0
              ? "قیمت خرید برای حساب درست سود موقع فروش همین موجودی لازم است."
              : "اگر الان از این کالا دارید، تعدادش را بزنید؛ بعد از آن موجودی با فاکتورها به‌روز می‌شود."}
          </p>
        </section>
      )}
    </div>
  )
}
