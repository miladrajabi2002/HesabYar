"use client"

/**
 * پروفایل شخص — مشخصات، تراز، فاکتورها، چک‌ها، تسویه‌ها + ثبت تسویه
 * + اشتراک صورتحساب در واتس‌اپ/سیستمی/کپی (ADV-06) + گالری تصاویر شخص (ADV-04)
 */
import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  HandCoins,
  FileText,
  CheckSquare2,
  Phone,
  Building2,
  MapPin,
  Loader2,
  CheckCheck,
  Copy,
  ImagePlus,
  Images,
  MessageCircle,
  Share2,
  X,
  BadgeCheck,
} from "lucide-react"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toLatinDigits, toPersianDigits } from "@/lib/money"
import { formatJalaliShort, formatJalaliWithWeekday } from "@/lib/jalali"
import { BANKS, getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { RoleAvatar } from "@/components/ui/role-avatar"
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm"
import { useTelegram } from "@/hooks/use-telegram"

interface PersonDetail {
  person: {
    id: string
    name: string
    phone: string | null
    company: string | null
    shopAddress: string | null
    role: string
    note: string | null
  }
  balance: number
  invoices: {
    id: string
    number: number
    type: string
    date: string
    total: number
    credit: number
    status: string
  }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    dueDate: string
    status: string
    direction: string
  }[]
  settlements: {
    id: string
    direction: string
    method: string
    amount: number
    date: string
    note: string | null
  }[]
}

interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}

/** پیوست تصویری شخص — مطابق select در GET /api/attachments (ADV-04) */
interface Attachment {
  id: string
  filename: string
  mime: string
  size: number
  createdAt: string
}

/** حد مجاز حجم پیوست — همان MAX_SIZE مسیر /api/attachments */
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024 // ۸ مگابایت

/** جداکننده بخش‌های متن صورتحساب اشتراکی (ADV-06) */
const SHARE_SEPARATOR = "——————————"

/** initData مینی‌اپ تلگرام — همان منطق lib/api-client (در وب، کوکی نشست خودکار ارسال می‌شود) */
function telegramInitData(): string | null {
  if (typeof window === "undefined") return null
  return window.Telegram?.WebApp?.initData ?? null
}

/**
 * آپلود پیوست با fetch خام — چون apiUpload روی بدنهٔ FormData هدر
 * content-type: application/json می‌گذارد و req.formData() سمت سرور با آن
 * قابل خواندن نیست («فایل ارسال نشده است»)، آپلود multipart مستقیم با
 * هدر احراز هویت فرستاده می‌شود تا مرورگر boundary را خودش تعیین کند.
 */
async function postAttachmentForm(path: string, fd: FormData): Promise<void> {
  const initData = telegramInitData()
  const headers: Record<string, string> = {}
  if (initData) headers["x-telegram-init-data"] = initData
  const res = await fetch(path, { method: "POST", headers, body: fd })
  if (!res.ok) {
    let msg = "آپلود تصویر ناموفق بود"
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      /* پاسخ غیر JSON */
    }
    if (res.status === 401 && !initData && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login"
    }
    throw new Error(msg)
  }
}

/**
 * دانلود خود پیوست به‌صورت Blob و ساخت objectURL — مسیر GET ?id= احراز هویت
 * می‌خواهد و <img src> ساده (بدون کوکی نشست وب یا هدر مینی‌اپ) ۴۰۱ می‌گیرد.
 */
async function fetchAttachmentObjectUrl(id: string): Promise<string> {
  const initData = telegramInitData()
  const headers: Record<string, string> = {}
  if (initData) headers["x-telegram-init-data"] = initData
  const res = await fetch(`/api/attachments?id=${id}`, { headers })
  if (!res.ok) throw new Error("دریافت تصویر ناموفق بود")
  return URL.createObjectURL(await res.blob())
}

/**
 * نرمال‌سازی شماره موبایل برای wa.me — فرمت بین‌المللی بدون + (مثل 98912…):
 * ارقام فارسی/عربی → لاتین، حذف +/فاصله/خط تیره، سپس ۰۰۹۸/۰/۹۱۲… → 98…
 */
