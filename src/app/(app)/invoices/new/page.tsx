"use client"

/**
 * فاکتور جدید — خرید/فروش چندقلمی با انتخاب شخص (افزودن سریع)،
 * پرداخت نقدی/چک/نسیه. موبایل‌محور با باتم‌شیت.
 */
import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  UserPlus,
  Users,
  Plus,
  Trash2,
  PackagePlus,
  Banknote,
  PlusCircle,
  CheckSquare2,
  FileText,
  Loader2,
  Search,
  Package,
  Building2,
  Pencil,
} from "lucide-react"
import { apiGet, apiPost } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField, todayKey } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BANKS, getBank } from "@/lib/banks"
import { cn } from "@/lib/utils"

// ───────── تایپ‌ها ─────────
interface Person {
  id: string
  name: string
  phone: string | null
  company: string | null
  role: string
}
interface Product {
  id: string
  name: string
  brand: string | null
  code: string | null
  unit: string
}
interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}
interface DraftItem {
  productId: string
  name: string
  brand: string | null
  code: string | null
  unit: string
  quantity: number
  unitPrice: number
}
interface DraftCheck {
  amount: number
  bankKey: string
  serial: string
  dueDate: string
}

const UNITS = ["عدد", "کیلوگرم", "پاکت", "کارتن", "متر", "بسته"] as const

function NewInvoicePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [type, setType] = useState<"SALE" | "PURCHASE">(
    searchParams.get("type") === "PURCHASE" ? "PURCHASE" : "SALE"
  )
  const [date, setDate] = useState(todayKey())
  const [person, setPerson] = useState<Person | null>(null)
  const [items, setItems] = useState<DraftItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [paidCash, setPaidCash] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [checks, setChecks] = useState<DraftCheck[]>([])
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  // شیت‌ها
  const [personSheet, setPersonSheet] = useState(false)
  const [personFormSheet, setPersonFormSheet] = useState(false)
  const [itemSheet, setItemSheet] = useState(false)
  const [accountSheet, setAccountSheet] = useState(false)
  const [checkSheet, setCheckSheet] = useState(false)

  const { data: peopleData } = useQuery({
    queryKey: ["people", "all"],
    queryFn: () => apiGet<{ people: Person[] }>("/api/people"),
  })
  const { data: productsData } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => apiGet<{ products: Product[] }>("/api/products"),
  })
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
  })

  const accounts = accountsData?.accounts ?? []

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0),
    [items]
  )
  const total = Math.max(0, subtotal - discount)
  const checkTotal = checks.reduce((s, c) => s + c.amount, 0)
  const credit = Math.max(0, total - paidCash - checkTotal)

  const personTypeLabel = type === "SALE" ? "مشتری" : "تأمین‌کننده"

  const submit = async () => {
    if (!person) return toast.error("ابتدا شخص را انتخاب کنید")
    if (items.length === 0) return toast.error("حداقل یک قلم اضافه کنید")
    setSaving(true)
    try {
      const r = await apiPost<{ invoice: { id: string; number: number } }>("/api/invoices", {
        type,
        personId: person.id,
        date,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        discount,
        accountId: account?.id ?? null,
        paidCash,
        checks: checks.map((c) => ({
          amount: c.amount,
          bankKey: c.bankKey,
          serial: c.serial || undefined,
          dueDate: c.dueDate,
        })),
        note: note || undefined,
      })
      toast.success(`فاکتور شماره ${toPersianDigits(r.invoice.number)} ثبت شد ✅`)
      await queryClient.invalidateQueries()
      router.push(`/invoices/${r.invoice.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ثبت فاکتور ناموفق بود")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-2">
      {/* نوع فاکتور */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">فاکتور جدید</h1>
        <div className="flex rounded-2xl bg-muted p-1">
          {(["SALE", "PURCHASE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t)
                setPerson(null)
              }}
              className={cn(
                "rounded-xl px-4 py-2 text-xs font-bold transition-all",
                type === t
                  ? t === "SALE"
                    ? "bg-income text-white shadow-sm"
                    : "bg-destructive text-white shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {t === "SALE" ? "فروش" : "خرید"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {/* ───────── شخص ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Users className="size-4 text-primary" />
            {type === "SALE" ? "فروختم به" : "خریدم از"}
          </div>
          {person ? (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {person.company ? <Building2 className="size-5" /> : <Users className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{person.name}</div>
                <div className="nums truncate text-[0.7rem] text-muted-foreground">
                  {[person.phone, person.company].filter(Boolean).join(" • ") || personTypeLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPersonSheet(true)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-accent"
                aria-label="تغییر شخص"
              >
                <Pencil className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPersonSheet(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <UserPlus className="size-4" />
              انتخاب {personTypeLabel}
            </button>
          )}
        </section>

        {/* ───────── اقلام ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Package className="size-4 text-primary" />
            اقلام فاکتور
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">
                    {item.name}
                    {item.brand ? <span className="text-muted-foreground"> — {item.brand}</span> : null}
                  </div>
                  <div className="nums mt-1 text-[0.7rem] text-muted-foreground">
                    {toPersianDigits(item.quantity)} {item.unit} ×{" "}
                    {formatToman(item.unitPrice, false)} ={" "}
                    <span className="font-bold text-foreground">
                      {formatToman(Math.round(item.quantity * item.unitPrice), false)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="rounded-xl p-2 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="حذف قلم"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setItemSheet(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <PackagePlus className="size-4" />
              افزودن جنس
            </button>
          </div>

          {items.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-dashed pt-3 text-sm">
              <span className="text-muted-foreground">جمع اقلام</span>
              <span className="nums font-extrabold">{formatToman(subtotal, false)}</span>
            </div>
          )}
        </section>

        {/* ───────── پرداخت ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Banknote className="size-4 text-primary" />
            پرداخت
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                تاریخ فاکتور
              </label>
              <JalaliDateField value={date} onChange={setDate} />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                تخفیف (تومان)
              </label>
              <AmountInput value={discount} onChange={setDiscount} placeholder="بدون تخفیف" showWords={false} />
            </div>
          </div>

          {/* نقدی */}
          <div className="mt-4 rounded-2xl bg-muted/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  نقدی پرداخت شد
                </label>
                <AmountInput
                  value={paidCash}
                  onChange={(n) => {
                    setPaidCash(n)
                    if (n > 0 && !account) setAccountSheet(true)
                  }}
                  placeholder="۰"
                  showWords={false}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  از حساب بانکی
                </label>
                {paidCash > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAccountSheet(true)}
                    className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3"
                  >
                    {account ? (
                      <>
                        <BankLogo bankKey={account.bankKey} size={30} />
                        <span className="min-w-0 flex-1 truncate text-start text-sm">{account.name}</span>
                        <span className="nums text-[0.65rem] text-muted-foreground">
                          {formatToman(account.balance, false)}
                        </span>
                      </>
                    ) : (
                      <span className="w-full text-center text-sm text-muted-foreground">
                        انتخاب حساب…
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex h-12 items-center rounded-xl border border-border/50 bg-muted/30 px-3 text-xs text-muted-foreground">
                    اگر نقدی بدهید، حساب را انتخاب می‌کنید
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* چک‌ها */}
          <div className="mt-3 rounded-2xl bg-muted/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold">چک‌ها</span>
              {checks.length > 0 && (
                <span className="nums text-[0.7rem] text-muted-foreground">
                  جمع: {formatToman(checkTotal, false)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {checks.map((c, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2"
                >
                  <BankLogo bankKey={c.bankKey} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                    <div className="nums text-[0.65rem] text-muted-foreground">
                      سررسید: {c.dueDate.replace(/-/g, "/")}
                      {c.serial ? ` • ${c.serial}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChecks(checks.filter((_, i) => i !== idx))}
                    className="rounded-lg p-1.5 text-destructive/70 hover:bg-destructive/10"
                    aria-label="حذف چک"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCheckSheet(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
              >
                <PlusCircle className="size-4" />
                افزودن چک
              </button>
            </div>
          </div>

          {/* مانده / نسیه */}
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-2xl px-4 py-3",
              credit > 0 ? "bg-warning/10 text-warning" : "bg-income/10 text-income"
            )}
          >
            <span className="text-xs font-bold">
              {credit > 0 ? "مانده روی حساب (نسیه)" : "تسویه کامل ✅"}
            </span>
            <span className="nums text-sm font-extrabold">{formatToman(credit, false)}</span>
          </div>

          <div className="mt-3">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="یادداشت فاکتور (اختیاری)"
              className="bg-card text-sm"
            />
          </div>
        </section>
      </div>

      {/* ───────── نوار چسبان پایین ───────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/92 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-3 backdrop-blur-md lg:pb-5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[0.65rem] text-muted-foreground">مبلغ نهایی فاکتور</div>
            <div className="nums truncate text-base font-extrabold sm:text-lg">
              {formatToman(total, false)}
              <span className="ms-1 text-[0.65rem] font-medium text-muted-foreground">تومان</span>
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={saving || !person || items.length === 0}
            className={cn(
              "h-12 rounded-2xl px-8 text-sm font-bold shadow-fab",
              type === "SALE" ? "bg-income hover:bg-income/90" : "bg-destructive hover:bg-destructive/90"
            )}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            ثبت فاکتور
          </Button>
        </div>
      </div>

      {/* ───────── شیت‌ها ───────── */}
      <PersonPickerSheet
        open={personSheet}
        onClose={() => setPersonSheet(false)}
        people={peopleData?.people ?? []}
        type={type}
        onPick={(p) => {
          setPerson(p)
          setPersonSheet(false)
        }}
        onQuickAdd={() => {
          setPersonSheet(false)
          setPersonFormSheet(true)
        }}
      />
      <QuickPersonSheet
        open={personFormSheet}
        onClose={() => setPersonFormSheet(false)}
        type={type}
        onCreated={(p) => {
          setPerson(p)
          setPersonFormSheet(false)
        }}
      />
      <ItemPickerSheet
        open={itemSheet}
        onClose={() => setItemSheet(false)}
        products={productsData?.products ?? []}
        onAdd={(item) => {
          setItems((prev) => [...prev, item])
          setItemSheet(false)
        }}
      />
      <BottomSheet
        open={accountSheet}
        onClose={() => setAccountSheet(false)}
        title="حساب بانکی"
        description="نقدی از/به کدام حساب؟"
      >
        <div className="space-y-2">
          {accounts.map((a) => (
            <SheetOption
              key={a.id}
              icon={<BankLogo bankKey={a.bankKey} size={40} showBg={false} />}
              title={a.name}
              subtitle={`${getBank(a.bankKey).name} • مانده: ${formatToman(a.balance, false)}`}
              selected={account?.id === a.id}
              onClick={() => {
                setAccount(a)
                setAccountSheet(false)
              }}
            />
          ))}
          {accounts.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              حساب بانکی ثبت نشده — از بخش «حساب‌های بانکی» اضافه کنید
            </p>
          )}
        </div>
      </BottomSheet>
      <QuickCheckSheet
        open={checkSheet}
        onClose={() => setCheckSheet(false)}
        onAdd={(c) => {
          setChecks((prev) => [...prev, c])
          setCheckSheet(false)
        }}
        suggestedAmount={Math.max(0, total - paidCash - checkTotal)}
      />
    </div>
  )
}

