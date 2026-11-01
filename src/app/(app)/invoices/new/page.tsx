"use client"

/**
 * فاکتور جدید — خرید/فروش چندقلمی با انتخاب شخص (افزودن سریع)،
 * پرداخت نقدی/چک/نسیه. موبایل‌محور با باتم‌شیت.
 * IMP-05: دکمه ثبت بومی تلگرام • IMP-08: ذخیره خودکار پیش‌نویس
 * MO-02: جشن موفقیت + هپتیک • UI-08: جمع زنده با انیمیشن،
 * جابجایی اقلام با dnd-kit + اعتبارسنجی زندهٔ اقلام و تخفیف
 * ADV-05: عکس جنس جدید (اختیاری) در همین شیت + بندانگشتی عکس در انتخاب اجناس
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AnimatePresence, motion } from "framer-motion"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
  GripVertical,
  Sparkles,
  BadgeCheck,
  Paperclip,
  UserRound,
  IdCard,
  CheckCircle2,
  ImagePlus,
  X,
} from "lucide-react"
import { apiGet, apiPost, apiPut } from "@/lib/api-client"
import { postAttachmentForm, useAttachmentUrls } from "@/lib/attachment-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { jalaliDayKey } from "@/lib/jalali"
import { normalizeDigits } from "@/lib/digits"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { NumberInput } from "@/components/ui/number-input"
import { JalaliDateField, todayKey } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BANKS, getBank } from "@/lib/banks"
import { formatUnit, PRODUCT_UNITS } from "@/lib/units"
import { cn } from "@/lib/utils"
import { useTelegram, useTelegramBackButton, useTelegramMainButton } from "@/hooks/use-telegram"
import { SuccessCelebration } from "@/components/ui/success-celebration"

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
  /** عکس جنس (اختیاری) — شناسهٔ اولین پیوست تصویری (ADV-05) */
  photoId: string | null
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

/** ردیف قلم با شناسهٔ پایدار برای جابجایی dnd-kit (UI-08) */
type InvoiceItemRow = DraftItem & { rowId: string }
let itemRowSeq = 0
const genRowId = () => `item-${++itemRowSeq}`
interface DraftCheck {
  amount: number
  bankKey: string
  serial: string
  dueDate: string
  // شناسهٔ چک قدیم در حالت ویرایش — به‌روزرسانی درجا در PUT (حفظ id و پیوست‌های تصویری)
  id?: string
  // ثبت چک (نسخهٔ ۳) — عکس چک بعد از ثبت فاکتور آپلود می‌شود (مستقل از وضعیت ثبت)
  isRegistered?: boolean
  registeredName?: string
  registeredNationalId?: string
  photo?: File | null
}

/** فاکتور دریافتی برای حالت ویرایش (?edit=<id>) */
interface EditInvoice {
  id: string
  number: number
  type: string
  date: string
  discount: number
  paidCash: number
  note: string | null
  person: { id: string; name: string; phone: string | null; company: string | null; role: string }
  account: { id: string; name: string; bankKey: string } | null
  items: {
    productId: string
    productName: string
    brand: string | null
    code: string | null
    unit: string
    quantity: number
    unitPrice: number
  }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    dueDate: string
    status: string
    isRegistered: boolean
    registeredName: string | null
    registeredNationalId: string | null
  }[]
}


function NewInvoicePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { haptic } = useTelegram()
  const [celebrate, setCelebrate] = useState(false)

  const [type, setType] = useState<"SALE" | "PURCHASE">(
    searchParams.get("type") === "PURCHASE" ? "PURCHASE" : "SALE"
  )
  const [date, setDate] = useState(todayKey())
  const [person, setPerson] = useState<Person | null>(null)
  const [items, setItems] = useState<InvoiceItemRow[]>([])
  const [discount, setDiscount] = useState(0)
  const [paidCash, setPaidCash] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [checks, setChecks] = useState<DraftCheck[]>([])
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  // UI-08: اعتبارسنجی زنده — خطاها فقط بعد از تعامل کاربر نمایش داده می‌شوند (نه روی باز شدن فرم)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [discountTouched, setDiscountTouched] = useState(false)

  // حالت ویرایش: /invoices/new?edit=<id>
  const editId = searchParams.get("edit")
  const editAccountIdRef = useRef<string | null>(null)
  const hydratedRef = useRef(false)

  const { data: editData } = useQuery({
    queryKey: ["invoice", editId],
    queryFn: () => apiGet<{ invoice: EditInvoice }>(`/api/invoices/${editId}`),
    enabled: !!editId,
  })

  // پیش‌فرض‌های ویرایش — فقط یک‌بار پس از دریافت فاکتور
  useEffect(() => {
    if (!editData?.invoice || hydratedRef.current) return
    hydratedRef.current = true
    const inv = editData.invoice
    setType(inv.type as "SALE" | "PURCHASE")
    setDate(jalaliDayKey(new Date(inv.date)))
    setPerson({ ...inv.person })
    setItems(
      inv.items.map((it) => ({
        rowId: genRowId(),
        productId: it.productId,
        name: it.productName,
        brand: it.brand,
        code: it.code,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      }))
    )
    setDiscount(inv.discount)
    setPaidCash(inv.paidCash)
    setChecks(
      inv.checks.map((c) => ({
        // id چک قدیم → در PUT به‌جای بازسازی، درجا به‌روز می‌شود → عکس و ثبت حفظ می‌ماند
        id: c.id,
        amount: c.amount,
        bankKey: c.bankKey,
        serial: c.serial,
        dueDate: jalaliDayKey(new Date(c.dueDate)),
        isRegistered: c.isRegistered,
        registeredName: c.registeredName ?? undefined,
        registeredNationalId: c.registeredNationalId ?? undefined,
      }))
    )
    setNote(inv.note ?? "")
    editAccountIdRef.current = inv.account?.id ?? null
  }, [editData])

  // IMP-08: ذخیره خودکار پیش‌نویس — اگر مینی‌اپ وسط کار بسته شود اقلام نیمه‌کاره از بین نمی‌روند
  const DRAFT_KEY = "hesabyar-invoice-draft-v1"
  const draftHydratedRef = useRef(false)
  useEffect(() => {
    if (editId || draftHydratedRef.current) return
    draftHydratedRef.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as {
        type: "SALE" | "PURCHASE"
        date: string
        person: Person | null
        items: DraftItem[]
        discount: number
        paidCash: number
        accountId: string | null
        checks: DraftCheck[]
        note: string
        savedAt: number
      }
      // فقط پیش‌نویس‌های تازه (۴۸ ساعت) و غیرخالی
      const isMeaningful = (d.items?.length ?? 0) > 0 || !!d.person
      if (!isMeaningful || Date.now() - (d.savedAt ?? 0) > 48 * 3600_000) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      setType(d.type)
      setDate(d.date || todayKey())
      setPerson(d.person ?? null)
      setItems((d.items ?? []).map((it) => ({ ...it, rowId: genRowId() })))
      setDiscount(d.discount ?? 0)
      setPaidCash(d.paidCash ?? 0)
      setChecks(d.checks ?? [])
      setNote(d.note ?? "")
      editAccountIdRef.current = d.accountId
      toast.info("پیش‌نویس ذخیره‌شده بازیابی شد 📝")
    } catch {
      /* ignore */
    }
  }, [editId])

  // ذخیره‌ی خودکار با debounce
  useEffect(() => {
    if (editId) return
    const t = setTimeout(() => {
      try {
        const meaningful = items.length > 0 || !!person
        if (meaningful) {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({
              type,
              date,
              person,
              items,
              discount,
              paidCash,
              accountId: account?.id ?? null,
              // عکس چک (File) قابل ذخیره در پیش‌نویس نیست — فقط مشخصات
              checks: checks.map(({ photo: _photo, ...rest }) => rest),
              note,
              savedAt: Date.now(),
            })
          )
        } else {
          localStorage.removeItem(DRAFT_KEY)
        }
      } catch {
        /* ignore */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [editId, type, date, person, items, discount, paidCash, account, checks, note])

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

  // حساب نقدی فاکتور ویرایشی — پس از لود شدن لیست حساب‌ها انتخاب می‌شود
  useEffect(() => {
    const wanted = editAccountIdRef.current
    if (!wanted || account) return
    const found = accounts.find((a) => a.id === wanted)
    if (found) {
      setAccount(found)
      editAccountIdRef.current = null
    }
  }, [accounts, account])

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0),
    [items]
  )
  const total = Math.max(0, subtotal - discount)
  const checkTotal = checks.reduce((s, c) => s + c.amount, 0)
  const credit = Math.max(0, total - paidCash - checkTotal)
  // مازاد پرداخت: نقدی + چک بیشتر از مبلغ فاکتور → علی‌الحساب شخص می‌رود
  const excess = Math.max(0, paidCash + checkTotal - total)

  // ───────── UI-08: اعتبارسنجی زنده ─────────
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const personSectionRef = useRef<HTMLElement | null>(null)
  const dateFieldRef = useRef<HTMLDivElement | null>(null)
  const discountFieldRef = useRef<HTMLDivElement | null>(null)

  const itemRowErrors = useMemo(
    () =>
      items.map((it) => {
        if (!it.name?.trim()) return "نام جنس ناقص است"
        if (!(it.quantity > 0)) return "تعداد باید بیش از صفر باشد"
        if (it.unitPrice < 0) return "قیمت واحد نمی‌تواند منفی باشد"
        return null
      }),
    [items]
  )
  const hasItemErrors = itemRowErrors.some((e) => e !== null)
  // تخفیف بیشتر از جمع اقلام خطا محسوب می‌شود
  const discountExceeds = items.length > 0 && discount > subtotal
  const hasErrors = hasItemErrors || discountExceeds || !date

  // نمایش خطا فقط بعد از «لمس» — تا فرم روی باز شدن فریاد نزند
  const showPersonError = submitAttempted && !person
  const showDateError = submitAttempted && !date
  const showDiscountError = (discountTouched || submitAttempted) && discountExceeds

  // ───────── UI-08: جابجایی اقلام (dnd-kit) ─────────
  const itemIds = useMemo(() => items.map((i) => i.rowId), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  // جابجایی از همان setItems فعلی می‌گذرد تا جمع کل، پیش‌نویس و اعتبارسنجی خودکار آپدیت شوند
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const from = prev.findIndex((r) => r.rowId === String(active.id))
      const to = prev.findIndex((r) => r.rowId === String(over.id))
      if (from < 0 || to < 0 || from === to) return prev
      return arrayMove(prev, from, to)
    })
    haptic.tap()
  }

  const personTypeLabel = type === "SALE" ? "مشتری" : "فروشنده"

  // اگر فاکتور ویرایشی چک نقدشده/برگشتی دارد، فقط قابل مشاهده است
  const lockedChecks =
    !!editId && (editData?.invoice.checks.some((c) => c.status && c.status !== "PENDING") ?? false)

  // دکمه برگشت بومی تلگرام (IMP-02)
  useTelegramBackButton()

  const submitRef = useRef<() => void>(() => {})

  const submit = async () => {
    setSubmitAttempted(true)
    if (!person) {
      haptic.error()
      personSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      return toast.error("ابتدا شخص را انتخاب کنید")
    }
    if (items.length === 0) return toast.error("حداقل یک قلم اضافه کنید")
    // UI-08: خطاهای اعتبارسنجی زنده — اسکرول به اولین ردیف نامعتبر + هپتیک خطا
    if (hasErrors) {
      haptic.error()
      toast.error("چند مورد ناقص است")
      const firstBad = itemRowErrors.findIndex((e) => e !== null)
      if (firstBad >= 0) {
        rowRefs.current
          .get(items[firstBad].rowId)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      } else if (discountExceeds) {
        discountFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      } else if (!date) {
        dateFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }
    if (paidCash > 0 && !account) {
      setAccountSheet(true)
      return toast.error("برای پرداخت نقدی، حساب بانکی را انتخاب کنید")
    }
    setSaving(true)
    try {
      const payload = {
        type,
        personId: person.id,
        date,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        discount,
        accountId: account?.id ?? null,
        paidCash,
        checks: checks.map((c) => ({
          id: c.id || undefined,
          amount: c.amount,
          bankKey: c.bankKey,
          serial: c.serial || undefined,
          dueDate: c.dueDate,
          isRegistered: !!c.isRegistered,
          registeredName: c.isRegistered ? c.registeredName || undefined : undefined,
          registeredNationalId: c.isRegistered ? c.registeredNationalId || undefined : undefined,
        })),
        note: note || undefined,
      }
      const r = editId
        ? await apiPut<{ invoice: { id: string; number: number }; excess: number; queuedOffline?: boolean }>(
            `/api/invoices/${editId}`,
            payload
          )
        : await apiPost<{ invoice: { id: string; number: number }; excess: number; queuedOffline?: boolean }>("/api/invoices", payload)
      // ADV-10: اگر آفلاین صف شده باشد پاسخ متفاوت است
      if (r && (r as { queuedOffline?: boolean }).queuedOffline) {
        toast.info("آفلاین هستید — فاکتور ذخیره شد و بعد از اتصال خودکار ثبت می‌شود 📥")
        haptic.warning()
        localStorage.removeItem(DRAFT_KEY)
        await queryClient.invalidateQueries()
        router.push("/invoices")
        return
      }
      // MO-02: جشن موفقیت + هپتیک تلگرام
      setCelebrate(true)
      haptic.success()
      toast.success(
        editId
          ? `فاکتور شماره ${toPersianDigits(r.invoice.number)} ویرایش شد ✅`
          : `فاکتور شماره ${toPersianDigits(r.invoice.number)} ثبت شد ✅`
      )
      if (r.excess > 0) {
        toast.info(`مازاد ${formatToman(r.excess)} به علی‌الحساب «${person.name}» اضافه شد`)
      }
      // آپلود عکس چک‌ها (اگر داشتند) — بعد از ساخت/ویرایش فاکتور؛ مستقل از وضعیت ثبت
      // در ویرایش فقط چک‌های تازه‌اضافه فایل دارند (چک‌های قبلی پیوست سرجایشان می‌ماند)
      const createdChecks = ((r as { invoice?: { checks?: { id: string }[] } }).invoice?.checks ?? []) as { id: string }[]
      const withPhotos = checks.filter((c) => c.photo)
      if (withPhotos.length > 0 && createdChecks.length >= checks.length) {
        let uploaded = 0
        for (let i = 0; i < checks.length; i++) {
          const photo = checks[i].photo
          if (!photo || !createdChecks[i]) continue
          try {
            const fd = new FormData()
            fd.append("file", photo)
            fd.append("refType", "CHECK")
            fd.append("refId", createdChecks[i].id)
            const headers: Record<string, string> = {}
            const initData = window.Telegram?.WebApp?.initData
            if (initData) headers["x-telegram-init-data"] = initData
            const res = await fetch("/api/attachments", { method: "POST", body: fd, headers })
            if (res.ok) uploaded++
          } catch {
            /* عکس این چک آپلود نشد — بقیه ادامه می‌یابند */
          }
        }
        if (uploaded > 0) {
          toast.success(`${toPersianDigits(uploaded)} عکس چک پیوست شد 📎`)
        }
      }
      // پاک‌سازی پیش‌نویس بعد از ثبت موفق
      if (!editId) localStorage.removeItem(DRAFT_KEY)
      await queryClient.invalidateQueries()
      setTimeout(() => router.push(`/invoices/${r.invoice.id}`), 1150)
    } catch (e) {
      haptic.error()
      toast.error(e instanceof Error ? e.message : "ثبت فاکتور ناموفق بود")
    } finally {
      setSaving(false)
    }
  }
  submitRef.current = submit

  // IMP-05: دکمه ثبت بومی تلگرام — فرم با دکمه پایین خود تلگرام ثبت می‌شود
  useTelegramMainButton({
    visible: !lockedChecks,
    text: editId ? "ذخیره تغییرات" : "ثبت فاکتور",
    enabled: !!person && items.length > 0 && !saving && !hasErrors,
    loading: saving,
    color: type === "SALE" ? "#16a34a" : "#e5484d",
    onClick: () => submitRef.current(),
  })

  return (
    <div className="pb-2">
      {lockedChecks && (
        <p className="mb-3 rounded-2xl bg-warning/10 px-3 py-2.5 text-[0.7rem] font-medium text-warning">
          این فاکتور چک نقدشده/برگشتی دارد و قابل ویرایش نیست — فقط مشاهده.
        </p>
      )}
      {/* نوع فاکتور */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold sm:text-xl">{editId ? "ویرایش فاکتور" : "فاکتور جدید"}</h1>
        {editId ? (
          <span
            className={cn(
              "rounded-2xl px-4 py-2 text-xs font-bold text-white",
              type === "SALE" ? "bg-income" : "bg-destructive"
            )}
          >
            {type === "SALE" ? "فروش" : "خرید"}
          </span>
        ) : (
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
        )}
      </div>

      <div className="space-y-4">
        {/* ───────── شخص ───────── */}
        <section
          ref={personSectionRef}
          className="rounded-3xl border border-border/70 bg-card p-4 shadow-card"
        >
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
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3.5 text-sm font-medium transition-colors",
                showPersonError
                  ? "border-destructive/60 text-destructive"
                  : "border-input text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              <UserPlus className="size-4" />
              انتخاب {personTypeLabel}
            </button>
          )}
          {showPersonError && (
            <p className="mt-1.5 text-[0.65rem] font-medium text-destructive">
              برای ثبت فاکتور، انتخاب {personTypeLabel} الزامی است
            </p>
          )}
        </section>

        {/* ───────── اقلام ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Package className="size-4 text-primary" />
            اقلام فاکتور
            {items.length > 0 && (
              <span className="nums rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-bold text-primary">
                {toPersianDigits(items.length)}
              </span>
            )}
          </div>

          {/* UI-08: جابجایی ترتیب اقلام با درگ — دستگیرهٔ سمت راست هر ردیف */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => haptic.medium()}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <SortableItemRow
                    key={item.rowId}
                    rowId={item.rowId}
                    item={item}
                    error={submitAttempted ? itemRowErrors[idx] : null}
                    onRemove={() => setItems(items.filter((_, i) => i !== idx))}
                    registerNode={(id, el) => {
                      if (el) rowRefs.current.set(id, el)
                      else rowRefs.current.delete(id)
                    }}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setItemSheet(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.98]"
                >
                  <PackagePlus className="size-4" />
                  افزودن جنس
                </button>
              </div>
            </SortableContext>
          </DndContext>

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

          {editId && (editData?.invoice.items.length ?? 0) > 0 && (
            <p className="mb-3 rounded-xl bg-primary/5 px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">
              در حال ویرایش فاکتور شماره {toPersianDigits(editData!.invoice.number)} — تسویه‌های ثبت‌شدهٔ بعدی بابت این فاکتور حفظ می‌شوند.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div ref={dateFieldRef}>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                تاریخ فاکتور
              </label>
              <JalaliDateField value={date} onChange={setDate} />
              {showDateError && (
                <p className="mt-1 text-[0.65rem] font-medium text-destructive">
                  تاریخ فاکتور را انتخاب کنید
                </p>
              )}
            </div>
            <div ref={discountFieldRef}>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                تخفیف (تومان)
              </label>
              <AmountInput
                value={discount}
                onChange={(v) => {
                  setDiscount(v)
                  setDiscountTouched(true)
                }}
                placeholder="بدون تخفیف"
                showWords={false}
              />
              {showDiscountError && (
                <p className="mt-1 text-[0.65rem] font-medium text-destructive">
                  تخفیف بیشتر از جمع اقلام است
                </p>
              )}
            </div>
          </div>

          {/* نقدی */}
          <div className="mt-4 rounded-2xl bg-muted/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-[0.7rem] font-medium text-muted-foreground">
                    نقدی پرداخت شد
                  </label>
                  {total - checkTotal - paidCash > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidCash(Math.max(0, total - checkTotal))}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[0.7rem] font-bold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Banknote className="size-3.5" />
                      بقیه را نقدی بده ({formatToman(Math.max(0, total - checkTotal), false)})
                    </button>
                  )}
                </div>
                <AmountInput value={paidCash} onChange={setPaidCash} placeholder="۰" showWords={false} />
                {/* حساب هوشمند: بعد از این نقدی، چقدر برای چک/نسیه می‌ماند */}
                {total > 0 && paidCash > 0 && (
                  <p className="nums mt-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[0.65rem] leading-4 text-muted-foreground">
                    {total - checkTotal - paidCash > 0
                      ? `مانده برای چک یا نسیه: ${formatToman(Math.max(0, total - checkTotal - paidCash), false)} تومان`
                      : paidCash + checkTotal - total > 0
                        ? `مازاد نقدی: ${formatToman(paidCash + checkTotal - total, false)} تومان (علی‌الحساب)`
                        : "با این نقدی، فاکتور کامل تسویه می‌شود ✅"}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  از حساب بانکی
                </label>
                {paidCash > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAccountSheet(true)}
                    className={cn(
                      "flex h-12 w-full items-center gap-2.5 rounded-2xl border px-3 transition-[color,border-color,box-shadow] hover:border-input/80",
                      account ? "border-input bg-card" : "border-warning/60 bg-warning/5"
                    )}
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
                      <span className="w-full text-center text-sm font-medium text-warning">
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
                    <div className="flex items-center gap-1.5">
                      <span className="nums text-xs font-bold">{formatToman(c.amount, false)}</span>
                      {c.isRegistered ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-income/10 px-1.5 py-px text-[0.56rem] font-bold text-income">
                          <BadgeCheck className="size-2.5" />
                          ثبت‌شده
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-warning/10 px-1.5 py-px text-[0.56rem] font-bold text-warning">
                          ثبت‌نشده
                        </span>
                      )}
                      {c.photo && <Paperclip className="size-2.5 shrink-0 text-muted-foreground" />}
                    </div>
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

          {/* مانده / نسیه / مازاد */}
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-2xl px-4 py-3",
              credit > 0
                ? "bg-warning/10 text-warning"
                : excess > 0
                  ? "bg-primary/10 text-primary"
                  : "bg-income/10 text-income"
            )}
          >
            <span className="text-xs font-bold">
              {credit > 0
                ? "مانده روی حساب (نسیه)"
                : excess > 0
                  ? "مازاد پرداخت → علی‌الحساب شخص"
                  : "تسویه کامل ✅"}
            </span>
            <span className="nums text-sm font-extrabold">
              {formatToman(excess > 0 ? excess : credit, false)}
            </span>
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/92 px-4 pb-[calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)+7rem)] pt-3 backdrop-blur-md lg:pb-5">
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
            disabled={saving || !person || items.length === 0 || lockedChecks || hasErrors}
            className={cn(
              "h-12 rounded-2xl px-8 text-sm font-bold shadow-fab",
              type === "SALE" ? "bg-income hover:bg-income/90" : "bg-destructive hover:bg-destructive/90"
            )}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editId ? (
              <Pencil className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            {editId ? "ذخیره تغییرات" : "ثبت فاکتور"}
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
          setItems((prev) => [...prev, { ...item, rowId: genRowId() }])
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
        invoiceTotal={total}
        paidCash={paidCash}
        existingChecksTotal={checkTotal}
        invoiceType={type}
      />
    </div>
  )
}