function normalizeWaPhone(raw: string): string | null {
  const digits = toLatinDigits(raw).replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("0098")) return `98${digits.slice(4)}`
  if (digits.startsWith("98") && digits.length >= 12) return digits
  if (digits.startsWith("0")) return `98${digits.slice(1)}`
  if (digits.startsWith("9") && digits.length === 10) return `98${digits}`
  return digits.length >= 8 ? digits : null
}

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const { webApp } = useTelegram()

  const { data, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => apiGet<PersonDetail>(`/api/people/${id}`),
  })

  // شیت ویرایش
  const [editSheet, setEditSheet] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const [shopAddress, setShopAddress] = useState("")
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH">("BOTH")
  const [savingEdit, setSavingEdit] = useState(false)

  // شیت تسویه
  const [settleSheet, setSettleSheet] = useState(false)
  const [direction, setDirection] = useState<"RECEIVE" | "PAY">("RECEIVE")
  const [method, setMethod] = useState<"CASH" | "CHECK">("CASH")
  const [amount, setAmount] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [checkBank, setCheckBank] = useState("mellat")
  const [checkSerial, setCheckSerial] = useState("")
  const [checkDue, setCheckDue] = useState("")
  const [bankSheet, setBankSheet] = useState(false)
  const [checkRegistered, setCheckRegistered] = useState(false)
  const [checkRegName, setCheckRegName] = useState("")
  const [checkRegNationalId, setCheckRegNationalId] = useState("")
  const [accountSheet, setAccountSheet] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
    enabled: settleSheet,
  })

  /* ── اشتراک صورتحساب (ADV-06) ── */
  const [shareSheet, setShareSheet] = useState(false)
  // قابلیت اشتراک سیستمی — فقط سمت کلاینت معتبر است؛ شیت همیشه بسته رندر می‌شود
  // (شیت اشتراک فقط با تعامل کاربر باز می‌شود) پس روی hydration اثری ندارد.
  const canSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  /* ── گالری تصاویر شخص (ADV-04) ── */
  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["attachments", "PERSON", id],
    queryFn: () => apiGet<{ attachments: Attachment[] }>(`/api/attachments?refType=PERSON&refId=${id}`),
  })
  const attachments = attData?.attachments ?? []

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({})
  const objectUrlsRef = useRef<Map<string, string>>(new Map())

  /** کلید پایدار لیست تصویرها تا objectURL ها فقط یک‌بار و به‌ترتیب دانلود شوند */
  const imageIdsKey = attachments
    .filter((a) => a.mime.startsWith("image/"))
    .map((a) => a.id)
    .join("|")

  useEffect(() => {
    const ids = imageIdsKey ? imageIdsKey.split("|") : []
    let cancelled = false
    ;(async () => {
      for (const attId of ids) {
        if (objectUrlsRef.current.has(attId)) continue
        try {
          const url = await fetchAttachmentObjectUrl(attId)
          if (cancelled) {
            URL.revokeObjectURL(url)
          } else {
            objectUrlsRef.current.set(attId, url)
            setImgUrls((prev) => (prev[attId] === url ? prev : { ...prev, [attId]: url }))
          }
        } catch {
          /* دانلود این تصویر ناموفق — اسکلت لودینگ جای خود می‌ماند */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [imageIdsKey])

  /** آزادسازی همهٔ objectURL ها هنگام ترک صفحه */
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const p = data.person
  const balance = data.balance

  const openEdit = () => {
    setName(p.name)
    setPhone(p.phone ?? "")
    setCompany(p.company ?? "")
    setShopAddress(p.shopAddress ?? "")
    setRole((p.role as "CUSTOMER") ?? "BOTH")
    setEditSheet(true)
  }

  const saveEdit = async () => {
    if (name.trim().length < 2) return toast.error("نام را وارد کنید")
    setSavingEdit(true)
    try {
      await apiPatch(`/api/people/${id}`, {
        name: name.trim(),
        phone: phone || undefined,
        company: company || undefined,
        shopAddress: shopAddress || undefined,
        role,
      })
      toast.success("ذخیره شد ✅")
      setEditSheet(false)
      await queryClient.invalidateQueries({ queryKey: ["person", id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSavingEdit(false)
    }
  }

  const openSettle = (dir: "RECEIVE" | "PAY") => {
    setDirection(dir)
    setMethod("CASH")
    setAmount(0)
    setAccount(null)
    setCheckSerial("")
    setCheckDue("")
    setSettleSheet(true)
  }

  const settle = async () => {
    if (method === "CASH") {
      if (!account) return toast.error("حساب بانکی را انتخاب کنید")
      if (amount <= 0) return toast.error("مبلغ را وارد کنید")
    } else {
      if (amount <= 0) return toast.error("مبلغ چک را وارد کنید")
      if (!checkDue) return toast.error("سررسید چک را انتخاب کنید")
      if (checkRegistered && checkRegName.trim().length < 2) {
        return toast.error("نام صاحب حساب چک را وارد کنید")
      }
      if (
        checkRegistered &&
        checkRegNationalId.trim() &&
        !/^\d{10}$/.test(checkRegNationalId.trim())
      ) {
        return toast.error("کد ملی باید ۱۰ رقم باشد")
      }
    }
    setSaving(true)
    try {
      await apiPost("/api/settlements", {
        personId: id,
        direction,
        method,
        amount,
        accountId: method === "CASH" ? account?.id : undefined,
        check:
          method === "CHECK"
            ? {
                amount,
                bankKey: checkBank,
                serial: checkSerial || undefined,
                dueDate: checkDue,
                isRegistered: checkRegistered,
                registeredName: checkRegistered ? checkRegName.trim() || undefined : undefined,
                registeredNationalId: checkRegistered
                  ? checkRegNationalId.trim() || undefined
                  : undefined,
              }
            : undefined,
        note: "تسویه از پروفایل شخص",
      })
      toast.success("تسویه ثبت شد ✅")
      setCheckRegistered(false)
      setCheckRegName("")
      setCheckRegNationalId("")
      setSettleSheet(false)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت تسویه")
    } finally {
      setSaving(false)
    }
  }

  /* ── ADV-06: متن صورتحساب فارسی برای اشتراک ── */
  const buildShareText = () => {
    const lines: string[] = []
    lines.push(`🧾 صورتحساب «${p.name}»`)
    lines.push(`تاریخ: ${formatJalaliWithWeekday(new Date())}`)
    lines.push(SHARE_SEPARATOR)
    if (balance > 0) {
      lines.push(`مانده حساب: ${formatToman(balance, false)} تومان (طلب کاربر)`)
    } else if (balance < 0) {
      lines.push(`مانده حساب: ${formatToman(Math.abs(balance), false)} تومان (بستانکار)`)
    } else {
      lines.push("مانده حساب: تسویه کامل ✓")
    }
    lines.push(SHARE_SEPARATOR)
    lines.push("آخرین تراکنش‌ها:")
    const txns = [
      ...data.invoices.map((inv) => ({
        at: new Date(inv.date).getTime(),
        line: `• فاکتور ${toPersianDigits(inv.number)} — ${formatJalaliShort(new Date(inv.date))} — ${formatToman(inv.total, false)} تومان (${inv.type === "SALE" ? "فروش" : "خرید"})`,
      })),
      ...data.settlements.map((s) => ({
        at: new Date(s.date).getTime(),
        line: `• تسویه — ${formatJalaliShort(new Date(s.date))} — ${formatToman(s.amount, false)} تومان (${s.direction === "RECEIVE" ? "دریافت" : "پرداخت"}${s.method === "CASH" ? " نقدی" : " چکی"})`,
      })),
      ...data.checks.map((c) => ({
        at: new Date(c.dueDate).getTime(),
        line: `• چک${c.serial ? ` ${toPersianDigits(c.serial)}` : ""} — ${formatJalaliShort(new Date(c.dueDate))} — ${formatToman(c.amount, false)} تومان (${c.direction === "RECEIVE" ? "دریافت" : "پرداخت"})`,
      })),
    ].sort((a, b) => b.at - a.at)
    if (txns.length === 0) {
      lines.push("• تراکنشی ثبت نشده است")
    } else {
      lines.push(...txns.slice(0, 5).map((t) => t.line))
    }
    lines.push(SHARE_SEPARATOR)
    lines.push("ارسال شده با حساب‌یار 🌿")
    return lines.join("\n")
  }

  /** بازکردن لینک خارجی — داخل مینی‌اپ تلگرام با openLink بومی، وگرنه window.open */
  const openExternal = (url: string) => {
    const tg = webApp as unknown as { openLink?: (url: string) => void } | null
    if (typeof tg?.openLink === "function") {
      try {
        tg.openLink(url)
        return
      } catch {
        /* افتادن به window.open */
      }
    }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const waPhone = p.phone ? normalizeWaPhone(p.phone) : null

  const shareWhatsApp = () => {
    const text = buildShareText()
    const base = waPhone ? `https://wa.me/${waPhone}` : "https://wa.me/"
    setShareSheet(false)
    openExternal(`${base}?text=${encodeURIComponent(text)}`)
  }

  const shareSystem = async () => {
    const text = buildShareText()
    setShareSheet(false)
    try {
      await navigator.share({ text })
    } catch (e) {
      // لغو توسط کاربر (AbortError) بی‌صدا نادیده گرفته می‌شود
      if ((e as DOMException)?.name !== "AbortError") {
        toast.error("اشتراک‌گذاری سیستمی ناموفق بود")
      }
    }
  }

  const shareCopy = async () => {
    const text = buildShareText()
    setShareSheet(false)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("متن صورتحساب کپی شد ✅")
    } catch {
      toast.error("کپی متن ناموفق بود")
    }
  }

  /* ── ADV-04: افزودن تصویر به گالری شخص ── */
  const onPickImages = async (files: FileList | null) => {
    // FileList نمایندهٔ زندهٔ انتخاب input است؛ باید پیش از ریست‌کردن value اسنپ‌شات شود
    const picked = files ? Array.from(files) : []
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (picked.length === 0) return
    const valid: File[] = []
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        toast.error(`«${f.name}» تصویر نیست — فقط تصویر مجاز است`)
        continue
      }
      if (f.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`حجم «${f.name}» بیش از ۸ مگابایت است`)
        continue
      }
      valid.push(f)
    }
    if (valid.length === 0) return

    setUploading(true)
    let okCount = 0
    try {
      for (const f of valid) {
        const fd = new FormData()
        fd.append("file", f)
        fd.append("refType", "PERSON")
        fd.append("refId", id)
        await postAttachmentForm("/api/attachments", fd)
        okCount++
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "آپلود تصویر ناموفق بود")
    } finally {
      setUploading(false)
    }
    if (okCount > 0) {
      toast.success(okCount > 1 ? `${toPersianDigits(okCount)} تصویر اضافه شد ✅` : "تصویر اضافه شد ✅")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "PERSON", id] })
    }
  }

  /* ── ADV-04: حذف تصویر با تأیید ── */
  const removeAttachment = async (att: Attachment) => {
    const okRemove = await confirm({
      title: "حذف تصویر",
      description: `تصویر «${att.filename}» برای همیشه حذف شود؟`,
      confirmText: "بله، حذف کن",
      tone: "danger",
    })
    if (!okRemove) return
    try {
      await apiDelete(`/api/attachments?id=${att.id}`)
      if (preview?.id === att.id) setPreview(null)
      const url = objectUrlsRef.current.get(att.id)
      if (url) {
        URL.revokeObjectURL(url)
        objectUrlsRef.current.delete(att.id)
        setImgUrls((prev) => {
          const next = { ...prev }
          delete next[att.id]
          return next
        })
      }
      toast.success("تصویر حذف شد")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "PERSON", id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف تصویر ناموفق بود")
    }
  }

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/people")}
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          onClick={openEdit}
          className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          aria-label="ویرایش"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {/* کارت شخص */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <RoleAvatar role={p.role} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold sm:text-lg">{p.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[0.65rem] text-muted-foreground">
              <span className="rounded-md bg-muted px-1.5 py-px font-medium">
                {p.role === "CUSTOMER" ? "مشتری" : p.role === "SUPPLIER" ? "فروشنده" : "مشتری و فروشنده"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          {p.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5" />
              <span className="nums">{p.phone}</span>
            </div>
          )}
          {p.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="size-3.5" />
              {p.company}
            </div>
          )}
          {p.shopAddress && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-3.5" />
              {p.shopAddress}
            </div>
          )}
        </div>

        {/* تراز */}
        <div
          className={cn(
            "mt-4 flex items-center justify-between rounded-2xl px-4 py-3",
            balance > 0
              ? "bg-warning/10"
              : balance < 0
                ? "bg-destructive/10"
                : "bg-income/10"
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              balance > 0 ? "text-warning" : balance < 0 ? "text-destructive" : "text-income"
            )}
          >
            {balance > 0 ? "طلب ما از این شخص" : balance < 0 ? "بدهی ما به این شخص" : "تسویه کامل ✓"}
          </span>
          <span
            className={cn(
              "nums text-base font-extrabold",
              balance > 0 ? "text-warning" : balance < 0 ? "text-destructive" : "text-income"
            )}
          >
            {balance !== 0 ? formatToman(Math.abs(balance), false) : "—"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={() => openSettle("RECEIVE")}
            variant="outline"
            className="h-11 rounded-2xl border-warning/40 text-xs font-bold text-warning hover:bg-warning/10"
          >
            <HandCoins className="size-4" />
            دریافت از شخص
          </Button>
          <Button
            onClick={() => openSettle("PAY")}
            variant="outline"
            className="h-11 rounded-2xl border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/10"
          >
            <HandCoins className="size-4" />
            پرداخت به شخص
          </Button>
        </div>

        {/* اشتراک صورتحساب (ADV-06) */}
        <Button
          onClick={() => setShareSheet(true)}
          variant="outline"
          className="mt-2 h-11 w-full rounded-2xl border-primary/30 text-xs font-bold text-primary hover:bg-primary/10"
        >
          <MessageCircle className="size-4" />
          اشتراک گذاری
        </Button>
      </div>

      {/* فاکتورها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <FileText className="size-4 text-primary" />
          فاکتورها ({toPersianDigits(data.invoices.length)})
        </div>
        <div className="space-y-2">
          {data.invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  inv.type === "SALE" ? "bg-income/10 text-income" : "bg-destructive/10 text-destructive"
                )}
              >
                {inv.type === "SALE" ? (
                  <ArrowUpRight className="size-4" strokeWidth={2.3} />
                ) : (
                  <ArrowDownLeft className="size-4" strokeWidth={2.3} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">
                  {inv.type === "SALE" ? "فروش" : "خرید"} شماره {toPersianDigits(inv.number)}
                </div>
                <div className="nums text-[0.62rem] text-muted-foreground">
                  {formatJalaliShort(new Date(inv.date))}
                </div>
              </div>
              <div className="shrink-0 text-end">
                <div className="nums text-xs font-extrabold">{formatToman(inv.total, false)}</div>
                {inv.credit > 0 && (
                  <div className="nums text-[0.6rem] font-bold text-warning">
                    مانده {formatTomanCompact(inv.credit)}
                  </div>
                )}
              </div>
            </Link>
          ))}
          {data.invoices.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">فاکتوری ثبت نشده</p>
          )}
        </div>
      </div>

      {/* چک‌ها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CheckSquare2 className="size-4 text-primary" />
          چک‌ها ({toPersianDigits(data.checks.length)})
        </div>
        <div className="space-y-2">
          {data.checks.map((c) => (
            <Link
              key={c.id}
              href="/checks"
              className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/50"
            >
              <BankLogo bankKey={c.bankKey} size={34} />
              <div className="min-w-0 flex-1">
                <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                <div className="nums text-[0.62rem] text-muted-foreground">
                  {getBank(c.bankKey).name} • سررسید {formatJalaliShort(new Date(c.dueDate))}
                </div>
              </div>
              <CheckDirectionBadge direction={c.direction} size="sm" />
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                  c.status === "CASHED"
                    ? "bg-income/10 text-income"
                    : c.status === "PENDING"
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                )}
              >
                {c.status === "CASHED" ? "پاس ✓" : c.status === "PENDING" ? "در جریان" : c.status === "BOUNCED" ? "برگشت خورده" : "لغو"}
              </span>
            </Link>
          ))}
          {data.checks.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">چکی ثبت نشده</p>
          )}
        </div>
      </div>

      {/* تسویه‌ها */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <CheckCheck className="size-4 text-primary" />
          تاریخچه تسویه‌ها
        </div>
        <div className="space-y-1.5">
          {data.settlements.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs"
            >
              <div>
                <span className={cn("font-bold", s.direction === "RECEIVE" ? "text-income" : "text-destructive")}>
                  {s.direction === "RECEIVE" ? "دریافت" : "پرداخت"} {s.method === "CASH" ? "نقدی" : "چکی"}
                </span>
                <span className="nums ms-2 text-[0.62rem] text-muted-foreground">
                  {formatJalaliShort(new Date(s.date))}
                </span>
              </div>
              <span className="nums font-extrabold">{formatToman(s.amount, false)}</span>
            </div>
          ))}
          {data.settlements.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">تسویه‌ای ثبت نشده</p>
          )}
        </div>
      </div>

      {/* تصاویر شخص (ADV-04) */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
            <Images className="size-4 shrink-0 text-primary" />
            <span className="truncate">تصاویر</span>
            <span className="nums shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground">
              {toPersianDigits(attachments.length)}
            </span>
            {attLoading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 shrink-0 rounded-2xl px-3 text-xs font-bold"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? "در حال بارگذاری…" : "افزودن تصویر"}
          </Button>
        </div>

        {attachments.length === 0 && !attLoading ? (
          <p className="rounded-2xl bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
            تصویری ثبت نشده — عکس چک، کارت ویزیت یا مدارک این شخص را همین‌جا نگه دارید.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {attachments.map((att) => {
              const isImage = att.mime.startsWith("image/")
              const url = imgUrls[att.id]
              return (
                <div
                  key={att.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40"
                >
                  {isImage ? (
                    url ? (
                      <button
                        type="button"
                        onClick={() => setPreview(att)}
                        aria-label={`پیش‌نمایش ${att.filename}`}
                        className="size-full cursor-zoom-in transition-transform duration-150 active:scale-95"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={att.filename} className="size-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <div className="flex size-full items-center justify-center" aria-label="در حال بارگذاری تصویر">
                        <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
                      </div>
                    )
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                      <FileText className="size-6 text-muted-foreground" />
                      <span className="w-full truncate text-[0.6rem] text-muted-foreground">{att.filename}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att)}
                    aria-label={`حذف تصویر ${att.filename}`}
                    className="absolute end-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-destructive"
                  >
                    <X className="size-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ورودی مخفی انتخاب تصویر (دوربین یا گالری) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onPickImages(e.target.files)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </section>

      {/* ───────── شیت ویرایش ───────── */}
      <BottomSheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        title="ویرایش شخص"
        size="tall"
        footer={
          <Button onClick={saveEdit} disabled={savingEdit} className="h-12 w-full rounded-2xl font-bold">
            {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            ذخیره تغییرات
          </Button>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نام *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">موبایل</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
              className="nums text-end"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">شرکت</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">آدرس مغازه</label>
            <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">نقش</label>
            <div className="flex gap-1.5">
              {(
                [
                  { key: "CUSTOMER", label: "مشتری" },
                  { key: "SUPPLIER", label: "فروشنده" },
                  { key: "BOTH", label: "هردو" },
                ] as const
              ).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRole(r.key)}
                  className={cn(
                    "flex-1 rounded-xl border py-2 text-xs font-bold transition-colors",
                    role === r.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* ───────── شیت تسویه ───────── */}
      <BottomSheet
        open={settleSheet}
        onClose={() => setSettleSheet(false)}
        title={direction === "RECEIVE" ? "دریافت از شخص" : "پرداخت به شخص"}
        description={p.name}
        size="tall"
        footer={
          <Button onClick={settle} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
            ثبت تسویه
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex rounded-2xl bg-muted p-1">
            {(
              [
                { key: "CASH", label: "نقدی" },
                { key: "CHECK", label: "چک" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={cn(
                  "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                  method === m.key ? "bg-card shadow-sm" : "text-muted-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              مبلغ (تومان) *
            </label>
            <AmountInput
              value={amount}
              onChange={setAmount}
              showWords={false}
            />
            {balance !== 0 && amount === 0 && (
              <button
                type="button"
                onClick={() => setAmount(Math.abs(balance))}
                className="mt-1.5 text-[0.7rem] font-medium text-primary hover:underline"
              >
                انتخاب کل تراز ({formatToman(Math.abs(balance), false)})
              </button>
            )}
          </div>

          {method === "CASH" ? (
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                حساب بانکی
              </label>
              <button
                type="button"
                onClick={() => setAccountSheet(true)}
                className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
              >
                {account ? (
                  <>
                    <BankLogo bankKey={account.bankKey} size={30} />
                    <span className="flex-1 text-start text-sm">{account.name}</span>
                  </>
                ) : (
                  <span className="w-full text-center text-sm text-muted-foreground">انتخاب حساب…</span>
                )}
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                  بانک چک *
                </label>
                <button
                  type="button"
                  onClick={() => setBankSheet(true)}
                  className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
                >
                  <BankLogo bankKey={checkBank} size={32} />
                  <span className="flex-1 text-start text-sm">{getBank(checkBank).name}</span>
                  <span className="text-[0.65rem] text-muted-foreground">تغییر</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">سریال</label>
                  <input
                    value={checkSerial}
                    onChange={(e) => setCheckSerial(e.target.value)}
                    dir="ltr"
                    className="field nums text-end"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    سررسید *
                  </label>
                  <JalaliDateField value={checkDue} onChange={setCheckDue} />
                </div>
              </div>

              {/* ثبت چک */}
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                <button
                  type="button"
                  onClick={() => setCheckRegistered((v) => !v)}
                  className="flex w-full items-center gap-2.5 text-start"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      checkRegistered ? "border-primary bg-primary text-white" : "border-input bg-card"
                    )}
                  >
                    {checkRegistered && <BadgeCheck className="size-3.5" strokeWidth={2.6} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-xs font-bold">چک ثبت شده است</span>
                    <span className="mt-0.5 block text-[0.62rem] leading-4 text-muted-foreground">
                      {direction === "RECEIVE" ? "به نام خودتان در بانک ثبت شده" : "به نام این شخص ثبت شده"}
                    </span>
                  </span>
                </button>
                {checkRegistered && (
                  <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-dashed pt-3">
                    <div>
                      <label className="mb-1.5 block text-[0.68rem] font-medium text-muted-foreground">
                        نام صاحب حساب *
                      </label>
                      <input
                        value={checkRegName}
                        onChange={(e) => setCheckRegName(e.target.value)}
                        className="field"
                        placeholder={direction === "RECEIVE" ? "نام خودتان" : p.name}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[0.68rem] font-medium text-muted-foreground">
                        کد ملی (اختیاری)
                      </label>
                      <input
                        value={checkRegNationalId}
                        onChange={(e) => setCheckRegNationalId(e.target.value)}
                        inputMode="numeric"
                        dir="ltr"
                        className="field nums text-end"
                        placeholder="۱۲۳۴۵۶۷۸۹۰"
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="rounded-xl bg-primary/5 px-3 py-2 text-[0.65rem] text-muted-foreground">
                چک دریافت‌شده از مشتری یا داده‌شده به فروشنده؛ ربات تلگرام قبل از سررسید خبر می‌دهد.
                چک ثبت‌نشده پاس/برگشت/لغو نمی‌شود.
              </p>
            </>
          )}
        </div>
      </BottomSheet>

      {/* شیت بانک چک */}
      <BottomSheet open={bankSheet} onClose={() => setBankSheet(false)} title="بانک چک" size="tall">
        <div className="grid grid-cols-2 gap-2">
          {BANKS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => {
                setCheckBank(b.key)
                setBankSheet(false)
              }}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2.5 text-start transition-all active:scale-[0.98]",
                checkBank === b.key
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

      {/* شیت حساب */}
      <BottomSheet open={accountSheet} onClose={() => setAccountSheet(false)} title="انتخاب حساب بانکی">
        <div className="space-y-2">
          {(accountsData?.accounts ?? []).map((a) => (
            <SheetOption
              key={a.id}
              icon={<BankLogo bankKey={a.bankKey} size={40} showBg={false} />}
              title={a.name}
              subtitle={`${getBank(a.bankKey).name} • مانده ${formatToman(a.balance, false)}`}
              selected={account?.id === a.id}
              onClick={() => {
                setAccount(a)
                setAccountSheet(false)
              }}
            />
          ))}
        </div>
      </BottomSheet>

      {/* ───────── شیت اشتراک صورتحساب (ADV-06) ───────── */}
      <BottomSheet
        open={shareSheet}
        onClose={() => setShareSheet(false)}
        title="اشتراک گذاری صورتحساب"
        description={p.name}
      >
        <div className="space-y-3">
          {/* پیش‌نمایش متن */}
          <pre
            dir="rtl"
            className="max-h-48 overflow-y-auto rounded-2xl bg-muted/50 px-3 py-3 text-[0.7rem] leading-relaxed text-muted-foreground whitespace-pre-wrap"
          >
            {buildShareText()}
          </pre>
          <div className="space-y-2">
            <SheetOption
              icon={<MessageCircle className="size-5" />}
              title="ارسال با WhatsApp"
              subtitle={
                !p.phone
                  ? "شماره ثبت نشده — مخاطب را در واتس‌اپ انتخاب کنید"
                  : waPhone
                    ? `به شماره ${toPersianDigits(toLatinDigits(p.phone))}`
                    : "شماره نامعتبر — مخاطب را در واتس‌اپ انتخاب کنید"
              }
              tone="primary"
              onClick={shareWhatsApp}
            />
            {canSystemShare && (
              <SheetOption
                icon={<Share2 className="size-5" />}
                title="اشتراک‌گذاری سیستمی"
                subtitle="اشتراک بومی گوشی (تلگرام، پیامک و…)"
                onClick={() => shareSystem()}
              />
            )}
            <SheetOption
              icon={<Copy className="size-5" />}
              title="کپی متن"
              subtitle="متن صورتحساب در کلیپ‌بورد کپی می‌شود"
              onClick={() => shareCopy()}
            />
          </div>
        </div>
      </BottomSheet>

      {/* پیش‌نمایش تمام‌صفحه تصویر (ADV-04) */}
      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null)
        }}
      >
        <DialogContent className="max-w-[min(94vw,42rem)] gap-3 sm:max-w-[42rem]">
          <DialogHeader className="sr-only">
            <DialogTitle>پیش‌نمایش تصویر</DialogTitle>
            <DialogDescription>{preview?.filename}</DialogDescription>
          </DialogHeader>
          {preview && imgUrls[preview.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrls[preview.id]}
              alt={preview.filename}
              className="mx-auto max-h-[72vh] max-w-full rounded-xl object-contain"
            />
          ) : (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          )}
          {preview && (
            <p className="text-center text-xs text-muted-foreground">
              {preview.filename} •{" "}
              <span className="nums">{toPersianDigits(Math.max(1, Math.round(preview.size / 1024)))} کیلوبایت</span>
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
