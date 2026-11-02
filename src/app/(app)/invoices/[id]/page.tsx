"use client"

/**
 * جزئیات فاکتور — اقلام، پرداخت‌ها، چک‌ها + تسویه مانده + چاپ رسمی (UI-04)
 * + پیوست‌های تصویری (ADV-04) + تأیید حذف با ConfirmSheet یکدست (UI-05)
 */
import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowRight,
  Printer,
  Trash2,
  HandCoins,
  CheckSquare2,
  Banknote,
  FileText,
  ImagePlus,
  Loader2,
  Paperclip,
  Pencil,
  TrendingUp,
  X,
  Clock3,
  CheckCheck,
  PackagePlus,
} from "lucide-react"
import { motion } from "framer-motion"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { apiDelete, apiGet, apiPost } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { diffJalaliDays, formatJalaliShort, formatJalaliWithWeekday } from "@/lib/jalali"
import { formatUnit } from "@/lib/units"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { AmountInput } from "@/components/ui/amount-input"
import { JalaliDateField, todayKey } from "@/components/ui/jalali-date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useConfirm } from "@/components/ui/confirm"
import { cn } from "@/lib/utils"
import { itemsGrossProfit } from "@/lib/finance-math"

interface Invoice {
  id: string
  number: number
  type: string
  date: string
  subtotal: number
  discount: number
  total: number
  paidCash: number
  paidChecks: number
  credit: number
  status: string
  note: string | null
  person: { id: string; name: string; phone: string | null; company: string | null }
  account: { id: string; name: string; bankKey: string } | null
  items: {
    id: string
    productName: string
    brand: string | null
    code: string | null
    unit: string
    quantity: number
    unitPrice: number
    /** قیمت تمام‌شدهٔ لحظهٔ فروش (اسنپ‌شات میانگین خرید) — مبنای سود */
    costPrice: number
    total: number
  }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    direction: string
    dueDate: string
    status: string
    isRegistered: boolean
    registeredName: string | null
    registeredNationalId: string | null
  }[]
  settlements: { id: string; amount: number; method: string; direction: string; date: string }[]
}

interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}

/** پیوست فاکتور — مطابق select در GET /api/attachments */
interface Attachment {
  id: string
  filename: string
  mime: string
  size: number
  createdAt: string
}

