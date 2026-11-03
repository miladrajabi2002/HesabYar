"use client"

/**
 * فیلدهای فرم شخص (نسخهٔ ۷) — مشترک بین «شخص جدید» (اشخاص)، «افزودن سریع» (فاکتور) و «ویرایش شخص»
 *  • نوع شخص: سه کارت آیکون‌دار (همان آیکون آواتار نقش)
 *  • «اطلاعات اصلی»: نام (اجباری) + موبایل؛ شرکت و آدرس در «جزئیات بیشتر» جمع می‌شوند
 *  • «حساب از قبل»: جملهٔ روشن («به ما بدهکار است / ما بدهکاریم / ندارد») + مبلغ با حروف
 */
import { useState, type ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { AmountInput } from "@/components/ui/amount-input"
import { RoleAvatar } from "@/components/ui/role-avatar"
import { cn } from "@/lib/utils"

export type PersonRole = "CUSTOMER" | "SUPPLIER" | "BOTH"
export type OpeningKind = "none" | "receivable" | "payable"

function GroupTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h3 className="text-label font-extrabold text-foreground/85">{title}</h3>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** فیلد درون‌گروهی: برچسب کوچک بالا، ورودی بدون قاب زیرش (الگوی فهرست گروهی) */
function InlineField({
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

const bareInput =
  "h-9 w-full bg-transparent text-body font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[3.25rem] w-full items-center gap-3 px-3.5 text-start transition-colors hover:bg-accent/40"
    >
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="text-label text-muted-foreground">افزودن</span>
      <ChevronLeft className="size-4 text-muted-foreground/60" />
    </button>
  )
}

const ROLES: { key: PersonRole; label: string }[] = [
  { key: "CUSTOMER", label: "مشتری" },
  { key: "SUPPLIER", label: "فروشنده" },
  { key: "BOTH", label: "هر دو" },
]

const OPENING: { key: OpeningKind; label: string }[] = [
  { key: "none", label: "ندارد" },
  { key: "receivable", label: "به ما بدهکار است" },
  { key: "payable", label: "ما بدهکاریم" },
]

export function PersonFields({
  name,
  setName,
  phone,
  setPhone,
  company,
  setCompany,
  shopAddress,
  setShopAddress,
  role,
  setRole,
  openingKind,
  setOpeningKind,
  openingAmount,
  setOpeningAmount,
  autoFocusName,
}: {
  name: string
  setName: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  company: string
  setCompany: (v: string) => void
  shopAddress: string
  setShopAddress: (v: string) => void
  /** بدون role، انتخاب نوع نمایش داده نمی‌شود (افزودن سریع از فاکتور) */
  role?: PersonRole
  setRole?: (r: PersonRole) => void
  openingKind: OpeningKind
  setOpeningKind: (k: OpeningKind) => void
  openingAmount: number
  setOpeningAmount: (n: number) => void
  autoFocusName?: boolean
}) {
  // جزئیات بیشتر: ردیف «افزودن ›» تا وقتی لمس نشده یا مقدار ندارد
  const [openCompany, setOpenCompany] = useState(!!company)
  const [openAddress, setOpenAddress] = useState(!!shopAddress)

  return (
    <div className="space-y-5 pb-1">
      {role && setRole && (
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => {
            const on = role === r.key
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] px-1 py-2.5 text-label font-bold transition-colors",
                  on ? "border-primary bg-primary/5 text-secondary-foreground" : "border-border text-foreground/75 hover:bg-accent/50"
                )}
              >
                <RoleAvatar role={r.key} size={32} />
                {r.label}
              </button>
            )
          })}
        </div>
      )}

      <section>
        <GroupTitle title="اطلاعات اصلی" />
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card">
          <InlineField label="نام">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً آهنگری رحیمی"
              autoFocus={autoFocusName}
              className={bareInput}
            />
          </InlineField>
          <InlineField label="موبایل" optional>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              placeholder="09…"
              className={cn(bareInput, "nums text-end")}
            />
          </InlineField>
        </div>
      </section>

      <section>
        <GroupTitle title="جزئیات بیشتر" hint="اختیاری" />
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card">
          {openCompany ? (
            <InlineField label="شرکت یا مغازه">
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="مثلاً فنی قلندری"
                autoFocus={!company}
                className={bareInput}
              />
            </InlineField>
          ) : (
            <AddRow label="شرکت یا مغازه" onClick={() => setOpenCompany(true)} />
          )}
          {openAddress ? (
            <InlineField label="آدرس">
              <input
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="مثلاً بازار آهن، پلاک ۴۵"
                autoFocus={!shopAddress}
                className={bareInput}
              />
            </InlineField>
          ) : (
            <AddRow label="آدرس" onClick={() => setOpenAddress(true)} />
          )}
        </div>
      </section>

      <section>
        <GroupTitle title="حساب از قبل" hint="قبل از حساب‌یار" />
        <div className="rounded-2xl border border-border/80 bg-card p-3">
          <div className="flex rounded-md bg-muted p-1">
            {OPENING.map((k) => {
              const on = openingKind === k.key
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setOpeningKind(k.key)}
                  aria-pressed={on}
                  className={cn(
                    "h-9 flex-1 rounded-sm px-1 text-label font-bold transition-colors",
                    on
                      ? cn(
                          "bg-card shadow-[0_1px_2px_rgb(16_24_40/0.08)]",
                          k.key === "receivable" ? "text-warning-ink" : k.key === "payable" ? "text-purchase" : "text-foreground"
                        )
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k.label}
                </button>
              )
            })}
          </div>
          {openingKind !== "none" && (
            <div className="mt-2 px-1">
              <AmountInput bare value={openingAmount} onChange={setOpeningAmount} placeholder="مبلغ به تومان" className="[&_input]:h-12 [&_input]:text-xl [&_input]:font-extrabold" />
              <p className="text-caption text-muted-foreground">
                {openingKind === "receivable"
                  ? "به‌عنوان طلب شما در حساب این شخص ثبت می‌شود."
                  : "به‌عنوان بدهی شما به این شخص ثبت می‌شود."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
