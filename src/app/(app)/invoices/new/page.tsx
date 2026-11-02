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
  ArrowRight,
  Clock3,
  ChevronDown,
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
import { useConfirm } from "@/components/ui/confirm"
import { Segmented } from "@/components/ui/segmented"
import { InvoiceTypeMark, InvoiceTypePill } from "@/components/ui/type-mark"
import { BalanceAvatar, ROLE_LABELS } from "@/components/ui/role-avatar"

// ───────── تایپ‌ها ─────────
interface Person {
  id: string
  name: string
  phone: string | null
  company: string | null
  role: string
  /** مانده حساب: مثبت = طلب ما، منفی = بدهی ما */
  balance?: number
}
interface Product {
  id: string
  name: string
  brand: string | null
  code: string | null
  unit: string
  /** موجودی زندهٔ انبار (خرید − فروش + اولیه) — از GET /api/products */
  stock: number
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
  const [celebration, setCelebration] = useState<{ title: string; subtitle?: string }>({ title: "ثبت شد" })

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

  // IMP-08: ذخیره خودکار پیش‌نویس — اگر مینی‌اپ وسط کار بسته شود اقلام نیمه‌کاره از بین نمی‌روند.
  // نسخهٔ ۴: پیش‌نویس قبلی خودکار روی فرم ریخته نمی‌شود؛ بنری می‌پرسد «ادامه بدهم یا از نو؟»
  // و تا تصمیم کاربر، ذخیرهٔ خودکار روی پیش‌نویس قبلی نمی‌نویسد.
  const DRAFT_KEY = "hesabyar-invoice-draft-v1"
  const draftHydratedRef = useRef(false)
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  useEffect(() => {
    if (editId || draftHydratedRef.current) return
    draftHydratedRef.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as SavedDraft
      // فقط پیش‌نویس‌های تازه (۷ روز) و غیرخالی
      const isMeaningful = (d.items?.length ?? 0) > 0 || !!d.person
      if (!isMeaningful || Date.now() - (d.savedAt ?? 0) > 7 * 24 * 3600_000) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- خواندن یک‌بارهٔ localStorage بعد از mount
      setPendingDraft(d)
    } catch {
      /* ignore */
    }
  }, [editId])

  const restoreDraft = () => {
    const d = pendingDraft
    if (!d) return
    setType(d.type)
    setDate(d.date || todayKey())
    setPerson(d.person ?? null)
    setItems((d.items ?? []).map((it) => ({ ...it, rowId: genRowId() })))
    setDiscount(d.discount ?? 0)
    setPaidCash(d.paidCash ?? 0)
    setChecks(d.checks ?? [])
    setNote(d.note ?? "")
    editAccountIdRef.current = d.accountId
    const acc = accountsData?.accounts.find((a) => a.id === d.accountId)
    if (acc) setAccount(acc)
    setDraftSavedAt(d.savedAt)
    setPendingDraft(null)
    haptic.success()
  }
  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setPendingDraft(null)
    haptic.tap()
  }

  // ذخیره‌ی خودکار با debounce — تا وقتی بنر پیش‌نویس قبلی باز است چیزی نوشته نمی‌شود
  useEffect(() => {
    if (editId || pendingDraft) return
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
          setDraftSavedAt(Date.now())
        } else {
          localStorage.removeItem(DRAFT_KEY)
          setDraftSavedAt(null)
        }
      } catch {
        /* ignore */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [editId, pendingDraft, type, date, person, items, discount, paidCash, account, checks, note])

  // حالت ویرایش: اگر تغییری ذخیره‌نشده هست، بستن تب/رفرش هشدار بدهد

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

  // حالت ویرایش: اگر تغییری ذخیره‌نشده هست، بستن تب/رفرش هشدار بدهد.
  // خط پایه وقتی گرفته می‌شود که فاکتور و حساب بانکی‌اش کامل روی فرم نشسته باشند.
  const [editBaseline, setEditBaseline] = useState<string | null>(null)
  const editSnapshot = JSON.stringify([date, person?.id, items.map((i) => [i.productId, i.quantity, i.unitPrice]), discount, paidCash, account?.id ?? null, checks.length, note])
  const editInvoiceAccountId = editData?.invoice.account?.id ?? null
  const editFormReady = !!editId && !!person && (!editInvoiceAccountId || account?.id === editInvoiceAccountId)
  useEffect(() => {
    if (editFormReady && editBaseline === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- یک‌بار، بعد از نشستن دادهٔ فاکتور روی فرم
      setEditBaseline(editSnapshot)
    }
  }, [editFormReady, editBaseline, editSnapshot])
  const editDirty = editBaseline !== null && editBaseline !== editSnapshot
  const [leavingAfterSave, setLeavingAfterSave] = useState(false)
  useEffect(() => {
    if (!editDirty || leavingAfterSave) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [editDirty, leavingAfterSave])

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
  // مبلغی که هنوز نه نقد شده نه چک
  const remaining = Math.max(0, total - paidCash - checkTotal)

  /** نقدی = باقی‌مانده (+ انتخاب خودکار حساب وقتی فقط یک حساب داریم) */
  const fillCash = (amount = paidCash + remaining) => {
    setPaidCash(amount)
    haptic.tap()
    if (amount > 0 && !account) {
      if (accounts.length === 1) setAccount(accounts[0])
      else setTimeout(() => setAccountSheet(true), 180)
    }
  }
  const [checkPrefill, setCheckPrefill] = useState(0)
  const openCheckSheet = (amount = remaining) => {
    setCheckPrefill(amount)
    setCheckSheet(true)
  }
  /** انتخاب سریع روش پرداخت */
  const quickPay = (kind: "cash" | "check" | "credit") => {
    if (kind === "cash") {
      setChecks([])
      fillCash(total)
    } else if (kind === "check") {
      setPaidCash(0)
      openCheckSheet(Math.max(0, total - checkTotal))
    } else {
      setPaidCash(0)
      setChecks([])
      haptic.tap()
    }
  }

  // ───────── خروج / انصراف ─────────
  const { confirm } = useConfirm()
  const leave = async () => {
    const hasContent = items.length > 0 || !!person
    if (editId ? editDirty : hasContent) {
      const okLeave = await confirm({
        title: editId ? "تغییرات ذخیره نشده" : "از این فاکتور خارج می‌شوی؟",
        description: editId
          ? "تغییراتی که دادی ذخیره نمی‌شوند."
          : "پیش‌نویس ذخیره شده — دفعهٔ بعد که «فاکتور جدید» بزنی می‌توانی ادامه بدهی.",
        confirmText: editId ? "خروج بدون ذخیره" : "بله، خروج",
        cancelText: "ماندن",
        tone: editId ? "danger" : "primary",
      })
      if (!okLeave) return
    }
    setLeavingAfterSave(true)
    haptic.tap()
    if (window.history.length > 1) router.back()
    else router.push(editId ? `/invoices/${editId}` : "/invoices")
  }

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
        toast.info("آفلاین هستید — فاکتور ذخیره شد و بعد از اتصال خودکار ثبت می‌شود")
        haptic.warning()
        localStorage.removeItem(DRAFT_KEY)
        await queryClient.invalidateQueries()
        router.push("/invoices")
        return
      }
      // MO-02: فقط یک بازخورد — جشن تیک بزرگ (شمارهٔ فاکتور و مازاد داخل همان) + هپتیک
      setLeavingAfterSave(true)
      setCelebration({
        title: editId
          ? `فاکتور ${toPersianDigits(r.invoice.number)} ویرایش شد`
          : `فاکتور ${toPersianDigits(r.invoice.number)} ثبت شد`,
        subtitle:
          r.excess > 0
            ? `مازاد ${formatToman(r.excess)} به علی‌الحساب «${person.name}» رفت`
            : `${person.name} • ${formatToman(total)}`,
      })
      setCelebrate(true)
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
        if (uploaded < withPhotos.length) {
          toast.error(`${toPersianDigits(withPhotos.length - uploaded)} عکس چک آپلود نشد — از صفحهٔ چک دوباره بفرستید`)
        }
      }
      // پاک‌سازی پیش‌نویس بعد از ثبت موفق
      if (!editId) localStorage.removeItem(DRAFT_KEY)
      await queryClient.invalidateQueries()
      setTimeout(() => router.push(`/invoices/${r.invoice.id}`), 1300)
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
    color: type === "SALE" ? "#0f9f6e" : "#4f5bd5",
    onClick: () => submitRef.current(),
  })

  return (
    <div className="pb-2">
      <SuccessCelebration show={celebrate} title={celebration.title} subtitle={celebration.subtitle} />
      <AnimatePresence initial={false}>
        {pendingDraft && (
          <DraftBanner draft={pendingDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
        )}
      </AnimatePresence>
      {lockedChecks && (
        <p className="mb-3 rounded-2xl bg-warning/10 px-3 py-2.5 text-[0.7rem] font-medium text-warning">
          این فاکتور چک نقدشده/برگشتی دارد و قابل ویرایش نیست — فقط مشاهده.
        </p>
      )}
      {/* ───────── سربرگ: بازگشت/انصراف + عنوان + نوع ───────── */}
      <div className="mb-4 flex items-center gap-2.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={leave}
          aria-label="انصراف و بازگشت"
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-[1.15rem]" />
        </motion.button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl">
            {editId ? `ویرایش فاکتور ${editData ? toPersianDigits(editData.invoice.number) : ""}` : "فاکتور جدید"}
          </h1>
          <p className="text-[0.66rem] text-muted-foreground">
            {editId ? "تغییرات بعد از «ذخیره» اعمال می‌شود" : type === "SALE" ? "جنس به مشتری دادم" : "جنس از فروشنده گرفتم"}
          </p>
        </div>
        <button
          type="button"
          onClick={leave}
          className="hidden h-11 shrink-0 items-center rounded-2xl px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-destructive/8 hover:text-destructive sm:flex"
        >
          انصراف
        </button>
      </div>

      {editId ? (
        <div className="mb-4">
          <InvoiceTypePill type={type} className="px-3 py-1 text-xs" />
        </div>
      ) : (
        <Segmented
          value={type}
          onChange={(t) => {
            if (t === type) return
            haptic.tap()
            setType(t)
            setPerson(null)
          }}
          options={[
            { key: "SALE", label: "فاکتور فروش", tone: "var(--sale)", icon: <InvoiceTypeMark type="SALE" size={22} /> },
            { key: "PURCHASE", label: "فاکتور خرید", tone: "var(--purchase)", icon: <InvoiceTypeMark type="PURCHASE" size={22} /> },
          ]}
          className="mb-4 sm:max-w-md"
        />
      )}

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

        {/* ───────── تاریخ و تخفیف ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            <div ref={dateFieldRef}>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">تاریخ فاکتور</label>
              <JalaliDateField value={date} onChange={setDate} />
              {showDateError && (
                <p className="mt-1 text-[0.65rem] font-medium text-destructive">تاریخ فاکتور را انتخاب کنید</p>
              )}
            </div>
            <div ref={discountFieldRef}>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">تخفیف (تومان)</label>
              <AmountInput
                value={discount}
                onChange={(v) => {
                  setDiscount(v)
                  setDiscountTouched(true)
                }}
                placeholder="ندارد"
                showWords={false}
              />
              {showDiscountError && (
                <p className="mt-1 text-[0.65rem] font-medium text-destructive">تخفیف بیشتر از جمع اقلام است</p>
              )}
            </div>
          </div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="یادداشت فاکتور (اختیاری)"
            className="mt-3 bg-card text-sm"
          />
        </section>

        {/* ───────── تسویه: نقد / چک / نسیه ───────── */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="grid size-7 place-items-center rounded-xl bg-primary/10 text-primary">
                <Banknote className="size-4" />
              </span>
              {type === "SALE" ? "دریافت پول" : "پرداخت پول"}
            </div>
            <span className="nums text-[0.7rem] text-muted-foreground">
              مبلغ فاکتور <b className="text-foreground">{formatToman(total, false)}</b>
            </span>
          </div>

          {editId && (editData?.invoice.items.length ?? 0) > 0 && (
            <p className="mb-3 rounded-xl bg-primary/5 px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">
              تسویه‌های ثبت‌شدهٔ بعدی بابت این فاکتور حفظ می‌شوند.
            </p>
          )}

          {/* نوار تقسیم مبلغ */}
          <PaymentBar total={total} cash={paidCash} checks={checkTotal} />

          {/* انتخاب سریع */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                { key: "cash", label: "همه نقد", icon: <Banknote className="size-4" />, active: total > 0 && paidCash >= total && checkTotal === 0 },
                { key: "check", label: "با چک", icon: <CheckSquare2 className="size-4" />, active: checkTotal > 0 && paidCash === 0 },
                { key: "credit", label: "نسیه", icon: <Clock3 className="size-4" />, active: total > 0 && paidCash === 0 && checkTotal === 0 },
              ] as const
            ).map((o) => (
              <motion.button
                key={o.key}
                type="button"
                whileTap={{ scale: 0.95 }}
                disabled={total <= 0}
                onClick={() => quickPay(o.key)}
                className={cn(
                  "flex h-12 items-center justify-center gap-1.5 rounded-2xl border text-xs font-bold transition-all disabled:opacity-40",
                  o.active
                    ? "border-primary bg-primary text-primary-foreground shadow-fab"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {o.icon}
                {o.label}
              </motion.button>
            ))}
          </div>

          {/* ردیف نقدی */}
          <div className="mt-4 rounded-2xl border border-border/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <span className="size-2 rounded-full bg-[color:var(--sale)]" />
                نقدی / کارت‌به‌کارت
              </span>
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => fillCash()}
                  className="nums rounded-lg bg-primary/10 px-2 py-1 text-[0.65rem] font-bold text-primary transition-colors hover:bg-primary/20"
                >
                  + باقی‌مانده ({formatToman(remaining, false)})
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
              <AmountInput value={paidCash} onChange={setPaidCash} placeholder="۰" showWords={false} />
              <button
                type="button"
                onClick={() => setAccountSheet(true)}
                disabled={paidCash <= 0}
                className={cn(
                  "flex h-12 w-full items-center gap-2.5 rounded-2xl border px-3 transition-all disabled:cursor-default",
                  paidCash <= 0
                    ? "border-dashed border-border/70 bg-muted/30"
                    : account
                      ? "border-input bg-card hover:border-primary/40"
                      : "border-warning/60 bg-warning/5"
                )}
              >
                {paidCash > 0 && account ? (
                  <>
                    <BankLogo bankKey={account.bankKey} size={28} />
                    <span className="min-w-0 flex-1 truncate text-start text-sm">{account.name}</span>
                    <span className="text-[0.62rem] text-muted-foreground">تغییر</span>
                  </>
                ) : (
                  <span
                    className={cn(
                      "w-full text-center text-xs font-medium",
                      paidCash > 0 ? "text-[color:color-mix(in_srgb,var(--warning)_75%,black)]" : "text-muted-foreground"
                    )}
                  >
                    {paidCash > 0 ? "به کدام حساب؟ انتخاب کنید" : "حساب بانکی (بعد از مبلغ)"}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ردیف چک‌ها */}
          <div className="mt-2.5 rounded-2xl border border-border/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <span className="size-2 rounded-full bg-[color:var(--hue-checks)]" />
                چک{type === "SALE" ? " دریافتی" : " صادره"}
              </span>
              {checks.length > 0 && (
                <span className="nums text-[0.68rem] text-muted-foreground">جمع {formatToman(checkTotal, false)}</span>
              )}
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {checks.map((c, idx) => (
                  <motion.div
                    key={c.id ?? `${idx}-${c.amount}-${c.dueDate}`}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2">
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
                        <div className="nums text-[0.62rem] text-muted-foreground">
                          سررسید {toPersianDigits(c.dueDate.replace(/-/g, "/"))}
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
                  </motion.div>
                ))}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => openCheckSheet()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[color:color-mix(in_srgb,var(--hue-checks)_45%,transparent)] py-2.5 text-xs font-bold text-[color:var(--hue-checks)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--hue-checks)_8%,transparent)]"
              >
                <PlusCircle className="size-4" />
                {remaining > 0 ? `افزودن چک (${formatToman(remaining, false)} مانده)` : "افزودن چک"}
              </button>
            </div>
          </div>

          {/* نتیجه: نسیه / تسویه / مازاد */}
          <motion.div
            layout
            className={cn(
              "mt-3 flex items-center gap-3 rounded-2xl px-4 py-3",
              credit > 0 ? "bg-warning/10" : excess > 0 ? "bg-primary/10" : "bg-income/10"
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl text-white",
                credit > 0 ? "bg-warning" : excess > 0 ? "bg-primary" : "bg-income"
              )}
            >
              {credit > 0 ? <Clock3 className="size-4" /> : excess > 0 ? <Sparkles className="size-4" /> : <CheckCircle2 className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold">
                {total === 0
                  ? "هنوز مبلغی نیست"
                  : credit > 0
                    ? `نسیه — به حساب «${person?.name ?? personTypeLabel}» می‌رود`
                    : excess > 0
                      ? "مازاد پرداخت → علی‌الحساب شخص"
                      : "تسویه کامل"}
              </div>
              <div className="text-[0.62rem] text-muted-foreground">
                {credit > 0
                  ? "بعداً از صفحهٔ شخص یا فاکتور تسویه می‌کنید"
                  : excess > 0
                    ? "در تراز شخص لحاظ می‌شود"
                    : total > 0
                      ? "چیزی باقی نمانده"
                      : "اول جنس اضافه کنید"}
              </div>
            </div>
            <span className="nums shrink-0 text-base font-extrabold">
              <AnimatedNumber value={excess > 0 ? excess : credit} />
            </span>
          </motion.div>
        </section>
      </div>

      {/* ───────── نوار چسبان پایین ───────── */}
      <div className="fixed inset-x-3 z-30 [bottom:max(0.75rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)))] lg:start-[calc(17rem+1.5rem)] lg:end-6">
        <div className="glass mx-auto flex max-w-3xl items-center gap-3 rounded-[1.6rem] border p-2.5 ps-4 shadow-float">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
              مبلغ نهایی
              {!editId && <AutosaveStatus savedAt={draftSavedAt} />}
              {editDirty && <span className="font-bold text-warning">• ذخیره‌نشده</span>}
            </div>
            <div className="nums truncate text-base font-extrabold sm:text-lg">
              <AnimatedNumber value={total} />
              <span className="ms-1 text-[0.65rem] font-medium text-muted-foreground">تومان</span>
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={saving || !person || items.length === 0 || lockedChecks || hasErrors}
            className={cn(
              "h-12 rounded-2xl px-8 text-sm font-bold shadow-fab",
              type === "SALE"
                ? "bg-[color:var(--sale)] hover:bg-[color:var(--sale)]/90"
                : "bg-[color:var(--purchase)] hover:bg-[color:var(--purchase)]/90"
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
        invoiceType={type}
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
        initialAmount={checkPrefill}
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
  const maxAbs = Math.max(0, ...people.map((p) => Math.abs(p.balance ?? 0)))
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
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-2 bg-card px-4 pb-2 pt-4">
        <div className="relative">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <input
            autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نام، شرکت یا موبایل…"
            className="field ps-10"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {filtered.map((p) => {
          const bal = p.balance ?? 0
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-start transition-all hover:border-primary/40 hover:bg-accent/50 active:scale-[0.99]"
            >
              <BalanceAvatar role={p.role} balance={p.balance ?? 0} maxAbs={maxAbs} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="nums mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
                  {[p.company, p.phone ? toPersianDigits(p.phone) : null].filter(Boolean).join(" • ") ||
                    ROLE_LABELS[p.role]}
                </span>
              </span>
              {bal !== 0 && (
                <span
                  className={cn(
                    "nums shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                    bal > 0 ? "bg-warning/12 text-warning" : "bg-destructive/10 text-destructive"
                  )}
                >
                  {bal > 0 ? "طلب" : "بدهی"} {formatToman(Math.abs(bal), false)}
                </span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            شخصی پیدا نشد — با دکمهٔ پایین بسازید
          </p>
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
  // ── مانده اولیه (حساب قدیمی) — مثل فرم اشخاص ──
  const [openingKind, setOpeningKind] = useState<"none" | "receivable" | "payable">("none")
  const [openingAmount, setOpeningAmount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [more, setMore] = useState(false)

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    if (openingKind !== "none" && openingAmount <= 0)
      return toast.error("مبلغ مانده اولیه را وارد کنید")
    setSaving(true)
    try {
      const r = await apiPost<{ person: Person }>("/api/people", {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role: type === "SALE" ? "CUSTOMER" : "SUPPLIER",
        // مثبت = طلب اولیه ما از شخص | منفی = بدهی اولیه ما به شخص
        openingBalance:
          openingKind === "none" ? 0 : openingKind === "receivable" ? openingAmount : -openingAmount,
      })
      toast.success("شخص اضافه شد")
      setName("")
      setPhone("")
      setCompany("")
      setShopAddress("")
      setOpeningKind("none")
      setOpeningAmount(0)
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
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-[0.72rem] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          شرکت، آدرس و مانده اولیه
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
        </button>
        {more && (
          <div className="space-y-3 rounded-2xl bg-muted/40 p-3">
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
        {/* ── مانده اولیه (حساب قدیمی) ── */}
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
            مانده اولیه (حساب قبلی)
          </label>
          <div className="flex gap-1.5">
            {(
              [
                { key: "none", label: "بدون مانده" },
                { key: "receivable", label: "طلب اولیه" },
                { key: "payable", label: "بدهی اولیه" },
              ] as const
            ).map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setOpeningKind(k.key)}
                className={cn(
                  "flex-1 rounded-xl border py-2 text-[0.7rem] font-bold transition-colors",
                  openingKind === k.key
                    ? k.key === "receivable"
                      ? "border-warning bg-warning/10 text-warning"
                      : k.key === "payable"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          {openingKind !== "none" && (
            <div className="mt-2">
              <AmountInput value={openingAmount} onChange={setOpeningAmount} showWords={false} />
              <p className="mt-1 text-[0.62rem] text-muted-foreground">
                {openingKind === "receivable"
                  ? "این شخص از قبل به شما بدهکار است (طلب شما)"
                  : "شما از قبل به این شخص بدهکار هستید"} — در تراز شخص لحاظ می‌شود
              </p>
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

// ═══════════════ شیت افزودن قلم (جنس) ═══════════════
function ItemPickerSheet({
  open,
  onClose,
  products,
  invoiceType,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  products: Product[]
  /** نوع فاکتور — در فروش، موجودی مهم است و هشدار کمبود داده می‌شود */
  invoiceType: "SALE" | "PURCHASE"
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
          if (okCount > 0) toast.success(`${toPersianDigits(okCount)} عکس جنس پیوست شد`)
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
        <>
            {(mode === "new" || selected) && (
        <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2">
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
          {/* موجودی انبار جنس انتخابی + هشدار کمبود در فاکتور فروش */}
          {mode === "pick" && selected && (
            <div className="col-span-2">
              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-1.5 text-[0.7rem]">
                <span className="text-muted-foreground">موجودی فعلی انبار:</span>
                <span
                  className={cn(
                    "nums font-bold",
                    invoiceType === "SALE" && (selected.stock ?? 0) <= 0
                      ? "text-destructive"
                      : "text-foreground"
                  )}
                >
                  {Number.isInteger(selected.stock ?? 0)
                    ? toPersianDigits(String(selected.stock ?? 0))
                    : toPersianDigits((selected.stock ?? 0).toFixed(1))}{" "}
                  {formatUnit(selected.unit)}
                </span>
              </div>
              {invoiceType === "SALE" && quantity > (selected.stock ?? 0) && (
                <p className="mt-1.5 rounded-xl bg-warning/10 px-3 py-1.5 text-[0.65rem] font-bold text-warning">
                  ⚠ تعداد واردشده بیشتر از موجودی انبار است — با ثبت این فاکتور موجودی منفی می‌شود
                </p>
              )}
            </div>
          )}
          <div className="col-span-2 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-[0.7rem] text-muted-foreground">
            <span className="nums">
              {toPersianDigits(String(quantity))} {formatUnit(activeUnit)} × {formatToman(unitPrice, false)}
            </span>
            <span className="nums text-sm font-black text-foreground">
              {formatToman(Math.round(quantity * unitPrice), false)} <span className="text-[0.62rem] font-medium">تومان</span>
            </span>
          </div>
        </div>
      )}
          <Button
            onClick={addItem}
            disabled={mode === "pick" ? !selected : name.trim().length < 2}
            className="h-12 w-full rounded-2xl font-bold"
          >
            <Plus className="size-4" />
            افزودن به فاکتور
          </Button>
        </>
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
              autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی نام جنس، برند یا کد…"
              className="field ps-10"
            />
          </div>
          <div className="space-y-1.5">
            {filtered.map((p) => {
              // نمایش موجودی زندهٔ انبار کنار هر جنس — در فروش مهم‌تر است
              const stockNum = p.stock ?? 0
              const stockText =
                Number.isInteger(stockNum)
                  ? toPersianDigits(String(stockNum))
                  : toPersianDigits(stockNum.toFixed(1))
              const lowStock = invoiceType === "SALE" && stockNum <= 0
              return (
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
                  subtitle={
                    [
                      p.code ? `کد ${p.code}` : null,
                      lowStock ? `موجودی: ندارد!` : `موجودی: ${stockText} ${formatUnit(p.unit)}`,
                    ]
                      .filter(Boolean)
                      .join(" • ") || `واحد: ${formatUnit(p.unit)}`
                  }
                  selected={selected?.id === p.id}
                  onClick={() => setSelected(p)}
                />
              )
            })}
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
  initialAmount = 0,
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
  /** مبلغ پیشنهادی هنگام باز شدن (معمولاً باقی‌ماندهٔ فاکتور) */
  initialAmount?: number
}) {
  const [amount, setAmount] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- پر کردن مبلغ پیشنهادی با هر بار باز شدن
    if (open && initialAmount > 0) setAmount(initialAmount)
  }, [open, initialAmount])
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


// ───────────────────────── پیش‌نویس و ذخیره خودکار ─────────────────────────

interface SavedDraft {
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

function relativeTime(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (sec < 45) return "همین الان"
  const min = Math.round(sec / 60)
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`
  const h = Math.round(min / 60)
  if (h < 24) return `${toPersianDigits(h)} ساعت پیش`
  return `${toPersianDigits(Math.round(h / 24))} روز پیش`
}

/** بنر «پیش‌نویس نیمه‌کاره داری» — کاربر تصمیم می‌گیرد ادامه بدهد یا از نو شروع کند */
function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: SavedDraft
  onRestore: () => void
  onDiscard: () => void
}) {
  const total = (draft.items ?? []).reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0)
  const parts = [
    draft.type === "SALE" ? "فروش" : "خرید",
    draft.person?.name,
    draft.items?.length ? `${toPersianDigits(draft.items.length)} قلم` : null,
    total > 0 ? formatToman(total) : null,
  ].filter(Boolean)
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className="mb-4 overflow-hidden"
    >
      <div className="flex flex-col gap-3 rounded-3xl border border-primary/25 bg-gradient-to-l from-primary/[0.07] to-primary/[0.02] p-3.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-fab">
            <FileText className="size-5" />
            <span className="hy-ping absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-card" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-extrabold">یک فاکتور نیمه‌کاره داری</div>
            <div className="nums truncate text-[0.7rem] text-muted-foreground">
              {parts.join(" • ")} — {relativeTime(draft.savedAt)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRestore} className="h-10 flex-1 rounded-2xl px-5 text-xs font-bold sm:flex-none">
            ادامه بده
          </Button>
          <Button
            onClick={onDiscard}
            variant="ghost"
            className="h-10 flex-1 rounded-2xl px-4 text-xs font-bold text-muted-foreground sm:flex-none"
          >
            از نو
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

/** وضعیت ذخیره خودکار پیش‌نویس — نقطهٔ سبز + زمان */
function AutosaveStatus({ savedAt }: { savedAt: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!savedAt) return
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [savedAt])
  return (
    <AnimatePresence mode="wait" initial={false}>
      {savedAt ? (
        <motion.span
          key={Math.floor(savedAt / 1000)}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="inline-flex items-center gap-1 rounded-full bg-income/10 px-1.5 py-px font-semibold text-income"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
          </svg>
          پیش‌نویس ذخیره شد
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

/** عدد مبلغ با شمارش نرم هنگام تغییر */
function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const start = performance.now()
    const dur = 380
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      fromRef.current = value
    }
  }, [value])
  return <>{formatToman(shown, false)}</>
}

/** نوار تقسیم مبلغ فاکتور: نقد (سبز) • چک (نارنجی) • نسیه (راه‌راه) */
function PaymentBar({ total, cash, checks }: { total: number; cash: number; checks: number }) {
  const base = Math.max(total, cash + checks, 1)
  const cashPct = (Math.min(cash, base) / base) * 100
  const checkPct = (Math.min(checks, base - Math.min(cash, base)) / base) * 100
  const creditPct = Math.max(0, 100 - cashPct - checkPct)
  const seg = { type: "spring" as const, stiffness: 260, damping: 30 }
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <motion.span className="h-full bg-[color:var(--sale)]" animate={{ width: `${cashPct}%` }} transition={seg} />
        <motion.span className="h-full bg-[color:var(--hue-checks)]" animate={{ width: `${checkPct}%` }} transition={seg} />
        <motion.span
          className="h-full bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--warning)_55%,transparent)_0_4px,color-mix(in_srgb,var(--warning)_25%,transparent)_4px_8px)]"
          animate={{ width: `${total > 0 ? creditPct : 0}%` }}
          transition={seg}
        />
      </div>
      <div className="nums mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[color:var(--sale)]" />
          نقد {formatToman(cash, false)}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-[color:var(--hue-checks)]" />
          چک {formatToman(checks, false)}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-warning/60" />
          نسیه {formatToman(Math.max(0, total - cash - checks), false)}
        </span>
      </div>
    </div>
  )
}