/** حد مجاز حجم پیوست — همان MAX_SIZE مسیر /api/attachments */
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024 // ۸ مگابایت

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
    let msg = "آپلود پیوست ناموفق بود"
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
  if (!res.ok) throw new Error("دریافت پیوست ناموفق بود")
  return URL.createObjectURL(await res.blob())
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiGet<{ invoice: Invoice }>(`/api/invoices/${id}`),
  })

  const [settleSheet, setSettleSheet] = useState(false)
  const [settleAmount, setSettleAmount] = useState(0)
  const [settleMethod, setSettleMethod] = useState<"CASH" | "CHECK">("CASH")
  const [settleAccount, setSettleAccount] = useState<Account | null>(null)
  const [checkAmount, setCheckAmount] = useState(0)
  const [checkBank, setCheckBank] = useState("mellat")
  const [checkSerial, setCheckSerial] = useState("")
  const [checkDue, setCheckDue] = useState("")
  const [accountSheet, setAccountSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)

  /* ── پیوست‌های تصویری (ADV-04) ── */
  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["attachments", "INVOICE", id],
    queryFn: () => apiGet<{ attachments: Attachment[] }>(`/api/attachments?refType=INVOICE&refId=${id}`),
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
          /* دانلود این پیوست ناموفق — اسکلت لودینگ جای خود آیکن خطا می‌گیرد */
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

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
    enabled: settleSheet,
  })

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const inv = data.invoice
  const isSale = inv.type === "SALE"

  // ── سود این فاکتور (فقط داخلی — در چاپ/فاکتور مشتری نمایش داده نمی‌شود) ──
  // فرمول هماهنگ با گزارش‌ها: Σ (فی فروش − قیمت تمام‌شده) × تعداد
  const grossProfit = isSale ? Math.round(itemsGrossProfit(inv.items)) : 0
  const netProfit = grossProfit - inv.discount
  const marginPct = inv.subtotal > 0 ? Math.round((grossProfit / inv.subtotal) * 100) : 0

  const settle = async () => {
    if (settleMethod === "CASH") {
      if (!settleAccount) return toast.error("حساب بانکی را انتخاب کنید")
      if (settleAmount <= 0) return toast.error("مبلغ را وارد کنید")
    } else {
      if (checkAmount <= 0) return toast.error("مبلغ چک را وارد کنید")
      if (!checkDue) return toast.error("سررسید چک را انتخاب کنید")
    }
    setSaving(true)
    try {
      await apiPost("/api/settlements", {
        personId: inv.person.id,
        invoiceId: inv.id,
        direction: isSale ? "RECEIVE" : "PAY",
        method: settleMethod,
        amount: settleMethod === "CASH" ? settleAmount : checkAmount,
        accountId: settleMethod === "CASH" ? settleAccount?.id : undefined,
        check:
          settleMethod === "CHECK"
            ? { amount: checkAmount, bankKey: checkBank, serial: checkSerial || undefined, dueDate: checkDue }
            : undefined,
        note: `تسویه مانده فاکتور ${inv.number}`,
      })
      toast.success("تسویه ثبت شد")
      setSettleSheet(false)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت تسویه")
    } finally {
      setSaving(false)
    }
  }

  /* ── چاپ فاکتور: صفحهٔ مستقل با توکن — window.print داخل تلگرام کار نمی‌کند ── */
  const printInvoice = async () => {
    if (printing) return
    setPrinting(true)
    try {
      const r = await apiPost<{ token: string }>("/api/print-token", { resource: "invoice", id: inv.id })
      const url = `${window.location.origin}/api/invoices/${inv.id}/print?t=${encodeURIComponent(r.token)}`
      const tg = window.Telegram?.WebApp
      if (tg?.openLink) {
        tg.openLink(url)
      } else {
        const w = window.open(url, "_blank", "noopener")
        if (!w) {
          toast.error("مرورگر پنجرهٔ چاپ را مسدود کرد — popup را مجاز کنید")
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "آماده‌سازی چاپ ناموفق بود")
    } finally {
      setPrinting(false)
    }
  }

  const remove = async () => {
    const okRemove = await confirm({
      title: "حذف فاکتور",
      description: `فاکتور ${toPersianDigits(inv.number)} و همه اقلام، چک‌ها و تسویه‌هایش حذف شود؟ این کار برگشت‌پذیر نیست.`,
      confirmText: "بله، حذف کن",
      tone: "danger",
    })
    if (!okRemove) return
    try {
      await apiDelete(`/api/invoices/${inv.id}`)
      toast.success("فاکتور حذف شد")
      await queryClient.invalidateQueries()
      window.location.href = "/invoices"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف ناموفق بود")
    }
  }

  /* ── افزودن پیوست تصویری ── */
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
        fd.append("refType", "INVOICE")
        fd.append("refId", inv.id)
        await postAttachmentForm("/api/attachments", fd)
        okCount++
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "آپلود پیوست ناموفق بود")
    } finally {
      setUploading(false)
    }
    if (okCount > 0) {
      toast.success(okCount > 1 ? `${toPersianDigits(okCount)} تصویر پیوست شد` : "تصویر پیوست شد")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "INVOICE", id] })
    }
  }

  /* ── حذف پیوست ── */
  const removeAttachment = async (att: Attachment) => {
    const okRemove = await confirm({
      title: "حذف پیوست",
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
      toast.success("پیوست حذف شد")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "INVOICE", id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف پیوست ناموفق بود")
    }
  }

  const tone = isSale ? "var(--sale)" : "var(--purchase)"
  const paidAtInvoice = Math.min(inv.total, inv.paidCash + inv.paidChecks)
  const settledLater = inv.settlements.reduce((s, x) => s + x.amount, 0)
  const pct = (v: number) => (inv.total > 0 ? Math.min(100, (v / inv.total) * 100) : 0)
  const cashPct = pct(Math.min(inv.paidCash, inv.total))
  const checkPct = pct(Math.min(inv.paidChecks, Math.max(0, inv.total - inv.paidCash)))
  const laterPct = pct(Math.min(settledLater, Math.max(0, inv.total - paidAtInvoice)))
  const daysOpen = Math.max(0, diffJalaliDays(new Date(inv.date), new Date()))
  const openSettle = () => {
    setSettleAmount(inv.credit)
    setCheckAmount(inv.credit)
    setSettleSheet(true)
  }

  // خط زمانی پرداخت‌ها: نقد هنگام فاکتور → چک‌ها → تسویه‌های بعدی
  const timeline: {
    key: string
    title: string
    sub: string
    amount: number
    icon: React.ReactNode
    color: string
    muted?: boolean
    badge?: { text: string; cls: string }
  }[] = [
    ...(inv.paidCash > 0
      ? [
          {
            key: "cash",
            title: isSale ? "نقد دریافت شد" : "نقد پرداخت شد",
            sub: `${formatJalaliShort(new Date(inv.date))}${inv.account ? ` • ${inv.account.name}` : ""}`,
            amount: inv.paidCash,
            icon: <Banknote className="size-4" />,
            color: "var(--sale)",
          },
        ]
      : []),
    ...inv.checks.map((c) => ({
      key: c.id,
      title: `چک ${getBank(c.bankKey).name}${c.serial ? ` • ${toPersianDigits(c.serial)}` : ""}`,
      sub: `سررسید ${formatJalaliShort(new Date(c.dueDate))}${
        c.isRegistered ? (c.registeredName ? ` • به نام ${c.registeredName}` : " • ثبت‌شده") : " • ثبت‌نشده"
      }`,
      amount: c.amount,
      icon: <BankLogo bankKey={c.bankKey} size={26} showBg={false} />,
      color: "var(--hue-checks)",
      muted: c.status === "BOUNCED" || c.status === "CANCELED",
      badge:
        c.status === "CASHED"
          ? { text: "پاس ✓", cls: "bg-income/10 text-income" }
          : c.status === "PENDING"
            ? { text: "در جریان", cls: "bg-[color:color-mix(in_srgb,var(--hue-checks)_12%,transparent)] text-[color:color-mix(in_srgb,var(--hue-checks)_80%,black)]" }
            : c.status === "BOUNCED"
              ? { text: "برگشتی", cls: "bg-destructive/10 text-destructive" }
              : { text: "لغو", cls: "bg-muted text-muted-foreground" },
    })),
    ...inv.settlements.map((st) => ({
      key: st.id,
      title: `تسویهٔ ${st.method === "CASH" ? "نقدی" : "چکی"}`,
      sub: formatJalaliShort(new Date(st.date)),
      amount: st.amount,
      icon: <HandCoins className="size-4" />,
      color: "var(--role-customer)",
    })),
  ]

  return (
    <>
      <div className="space-y-4">
        {/* ───────── سربرگ ───────── */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/invoices"
            aria-label="بازگشت به فاکتورها"
            className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground"
          >
            <ArrowRight className="size-[1.15rem]" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl">
              فاکتور {isSale ? "فروش" : "خرید"} <span className="nums">{toPersianDigits(inv.number)}</span>
            </h1>
            <p className="nums text-[0.68rem] text-muted-foreground">{formatJalaliWithWeekday(new Date(inv.date))}</p>
          </div>
          <div className="flex gap-1.5">
            <Link
              href={`/invoices/new?edit=${inv.id}`}
              className="flex h-11 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground shadow-card transition-colors hover:text-foreground"
              aria-label="ویرایش فاکتور"
            >
              <Pencil className="size-4" />
              <span className="hidden sm:inline">ویرایش</span>
            </Link>
            <button
              onClick={printInvoice}
              disabled={printing}
              className="flex h-11 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground shadow-card transition-colors hover:text-foreground"
              aria-label="چاپ یا PDF"
            >
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              <span className="hidden sm:inline">چاپ / PDF</span>
            </button>
            <button
              onClick={remove}
              className="grid size-11 place-items-center rounded-2xl border border-destructive/25 bg-card text-destructive/80 shadow-card transition-colors hover:bg-destructive/10"
              aria-label="حذف فاکتور"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        {/* ───────── کارت قهرمان ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className={cn(
            "relative overflow-hidden rounded-[1.75rem] p-5 text-white sm:p-6",
            isSale
              ? "bg-[linear-gradient(125deg,#14b886,#0b7a62_55%,#064e3f)] shadow-[0_20px_40px_-18px_rgba(7,74,61,0.6)]"
              : "bg-[linear-gradient(125deg,#7480ee,#4f5bd5_55%,#343c9c)] shadow-[0_20px_40px_-18px_rgba(52,60,156,0.6)]"
          )}
        >
          <div className="relative flex items-start gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/25 backdrop-blur">
              <InvoiceTypeMark type={inv.type} size={34} className="!bg-white !shadow-none" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.7rem] opacity-80">{isSale ? "فروخته شد به" : "خریداری شد از"}</div>
              <Link
                href={`/people/${inv.person.id}`}
                className="block truncate text-lg font-black underline-offset-4 hover:underline sm:text-xl"
              >
                {inv.person.name}
              </Link>
              {(inv.person.company || inv.person.phone) && (
                <div className="nums truncate text-[0.7rem] opacity-80">
                  {[inv.person.company, inv.person.phone && toPersianDigits(inv.person.phone)].filter(Boolean).join(" • ")}
                </div>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[0.66rem] font-extrabold",
                inv.credit > 0 ? "bg-[#ffd86b] text-[#5c3a00]" : "bg-white text-[color:var(--sale)]"
              )}
            >
              {inv.credit > 0 ? "مانده‌دار" : "تسویه ✓"}
            </span>
          </div>

          <div className="relative mt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-[0.68rem] opacity-80">مبلغ نهایی</div>
              <div className="nums text-[1.9rem] font-black leading-none tracking-tight sm:text-[2.3rem]">
                <AnimatedAmount value={inv.total} />
                <span className="ms-1.5 text-xs font-semibold opacity-70">تومان</span>
              </div>
            </div>
            {inv.credit > 0 && (
              <div className="text-end">
                <div className="text-[0.68rem] opacity-80">مانده</div>
                <div className="nums text-base font-extrabold text-[#ffd86b]">{formatToman(inv.credit, false)}</div>
              </div>
            )}
          </div>

          {/* نوار پرداخت */}
          <div className="relative mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/20">
              <motion.span className="h-full bg-white" initial={{ width: 0 }} animate={{ width: `${cashPct}%` }} transition={{ delay: 0.2, type: "spring", stiffness: 120, damping: 20 }} />
              <motion.span className="h-full bg-[#ffc14d]" initial={{ width: 0 }} animate={{ width: `${checkPct}%` }} transition={{ delay: 0.3, type: "spring", stiffness: 120, damping: 20 }} />
              <motion.span className="h-full bg-[#9cc8ff]" initial={{ width: 0 }} animate={{ width: `${laterPct}%` }} transition={{ delay: 0.4, type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <div className="nums mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.64rem] opacity-90">
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-white" />نقد {formatToman(inv.paidCash, false)}</span>
              <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#ffc14d]" />چک {formatToman(inv.paidChecks, false)}</span>
              {settledLater > 0 && (
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#9cc8ff]" />تسویهٔ بعدی {formatToman(settledLater, false)}</span>
              )}
              {inv.credit > 0 && (
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-white/30" />{daysOpen > 0 ? `${toPersianDigits(daysOpen)} روز است باز مانده` : "باز"}</span>
              )}
            </div>
          </div>
        </motion.div>

        {/* دکمهٔ اصلی تسویه */}
        {inv.credit > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Button
              onClick={openSettle}
              style={{ ["--tile" as string]: tone }}
              className="h-14 w-full rounded-2xl bg-[color:var(--tile)] text-sm font-extrabold shadow-fab hover:bg-[color:var(--tile)]/90"
            >
              <HandCoins className="size-5" />
              {isSale ? "دریافت مانده از" : "پرداخت مانده به"} {inv.person.name}
              <span className="nums rounded-lg bg-white/20 px-2 py-0.5 text-xs">{formatToman(inv.credit, false)}</span>
            </Button>
          </motion.div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-5">
          {/* ───────── اقلام ───────── */}
          <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5 lg:col-span-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <span className="grid size-7 place-items-center rounded-xl bg-primary/10 text-primary">
                <FileText className="size-4" />
              </span>
              اقلام
              <span className="nums rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold text-muted-foreground">
                {toPersianDigits(inv.items.length)}
              </span>
            </div>

            {/* دسکتاپ: جدول */}
            <table className="hidden w-full text-xs sm:table">
              <thead>
                <tr className="text-[0.66rem] text-muted-foreground">
                  <th className="w-8 pb-2 text-start font-medium">#</th>
                  <th className="pb-2 text-start font-medium">جنس</th>
                  <th className="pb-2 text-start font-medium">تعداد</th>
                  <th className="pb-2 text-end font-medium">فی</th>
                  <th className="pb-2 text-end font-medium">مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={it.id} style={{ ["--i" as string]: i }} className="hy-rise border-t border-border/60">
                    <td className="nums py-3 text-muted-foreground">{toPersianDigits(i + 1)}</td>
                    <td className="py-3">
                      <div className="font-bold">{it.productName}</div>
                      <div className="text-[0.62rem] text-muted-foreground">
                        {[it.brand, it.code && `کد ${it.code}`].filter(Boolean).join(" • ")}
                        {isSale && (it.costPrice || 0) > 0 && (
                          <span className="nums ms-1 font-bold text-income">
                            {it.brand || it.code ? " • " : ""}سود {formatToman(Math.round((it.unitPrice - it.costPrice) * it.quantity), false)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="nums py-3">{toPersianDigits(it.quantity)} {formatUnit(it.unit)}</td>
                    <td className="nums py-3 text-end text-muted-foreground">{formatToman(it.unitPrice, false)}</td>
                    <td className="nums py-3 text-end font-extrabold">{formatToman(it.total, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* موبایل: ردیف‌ها */}
            <div className="space-y-2 sm:hidden">
              {inv.items.map((it, i) => (
                <div key={it.id} style={{ ["--i" as string]: i }} className="hy-rise flex items-center gap-3 rounded-2xl bg-muted/45 px-3 py-2.5">
                  <span className="nums grid size-7 shrink-0 place-items-center rounded-lg bg-card text-[0.66rem] font-extrabold text-muted-foreground">
                    {toPersianDigits(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold">
                      {it.productName}
                      {it.brand ? <span className="font-medium text-muted-foreground"> — {it.brand}</span> : null}
                    </div>
                    <div className="nums mt-0.5 text-[0.64rem] text-muted-foreground">
                      {toPersianDigits(it.quantity)} {formatUnit(it.unit)} × {formatToman(it.unitPrice, false)}
                      {isSale && (it.costPrice || 0) > 0 && (
                        <span className="font-bold text-income"> • سود {formatToman(Math.round((it.unitPrice - it.costPrice) * it.quantity), false)}</span>
                      )}
                    </div>
                  </div>
                  <div className="nums shrink-0 text-xs font-extrabold">{formatToman(it.total, false)}</div>
                </div>
              ))}
            </div>

            {/* جمع‌ها */}
            <div className="mt-3 space-y-1.5 rounded-2xl bg-muted/45 p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>جمع اقلام</span>
                <span className="nums">{formatToman(inv.subtotal, false)}</span>
              </div>
              {inv.discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>تخفیف</span>
                  <span className="nums text-destructive">−{formatToman(inv.discount, false)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-dashed border-border pt-1.5 text-sm font-extrabold">
                <span>مبلغ نهایی</span>
                <span className="nums">{formatToman(inv.total, false)} <span className="text-[0.62rem] font-medium text-muted-foreground">تومان</span></span>
              </div>
            </div>

            {inv.note && (
              <p className="mt-3 rounded-2xl border border-dashed border-border px-3 py-2.5 text-[0.72rem] leading-6 text-muted-foreground">
                <span className="font-bold text-foreground">یادداشت: </span>
                {inv.note}
              </p>
            )}
          </section>

          <div className="space-y-4 lg:col-span-2">
            {/* ───────── خط زمانی پرداخت‌ها ───────── */}
            <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <span className="grid size-7 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Banknote className="size-4" />
                </span>
                {isSale ? "دریافت‌ها" : "پرداخت‌ها"}
              </div>
              {timeline.length === 0 ? (
                <p className="rounded-2xl bg-muted/45 px-3 py-4 text-center text-[0.72rem] text-muted-foreground">
                  هنوز {isSale ? "پولی دریافت نشده" : "پولی پرداخت نشده"} — کل مبلغ نسیه است
                </p>
              ) : (
                <ol className="relative space-y-3 before:absolute before:inset-y-3 before:start-[1.05rem] before:w-px before:bg-border">
                  {timeline.map((t, i) => (
                    <motion.li
                      key={t.key}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.05 }}
                      className={cn("relative flex items-center gap-3", t.muted && "opacity-55")}
                    >
                      <span
                        style={{ ["--tile" as string]: t.color }}
                        className="relative z-10 grid size-[2.15rem] shrink-0 place-items-center rounded-full bg-card text-[color:var(--tile)] ring-2 ring-[color:color-mix(in_srgb,var(--tile)_30%,transparent)]"
                      >
                        {t.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <span className="truncate">{t.title}</span>
                          {t.badge && (
                            <span className={cn("shrink-0 rounded-md px-1.5 py-px text-[0.56rem] font-bold", t.badge.cls)}>
                              {t.badge.text}
                            </span>
                          )}
                        </div>
                        <div className="nums truncate text-[0.62rem] text-muted-foreground">{t.sub}</div>
                      </div>
                      <span className={cn("nums shrink-0 text-xs font-extrabold", t.muted && "line-through")}>
                        {formatToman(t.amount, false)}
                      </span>
                    </motion.li>
                  ))}
                  <li className="relative flex items-center gap-3">
                    <span
                      className={cn(
                        "relative z-10 grid size-[2.15rem] shrink-0 place-items-center rounded-full text-white",
                        inv.credit > 0 ? "bg-warning" : "bg-income"
                      )}
                    >
                      {inv.credit > 0 ? <Clock3 className="size-4" /> : <CheckCheck className="size-4" />}
                    </span>
                    <div className="flex-1 text-xs font-extrabold">{inv.credit > 0 ? "مانده (نسیه)" : "کامل تسویه شد"}</div>
                    {inv.credit > 0 && (
                      <span className="nums text-xs font-extrabold text-[color:color-mix(in_srgb,var(--warning)_75%,black)]">
                        {formatToman(inv.credit, false)}
                      </span>
                    )}
                  </li>
                </ol>
              )}
            </section>

            {/* ───────── سود (فروش) / اثر روی انبار (خرید) ───────── */}
            {isSale ? (
              <section className="rounded-3xl border border-income/20 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--income)_7%,var(--card)),var(--card))] p-4 shadow-card sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span className="grid size-7 place-items-center rounded-xl bg-income text-white">
                      <TrendingUp className="size-4" />
                    </span>
                    سود این فاکتور
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.58rem] font-bold text-muted-foreground">فقط برای شما — چاپ نمی‌شود</span>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <MarginRing pct={marginPct} />
                  <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">سود اقلام</span>
                      <span className="nums font-bold">{formatToman(grossProfit, false)}</span>
                    </div>
                    {inv.discount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">منهای تخفیف</span>
                        <span className="nums font-bold text-destructive">−{formatToman(inv.discount, false)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-border pt-1.5 text-sm">
                      <span className="font-bold">سود خالص</span>
                      <span className={cn("nums font-extrabold", netProfit >= 0 ? "text-income" : "text-destructive")}>
                        {formatToman(netProfit, false)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-[color:color-mix(in_srgb,var(--purchase)_20%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--purchase)_7%,var(--card)),var(--card))] p-4 shadow-card sm:p-5">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-bold">
                  <span className="grid size-7 place-items-center rounded-xl bg-[color:var(--purchase)] text-white">
                    <PackagePlus className="size-4" />
                  </span>
                  به انبار اضافه شد
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {inv.items.map((it) => (
                    <Link
                      key={it.id}
                      href="/products"
                      className="nums rounded-xl bg-card px-2.5 py-1.5 text-[0.66rem] font-bold ring-1 ring-border transition-colors hover:ring-[color:var(--purchase)]"
                    >
                      <span className="text-[color:var(--purchase)]">+{toPersianDigits(it.quantity)} {formatUnit(it.unit)}</span>{" "}
                      {it.productName}
                    </Link>
                  ))}
                </div>
                <p className="nums mt-2.5 text-[0.62rem] text-muted-foreground">
                  میانگین قیمت هر واحد: {formatToman(Math.round(inv.subtotal / Math.max(1, inv.items.reduce((s, it) => s + it.quantity, 0))), false)} تومان
                </p>
              </section>
            )}
          </div>
        </div>

        {/* پیوست‌ها (تصاویر) — ADV-04 */}
        <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5 ">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
              <Paperclip className="size-4 shrink-0 text-primary" />
              <span className="truncate">پیوست‌ها (تصاویر)</span>
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
              تصویری پیوست نشده — عکس فاکتور کاغذی یا رسید را اضافه کنید تا همین‌جا آرشیو شود.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {attachments.map((att) => {
                const isImage = att.mime.startsWith("image/")
                const url = imgUrls[att.id]
                return (
                  <div
                    key={att.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40"
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
                        <div className="flex size-full items-center justify-center" aria-label="در حال بارگذاری پیوست">
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
                      aria-label={`حذف پیوست ${att.filename}`}
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

        {/* ───────── شیت تسویه مانده ───────── */}
        <BottomSheet
          open={settleSheet}
          onClose={() => setSettleSheet(false)}
          title={`تسویه مانده فاکتور ${toPersianDigits(inv.number)}`}
          description={isSale ? "از مشتری دریافت می‌کنید" : "به فروشنده پرداخت می‌کنید"}
          size="tall"
          footer={
            <Button onClick={settle} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckSquare2 className="size-4" />}
              ثبت تسویه
            </Button>
          }
        >
          <div className="space-y-3">
            {/* روش */}
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
                  onClick={() => setSettleMethod(m.key)}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-xs font-bold transition-all",
                    settleMethod === m.key ? "bg-card shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {settleMethod === "CASH" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    مبلغ (تومان)
                  </label>
                  <AmountInput value={settleAmount} onChange={setSettleAmount} showWords={false} />
                  {inv.credit > 0 && (
                    <button
                      type="button"
                      onClick={() => setSettleAmount(inv.credit)}
                      className="mt-1.5 text-[0.7rem] font-medium text-primary hover:underline"
                    >
                      انتخاب کل مانده ({formatToman(inv.credit, false)})
                    </button>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    واریز/برداشت به حساب
                  </label>
                  <button
                    type="button"
                    onClick={() => setAccountSheet(true)}
                    className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-input bg-card px-3 transition-[color,border-color,box-shadow] hover:border-input/80"
                  >
                    {settleAccount ? (
                      <>
                        <BankLogo bankKey={settleAccount.bankKey} size={30} />
                        <span className="flex-1 text-start text-sm">{settleAccount.name}</span>
                      </>
                    ) : (
                      <span className="w-full text-center text-sm text-muted-foreground">انتخاب حساب…</span>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                    مبلغ چک (تومان)
                  </label>
                  <AmountInput value={checkAmount} onChange={setCheckAmount} showWords={false} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                      سریال
                    </label>
                    <Input
                      value={checkSerial}
                      onChange={(e) => setCheckSerial(e.target.value)}
                      inputMode="numeric"
                      dir="ltr"
                      className="nums text-end"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
                      سررسید *
                    </label>
                    <JalaliDateField value={checkDue} onChange={setCheckDue} />
                  </div>
                </div>
                <p className="rounded-xl bg-primary/5 px-3 py-2 text-[0.65rem] text-muted-foreground">
                  چک تا سررسید «در جریان» می‌ماند و ربات تلگرام قبل از سررسید یادآوری می‌کند. با پاس
                  شدن، گردش بانکی ثبت می‌شود.
                </p>
              </>
            )}
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
                selected={settleAccount?.id === a.id}
                onClick={() => {
                  setSettleAccount(a)
                  setAccountSheet(false)
                }}
              />
            ))}
          </div>
        </BottomSheet>
      </div>


      {/* پیش‌نمایش تمام‌صفحه پیوست */}
      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null)
        }}
      >
        <DialogContent className="max-w-[min(94vw,42rem)] gap-3 sm:max-w-[42rem]">
          <DialogHeader className="sr-only">
            <DialogTitle>پیش‌نمایش پیوست</DialogTitle>
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
    </>
  )
}

/** حلقهٔ حاشیهٔ سود */
function MarginRing({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative grid size-[4.2rem] shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--income)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="text-center leading-none">
        <div className="nums text-sm font-black text-income">{toPersianDigits(Math.round(pct))}٪</div>
        <div className="mt-0.5 text-[0.5rem] text-muted-foreground">حاشیه</div>
      </div>
    </div>
  )
}

/** مبلغ با شمارش نرم از صفر هنگام باز شدن صفحه */
function AnimatedAmount({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 650)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{formatToman(shown, false)}</>
}
