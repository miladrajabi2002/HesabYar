"use client"

/**
 * فیلدهای فرم شخص (نسخهٔ ۷) — مشترک بین «شخص جدید» (اشخاص)، «افزودن سریع» (فاکتور) و «ویرایش شخص»
 *  • نوع شخص: سه کارت آیکون‌دار (همان آیکون آواتار نقش)
 *  • «اطلاعات اصلی»: نام (اجباری) + موبایل؛ شرکت و آدرس در «جزئیات بیشتر» جمع می‌شوند
 *  • «حساب از قبل»: جملهٔ روشن («به ما بدهکار است / ما بدهکاریم / ندارد») + مبلغ با حروف
 */
import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { RoleAvatar } from "@/components/ui/role-avatar"
import { cn } from "@/lib/utils"

export type PersonRole = "CUSTOMER" | "SUPPLIER" | "BOTH"
export type OpeningKind = "none" | "receivable" | "payable"

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h3 className="text-label font-extrabold text-foreground/85">{title}</h3>
        {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-label font-bold text-foreground/80">
        {label}
        {optional && <span className="text-caption font-medium text-muted-foreground">اختیاری</span>}
      </span>
      {children}
    </label>
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
  // جزئیات بیشتر: اگر از قبل مقدار دارد (ویرایش)، باز شروع شود
  const [more, setMore] = useState(!!(company || shopAddress))

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

      <Group title="اطلاعات اصلی">
        <Field label="نام">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً آهنگری رحیمی"
            autoFocus={autoFocusName}
          />
        </Field>
        <Field label="موبایل" optional>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09…"
            className="nums text-end"
          />
        </Field>
      </Group>

      <section>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex w-full items-center justify-between rounded-xl px-0.5 py-1 text-label font-extrabold text-foreground/85"
        >
          <span>
            جزئیات بیشتر <span className="text-caption font-medium text-muted-foreground">شرکت و آدرس · اختیاری</span>
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", more && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {more && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-2">
                <Field label="شرکت یا مغازه">
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="مثلاً فنی قلندری" />
                </Field>
                <Field label="آدرس">
                  <Input
                    value={shopAddress}
                    onChange={(e) => setShopAddress(e.target.value)}
                    placeholder="مثلاً بازار آهن، پلاک ۴۵"
                  />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <Group title="حساب از قبل" hint="مانده قبل از شروع کار با حساب‌یار">
        <div className="flex rounded-[0.9rem] bg-muted p-1">
          {OPENING.map((k) => {
            const on = openingKind === k.key
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setOpeningKind(k.key)}
                aria-pressed={on}
                className={cn(
                  "h-9 flex-1 rounded-[0.65rem] px-1 text-label font-bold transition-colors",
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
          <div>
            <AmountInput value={openingAmount} onChange={setOpeningAmount} />
            <p className="mt-1 text-caption text-muted-foreground">
              {openingKind === "receivable"
                ? "این مبلغ به‌عنوان طلب شما در حساب این شخص ثبت می‌شود."
                : "این مبلغ به‌عنوان بدهی شما به این شخص ثبت می‌شود."}
            </p>
          </div>
        )}
      </Group>
    </div>
  )
}