// ═══════════════ شیت انتخاب شخص ═══════════════
function PersonPickerSheet({
  open,
  onClose,
  people,
  type,
  onPick,
  onQuickAdd,
}: {
  open: boolean
  onClose: () => void
  people: Person[]
  type: "SALE" | "PURCHASE"
  onPick: (p: Person) => void
  onQuickAdd: () => void
}) {
  const [q, setQ] = useState("")
  const filtered = people.filter(
    (p) =>
      !q ||
      p.name.includes(q) ||
      (p.company ?? "").includes(q) ||
      (p.phone ?? "").includes(q)
  )
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={type === "SALE" ? "انتخاب مشتری" : "انتخاب تأمین‌کننده"}
      size="tall"
      footer={
        <Button onClick={onQuickAdd} className="h-12 w-full rounded-2xl font-bold">
          <UserPlus className="size-4" />
          افزودن شخص جدید
        </Button>
      }
    >
      <div className="relative mb-3">
        <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نام یا موبایل…"
          className="h-11 w-full rounded-xl border border-input bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
        />
      </div>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pe-1">
        {filtered.map((p) => (
          <SheetOption
            key={p.id}
            icon={<Users className="size-5" />}
            title={p.name}
            subtitle={[p.company, p.phone].filter(Boolean).join(" • ") || undefined}
            onClick={() => onPick(p)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">شخصی پیدا نشد</p>
        )}
      </div>
    </BottomSheet>
  )
}

// ═══════════════ شیت افزودن سریع شخص ═══════════════
function QuickPersonSheet({
  open,
  onClose,
  type,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  type: "SALE" | "PURCHASE"
  onCreated: (p: Person) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [shopAddress, setShopAddress] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    setSaving(true)
    try {
      const r = await apiPost<{ person: Person }>("/api/people", {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role: type === "SALE" ? "CUSTOMER" : "SUPPLIER",
      })
      toast.success("شخص اضافه شد ✅")
      setName("")
      setPhone("")
      setCompany("")
      setShopAddress("")
      onCreated(r.person)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت شخص")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="افزودن شخص جدید"
      size="tall"
      footer={
        <Button onClick={submit} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          ذخیره و انتخاب
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نام *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً آهنگری رحیمی" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            شماره موبایل
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09…"
            className="nums h-10 w-full rounded-xl border border-input bg-card px-3 text-end text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            اسم شرکت / کارگاه (اختیاری)
          </label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="مثلاً فنی قلندری" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            آدرس مغازه (اختیاری)
          </label>
          <Input
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="مثلاً بازار آهن، پلاک ۴۵"
          />
        </div>
      </div>
    </BottomSheet>
  )
}

// ═══════════════ شیت افزودن قلم (جنس) ═══════════════
function ItemPickerSheet({
  open,
  onClose,
  products,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  products: Product[]
  onAdd: (item: DraftItem) => void
}) {
  const [mode, setMode] = useState<"pick" | "new">("pick")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(0)
  const [unitPrice, setUnitPrice] = useState(0)
  const [unit, setUnit] = useState<string>("عدد")
  // جنس جدید
  const [name, setName] = useState("")
  const [brand, setBrand] = useState("")
  const [code, setCode] = useState("")

  const reset = () => {
    setMode("pick")
    setQ("")
    setSelected(null)
    setQuantity(0)
    setUnitPrice(0)
    setName("")
    setBrand("")
    setCode("")
  }

  const filtered = products.filter(
    (p) => !q || p.name.includes(q) || (p.brand ?? "").includes(q) || (p.code ?? "").includes(q)
  )

  const addItem = async () => {
    if (quantity <= 0) return toast.error("تعداد را وارد کنید")
    let productId: string
    let finalName: string
    let finalBrand: string | null
    let finalCode: string | null
    let finalUnit: string

    if (mode === "new") {
      if (name.trim().length < 2) return toast.error("نام جنس را وارد کنید")
      try {
        const r = await apiPost<{ product: Product }>("/api/products", {
          name: name.trim(),
          brand: brand || undefined,
          code: code || undefined,
          unit,
        })
        productId = r.product.id
        finalName = r.product.name
        finalBrand = r.product.brand
        finalCode = r.product.code
        finalUnit = r.product.unit
      } catch (e) {
        return toast.error(e instanceof Error ? e.message : "خطا در ثبت جنس")
      }
    } else {
      if (!selected) return toast.error("جنس را انتخاب کنید")
      productId = selected.id
      finalName = selected.name
      finalBrand = selected.brand
      finalCode = selected.code
      finalUnit = selected.unit
    }
    onAdd({
      productId,
      name: finalName,
      brand: finalBrand,
      code: finalCode,
      unit: finalUnit,
      quantity,
      unitPrice,
    })
    reset()
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="افزودن جنس به فاکتور"
      size="tall"
      footer={
        <Button
          onClick={addItem}
          disabled={mode === "pick" ? !selected : name.trim().length < 2}
          className="h-12 w-full rounded-2xl font-bold"
        >
          <Plus className="size-4" />
          افزودن به فاکتور
        </Button>
      }
    >
      {/* تب انتخاب/جدید */}
      <div className="mb-3 flex rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => {
            setMode("pick")
            setSelected(null)
          }}
          className={cn(
            "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
            mode === "pick" ? "bg-card shadow-sm" : "text-muted-foreground"
          )}
        >
          انتخاب از اجناس
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold transition-all",
            mode === "new" ? "bg-card shadow-sm" : "text-muted-foreground"
          )}
        >
          <PackagePlus className="size-3.5" />
          جنس جدید
        </button>
      </div>

      {mode === "pick" ? (
        <>
          <div className="relative mb-3">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی نام جنس یا برند…"
              className="h-11 w-full rounded-xl border border-input bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <div className="mb-3 max-h-56 space-y-2 overflow-y-auto pe-1">
            {filtered.map((p) => (
              <SheetOption
                key={p.id}
                icon={<Package className="size-4" />}
                title={p.name}
                subtitle={[p.brand, p.code].filter(Boolean).join(" • ") || `واحد: ${p.unit}`}
                selected={selected?.id === p.id}
                onClick={() => setSelected(p)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                جنس موجود نیست — از تب «جنس جدید» بسازید
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              نام جنس *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً الکترود E6013 قطر ۳.۲"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                برند (اختیاری)
              </label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="اصفهان" />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                کد جنس (اختیاری)
              </label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="E60-32" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">واحد</label>
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
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* تعداد و قیمت */}
      {(mode === "new" || selected) && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">تعداد *</label>
            <input
              value={quantity || ""}
              onChange={(e) => {
                const latin = e.target.value.replace(/[^\d.]/g, "")
                setQuantity(latin ? Number(latin) : 0)
              }}
              inputMode="decimal"
              dir="ltr"
              className="nums h-11 w-full rounded-xl border border-input bg-card px-3 text-end text-base font-bold outline-none focus-visible:border-ring"
              placeholder="۱"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              قیمت واحد (تومان) *
            </label>
            <AmountInput value={unitPrice} onChange={setUnitPrice} showWords={false} />
          </div>
          <div className="col-span-2 text-center text-[0.7rem] text-muted-foreground">
            جمع این قلم:{" "}
            <span className="nums font-bold text-foreground">
              {formatToman(Math.round(quantity * unitPrice), false)}
            </span>{" "}
            تومان
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

// ═══════════════ شیت افزودن چک ═══════════════
function QuickCheckSheet({
  open,
  onClose,
  onAdd,
  suggestedAmount,
}: {
  open: boolean
  onClose: () => void
  onAdd: (c: DraftCheck) => void
  suggestedAmount: number
}) {
  const [amount, setAmount] = useState(0)
  const [bankKey, setBankKey] = useState("mellat")
  const [serial, setSerial] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [bankSheet, setBankSheet] = useState(false)

  const reset = () => {
    setAmount(0)
    setBankKey("mellat")
    setSerial("")
    setDueDate("")
  }

  const add = () => {
    if (amount <= 0) return toast.error("مبلغ چک را وارد کنید")
    if (!dueDate) return toast.error("سررسید چک را انتخاب کنید")
    onAdd({ amount, bankKey, serial, dueDate })
    reset()
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="افزودن چک"
      size="tall"
      footer={
        <Button onClick={add} className="h-12 w-full rounded-2xl font-bold">
          <CheckSquare2 className="size-4" />
          افزودن چک
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            مبلغ چک (تومان) *
          </label>
          <AmountInput value={amount} onChange={setAmount} />
          {suggestedAmount > 0 && amount === 0 && (
            <button
              type="button"
              onClick={() => setAmount(suggestedAmount)}
              className="mt-1.5 text-[0.7rem] font-medium text-primary hover:underline"
            >
              استفاده از مانده فاکتور ({formatToman(suggestedAmount, false)})
            </button>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            بانک چک *
          </label>
          <button
            type="button"
            onClick={() => setBankSheet(true)}
            className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3"
          >
            <BankLogo bankKey={bankKey} size={34} />
            <span className="flex-1 text-start text-sm">{getBank(bankKey).name}</span>
            <span className="text-[0.65rem] text-muted-foreground">تغییر</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              شماره سریال
            </label>
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder="مثلاً ۸۸۴۵۱۲"
              className="nums h-12 w-full rounded-xl border border-input bg-card px-3 text-end text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              سررسید *
            </label>
            <JalaliDateField value={dueDate} onChange={setDueDate} />
          </div>
        </div>
      </div>

      <BottomSheet
        open={bankSheet}
        onClose={() => setBankSheet(false)}
        title="بانک چک"
        size="tall"
      >
        <div className="grid grid-cols-2 gap-2">
          {BANKS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => {
                setBankKey(b.key)
                setBankSheet(false)
              }}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2.5 text-start transition-all active:scale-[0.98]",
                bankKey === b.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:bg-accent/60"
              )}
            >
              <BankLogo bankKey={b.key} size={36} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{b.name}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </BottomSheet>
  )
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <NewInvoicePageInner />
    </Suspense>
  )
}