// ═══════════════ ردیف قابل جابجایی اقلام (UI-08 — dnd-kit) ═══════════════
function SortableItemRow({
  rowId,
  item,
  error,
  onRemove,
  registerNode,
}: {
  rowId: string
  item: DraftItem
  error: string | null
  onRemove: () => void
  registerNode: (id: string, el: HTMLDivElement | null) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: rowId })
  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        registerNode(rowId, el)
      }}
      style={{
        // فقط Translate — چرخش/اسکیلِ transform در RTL گلیچ می‌کند
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-2xl border bg-muted/40 px-3 py-2.5",
        error ? "border-destructive/60" : "border-border/60",
        isDragging && "relative z-10 scale-[1.02] border-border bg-card shadow-lg"
      )}
    >
      <div className="flex items-center gap-3">
        {/* دستگیرهٔ جابجایی — لبهٔ راست (RTL)؛ درگ فقط از همین دستگیره شروع می‌شود */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="جابجایی این قلم"
          className="touch-none cursor-grab active:cursor-grabbing rounded-xl p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold">
            {item.name}
            {item.brand ? <span className="text-muted-foreground"> — {item.brand}</span> : null}
          </div>
          <div className="nums mt-1 text-[0.7rem] text-muted-foreground">
            {toPersianDigits(item.quantity)} {formatUnit(item.unit)} ×{" "}
            {formatToman(item.unitPrice, false)} ={" "}
            <span className="font-bold text-foreground">
              {formatToman(Math.round(item.quantity * item.unitPrice), false)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl p-2 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="حذف قلم"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {error && <p className="mt-1 text-[0.65rem] font-medium text-destructive">{error}</p>}
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
  const latinQ = normalizeDigits(q)
  // جستجو با ارقام فارسی/لاتین: مثلاً موبایل «۰۹۱۲…» یا «0912…» هر دو پیدا می‌شوند
  const matches = (s: string | null | undefined) =>
    !!s && (s.includes(q) || normalizeDigits(s).includes(latinQ))
  const filtered = people.filter(
    (p) => !q || matches(p.name) || matches(p.company) || matches(p.phone)
  )
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={type === "SALE" ? "انتخاب مشتری" : "انتخاب فروشنده"}
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
          className="field ps-10"
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
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            placeholder="09…"
            className="nums text-end"
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
  // واحد مؤثر برای برچسب تعداد: در حالت جنس جدید واحد انتخابی، در حالت انتخاب واحد خود جنس
  const activeUnit = mode === "new" ? unit : (selected?.unit ?? "عدد")
  // جنس جدید
  const [name, setName] = useState("")
  const [brand, setBrand] = useState("")
  const [code, setCode] = useState("")
  // عکس جنس جدید (ADV-05) — اختیاری؛ بعد از ساخت جنس آپلود می‌شود
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; url: string }[]>([])
  const pendingPhotoUrlsRef = useRef<string[]>([])

  /** آزادسازی پیش‌نمایش‌های محلی هنگام ترک صفحه */
  useEffect(() => {
    const urls = pendingPhotoUrlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const reset = () => {
    setMode("pick")
    setQ("")
    setSelected(null)
    setQuantity(0)
    setUnitPrice(0)
    setName("")
    setBrand("")
    setCode("")
    setPendingPhotos([])
  }

  const matches = (s: string | null | undefined) =>
    !!s && (s.includes(q) || normalizeDigits(s).includes(normalizeDigits(q)))
  const filtered = products.filter(
    (p) => !q || matches(p.name) || matches(p.brand) || matches(p.code)
  )
  // بندانگشتی عکس اجناس موجود در تب انتخاب (ADV-05)
  const pickPhotoIds = filtered.map((p) => p.photoId).filter((x): x is string => !!x)
  const pickPhotoUrls = useAttachmentUrls(pickPhotoIds)

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
        // آپلود عکس‌های انتخاب‌شده — بعد از ساخت جنس؛ خطای عکس مانع ثبت قلم نیست (ADV-05)
        if (pendingPhotos.length > 0) {
          let okCount = 0
          for (const p of pendingPhotos) {
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
          if (okCount > 0) toast.success(`${toPersianDigits(okCount)} عکس جنس پیوست شد 📎`)
          if (okCount < pendingPhotos.length) toast.error("برخی عکس‌ها آپلود نشدند")
          setPendingPhotos([])
          await queryClient.invalidateQueries({ queryKey: ["products"] })
        }
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
              className="field ps-10"
            />
          </div>
          <div className="mb-3 max-h-56 space-y-2 overflow-y-auto pe-1">
            {filtered.map((p) => (
              <SheetOption
                key={p.id}
                icon={
                  p.photoId && pickPhotoUrls[p.photoId] ? (
                    <img
                      src={pickPhotoUrls[p.photoId]}
                      alt={p.name}
                      loading="lazy"
                      className="size-full rounded-xl object-cover"
                    />
                  ) : (
                    <Package className="size-4" />
                  )
                }
                title={[p.name, p.brand].filter(Boolean).join(" — ")}
                subtitle={[p.code ? `کد ${p.code}` : null].filter(Boolean).join(" • ") || `واحد: ${formatUnit(p.unit)}`}
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
              {PRODUCT_UNITS.map((u) => (
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
                  {formatUnit(u)}
                </button>
              ))}
            </div>
          </div>
          {/* عکس جنس (ADV-05) — اختیاری؛ با افزودن جنس پیوست می‌شود */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground">
                <ImagePlus className="size-3.5" />
                عکس جنس (اختیاری)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                className="h-8 shrink-0 rounded-xl px-2.5 text-[0.7rem] font-bold"
              >
                <ImagePlus className="size-3.5" />
                انتخاب تصویر
              </Button>
            </div>
            {pendingPhotos.length === 0 ? (
              <p className="rounded-xl bg-muted/40 px-2.5 py-3 text-center text-[0.68rem] leading-relaxed text-muted-foreground">
                عکسی انتخاب نشده — با ثبت جنس، عکس در لیست اجناس هم آرشیو می‌شود.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {pendingPhotos.map((p, i) => (
                  <div
                    key={`new-photo-${i}`}
                    className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-primary/40 bg-primary/5"
                  >
                    <img src={p.url} alt={p.file.name} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingPhotos((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="حذف عکس"
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
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter((f) =>
                  f.type.startsWith("image/")
                )
                if (files.length === 0) {
                  toast.error("فقط تصویر (JPG/PNG/WebP) مجاز است")
                } else {
                  const items = files.map((file) => {
                    const url = URL.createObjectURL(file)
                    pendingPhotoUrlsRef.current.push(url)
                    return { file, url }
                  })
                  setPendingPhotos((prev) => [...prev, ...items])
                }
                if (photoInputRef.current) photoInputRef.current.value = ""
              }}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </div>
      )}

      {/* تعداد و قیمت — برچسب تعداد بر اساس واحد جنس (مثلاً kg) */}
      {(mode === "new" || selected) && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              {activeUnit === "عدد" ? "تعداد *" : `تعداد (${formatUnit(activeUnit)}) *`}
            </label>
            <NumberInput value={quantity} onChange={setQuantity} placeholder="۱" />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              قیمت واحد (تومان) *
            </label>
            <AmountInput value={unitPrice} onChange={setUnitPrice} showWords={false} />
          </div>
          <div className="col-span-2 text-center text-[0.7rem] text-muted-foreground">
            {toPersianDigits(String(quantity))} {formatUnit(activeUnit)} × {formatToman(unitPrice, false)} ={" "}
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

// ═══════════════ شیت افزودن چک — حساب هوشمند + ثبت چک (نسخهٔ ۳) ═══════════════
function QuickCheckSheet({
  open,
  onClose,
  onAdd,
  invoiceTotal,
  paidCash,
  existingChecksTotal,
  invoiceType,
}: {
  open: boolean
  onClose: () => void
  onAdd: (c: DraftCheck) => void
  /** مبلغ نهایی فاکتور */
  invoiceTotal: number
  /** نقدی پرداخت‌شده تا الان */
  paidCash: number
  /** جمع چک‌های افزوده‌شده تا الان */
  existingChecksTotal: number
  invoiceType: "SALE" | "PURCHASE"
}) {
  const [amount, setAmount] = useState(0)
  const [bankKey, setBankKey] = useState("mellat")
  const [serial, setSerial] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [bankSheet, setBankSheet] = useState(false)

  /* ثبت چک */
  const [isRegistered, setIsRegistered] = useState(false)
  const [regName, setRegName] = useState("")
  const [regNationalId, setRegNationalId] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // جهت چک: فروش → از مشتری می‌گیریم (دریافتی)؛ خرید → به فروشنده می‌دهیم (صادره)
  const isReceived = invoiceType === "SALE"

  // حساب هوشمند: ماندهٔ واقعی برای این چک
  const remaining = Math.max(0, invoiceTotal - paidCash - existingChecksTotal)
  const afterThisCheck = remaining - amount
  // اگر کاربر مبلغ چک را دستی عوض کرد دکمهٔ مانده را دوباره نشان می‌دهیم
  const showFillRemaining = remaining > 0 && amount !== remaining

  const reset = () => {
    setAmount(0)
    setBankKey("mellat")
    setSerial("")
    setDueDate("")
    setIsRegistered(false)
    setRegName("")
    setRegNationalId("")
    setPhoto(null)
  }

  const add = () => {
    if (amount <= 0) return toast.error("مبلغ چک را وارد کنید")
    if (!dueDate) return toast.error("سررسید چک را انتخاب کنید")
    if (isRegistered) {
      const name = regName.trim()
      if (name.length < 2) return toast.error("نام صاحب حساب چک را وارد کنید")
      if (regNationalId.trim() && !/^\d{10}$/.test(regNationalId.trim())) {
        return toast.error("کد ملی باید ۱۰ رقم باشد")
      }
    }
    onAdd({
      amount,
      bankKey,
      serial,
      dueDate,
      isRegistered,
      registeredName: isRegistered ? regName.trim() : undefined,
      registeredNationalId: isRegistered ? regNationalId.trim() || undefined : undefined,
      photo: photo ?? null,
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
        {/* حساب هوشمند — وضعیت لحظه‌ای فاکتور */}
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-3">
          <div className="flex items-center justify-between text-[0.68rem]">
            <span className="text-muted-foreground">مبلغ فاکتور</span>
            <span className="nums font-bold">{formatToman(invoiceTotal, false)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[0.68rem]">
            <span className="text-muted-foreground">نقدی پرداخت‌شده</span>
            <span className="nums font-bold text-income">− {formatToman(paidCash, false)}</span>
          </div>
          {existingChecksTotal > 0 && (
            <div className="mt-1 flex items-center justify-between text-[0.68rem]">
              <span className="text-muted-foreground">چک‌های افزوده‌شده</span>
              <span className="nums font-bold text-primary">− {formatToman(existingChecksTotal, false)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-dashed pt-2 text-[0.72rem]">
            <span className="font-bold text-muted-foreground">
              {remaining > 0 ? "مانده برای چک / نسیه" : "فاکتور با نقدی و چک‌ها تسویه است"}
            </span>
            {remaining > 0 && (
              <span className="nums font-extrabold text-primary">{formatToman(remaining, false)}</span>
            )}
          </div>
          {showFillRemaining && remaining > 0 && (
            <button
              type="button"
              onClick={() => setAmount(remaining)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-[0.7rem] font-bold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
            >
              <Sparkles className="size-3.5" />
              مبلغ این چک = کل مانده ({formatToman(remaining, false)})
            </button>
          )}
          {/* پیش‌نمایش پس از این چک */}
          {amount > 0 && (
            <p className="nums mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[0.62rem] leading-4 text-muted-foreground">
              {afterThisCheck > 0
                ? `پس از این چک، مانده: ${formatToman(afterThisCheck, false)} تومان`
                : afterThisCheck === 0
                  ? "با این چک، فاکتور کامل تسویه می‌شود ✅"
                  : `${formatToman(-afterThisCheck, false)} تومان مازاد می‌رود به علی‌الحساب`}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            مبلغ چک (تومان) *
          </label>
          <AmountInput value={amount} onChange={setAmount} />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            بانک چک *
          </label>
          <button
            type="button"
            onClick={() => setBankSheet(true)}
            className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
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
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder="مثلاً ۸۸۴۵۱۲"
              className="nums text-end"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              سررسید *
            </label>
            <JalaliDateField value={dueDate} onChange={setDueDate} />
          </div>
        </div>

        {/* ── ثبت چک ── */}
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
          <button
            type="button"
            onClick={() => setIsRegistered((v) => !v)}
            className="flex w-full items-center gap-2.5 text-start"
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                isRegistered ? "border-primary bg-primary text-white" : "border-input bg-card"
              )}
            >
              {isRegistered && <BadgeCheck className="size-3.5" strokeWidth={2.6} />}
            </span>
            <span className="flex-1">
              <span className="block text-xs font-bold">چک ثبت شده است</span>
              <span className="mt-0.5 block text-[0.62rem] leading-4 text-muted-foreground">
                {isReceived ? "چک به نام خودتان در بانک ثبت شده" : "چک به نام مشتری در بانک ثبت شده"}
              </span>
            </span>
          </button>

          {isRegistered && (
            <div className="mt-3 space-y-2.5 border-t border-dashed pt-3">
              <div>
                <label className="mb-1.5 flex items-center gap-1 text-[0.68rem] font-medium text-muted-foreground">
                  <UserRound className="size-3.5" />
                  نام صاحب حساب *
                </label>
                <Input
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={isReceived ? "نام خودتان" : "نام مشتری"}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1 text-[0.68rem] font-medium text-muted-foreground">
                  <IdCard className="size-3.5" />
                  کد ملی (اختیاری)
                </label>
                <Input
                  value={regNationalId}
                  onChange={(e) => setRegNationalId(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="۱۲۳۴۵۶۷۸۹۰"
                  className="nums text-end"
                />
              </div>
              <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[0.6rem] leading-4 text-muted-foreground">
                چک ثبت‌نشده پاس/برگشت/لغو نمی‌شود — اول باید به نام{" "}
                {isReceived ? "شما" : "مشتری"} ثبت شود.
              </p>
            </div>
          )}

          {/* ── عکس چک — مستقل از وضعیت ثبت؛ چک ثبت‌نشده هم می‌تواند عکس داشته باشد ── */}
          <div className="mt-3 border-t border-dashed pt-3">
            <label className="mb-1.5 flex items-center gap-1 text-[0.68rem] font-medium text-muted-foreground">
              <ImagePlus className="size-3.5" />
              عکس چک (اختیاری) — بدون نیاز به ثبت
            </label>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-input bg-card text-[0.68rem] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {photo ? (
                <>
                  <CheckCircle2 className="size-3.5 text-income" />
                  <span className="truncate">{photo.name}</span>
                </>
              ) : (
                <>
                  <ImagePlus className="size-3.5" />
                  انتخاب عکس
                </>
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                if (f && !f.type.startsWith("image/")) {
                  toast.error("فقط تصویر مجاز است")
                  return
                }
                if (f && f.size > 8 * 1024 * 1024) {
                  toast.error("حجم عکس بیش از ۸ مگابایت است")
                  return
                }
                setPhoto(f)
                if (photoInputRef.current) photoInputRef.current.value = ""
              }}
              aria-hidden="true"
              tabIndex={-1}
            />
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
