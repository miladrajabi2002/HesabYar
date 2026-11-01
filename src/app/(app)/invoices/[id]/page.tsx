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
  ArrowDownLeft,
  ArrowUpRight,
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
} from "lucide-react"
import { apiDelete, apiGet, apiPost } from "@/lib/api-client"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday } from "@/lib/jalali"
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
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"

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
  const grossProfit = isSale
    ? Math.round(inv.items.reduce((s, it) => s + (it.unitPrice - (it.costPrice || 0)) * it.quantity, 0))
    : 0
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
      toast.success("تسویه ثبت شد ✅")
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
      toast.success(okCount > 1 ? `${toPersianDigits(okCount)} تصویر پیوست شد ✅` : "تصویر پیوست شد ✅")
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

  return (
    <>
      <div className="space-y-4 ">
        {/* هدر */}
        <div className="flex items-center justify-between gap-3 ">
          <Link
            href="/invoices"
            className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
          >
            <ArrowRight className="size-4" />
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/invoices/new?edit=${inv.id}`}
              className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
              aria-label="ویرایش فاکتور"
            >
              <Pencil className="size-4" />
            </Link>
            <button
              onClick={printInvoice}
              disabled={printing}
              className="flex size-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent"
              aria-label="چاپ فاکتور"
              title="چاپ / ذخیره PDF"
            >
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            </button>
            <button
              onClick={remove}
              className="flex size-10 items-center justify-center rounded-2xl border border-destructive/30 bg-card text-destructive/80 transition-colors hover:bg-destructive/10"
              aria-label="حذف فاکتور"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        {/* کارت اصلی */}
        <div
          className={cn(
            "overflow-hidden rounded-3xl border shadow-card ",
            isSale ? "border-income/25" : "border-destructive/25"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 p-4 text-white sm:p-5",
              isSale
                ? "bg-gradient-to-l from-income to-[#0d8a4a]"
                : "bg-gradient-to-l from-destructive to-[#c73a3f]"
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/25 backdrop-blur">
              {isSale ? (
                <ArrowUpRight className="size-6" strokeWidth={2.4} />
              ) : (
                <ArrowDownLeft className="size-6" strokeWidth={2.4} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.7rem] opacity-85">
                {isSale ? "فاکتور فروش" : "فاکتور خرید"} — شماره {toPersianDigits(inv.number)}
              </div>
              <p className="truncate text-base font-extrabold sm:text-lg">{inv.person.name}</p>
              <p className="nums text-[0.68rem] opacity-85">{formatJalaliWithWeekday(new Date(inv.date))}</p>
            </div>
            <div className="shrink-0 text-end">
              <div className="nums text-lg font-extrabold sm:text-xl">{formatToman(inv.total, false)}</div>
              <div className="text-[0.65rem] opacity-85">تومان</div>
            </div>
          </div>

          {/* اقلام */}
          <div className="bg-card p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <FileText className="size-4 text-primary" />
              اقلام ({toPersianDigits(inv.items.length)})
            </div>
            <div className="space-y-2">
              {inv.items.map((it) => (
                <div key={it.id} className="rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold">
                        {it.productName}
                        {it.brand ? <span className="text-muted-foreground"> — {it.brand}</span> : null}
                      </div>
                      <div className="nums mt-0.5 text-[0.65rem] text-muted-foreground">
                        {toPersianDigits(it.quantity)} {formatUnit(it.unit)} × {formatToman(it.unitPrice, false)}
                        {it.code ? ` • کد ${it.code}` : ""}
                      </div>
                      {/* سود این قلم — فقط در فاکتور فروش و برای خودمان */}
                      {isSale && (it.costPrice || 0) > 0 && (
                        <div className="nums mt-0.5 text-[0.65rem] font-bold text-income">
                          سود قلم: {formatToman(Math.round((it.unitPrice - it.costPrice) * it.quantity), false)}
                        </div>
                      )}
                    </div>
                    <div className="nums shrink-0 text-xs font-extrabold">{formatToman(it.total, false)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* جمع‌ها */}
            <div className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-xs">
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
              <div className="flex justify-between text-sm font-extrabold">
                <span>مبلغ نهایی</span>
                <span className="nums">{formatToman(inv.total, false)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* سود فاکتور — فقط برای خودمان؛ در فاکتور چاپی نمی‌آید */}
        {isSale && (
          <div className="rounded-3xl border border-income/25 bg-income/5 p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-income">
                <TrendingUp className="size-4" />
                سود این فاکتور
              </div>
              <span className="rounded-md bg-income/10 px-1.5 py-px text-[0.6rem] font-bold text-income">
                فقط نمایش داخلی
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-card p-3">
                <p className="text-[0.62rem] text-muted-foreground">سود ناخالص</p>
                <p className="nums mt-0.5 text-sm font-extrabold text-income">
                  {formatToman(grossProfit, false)}
                </p>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <p className="text-[0.62rem] text-muted-foreground">حاشیه سود</p>
                <p className="nums mt-0.5 text-sm font-extrabold text-income">
                  {toPersianDigits(String(marginPct))}٪
                </p>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <p className="text-[0.62rem] text-muted-foreground">
                  {inv.discount > 0 ? "سود پس از تخفیف" : "پس از تخفیف"}
                </p>
                <p
                  className={cn(
                    "nums mt-0.5 text-sm font-extrabold",
                    netProfit >= 0 ? "text-income" : "text-destructive"
                  )}
                >
                  {formatToman(netProfit, false)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-center text-[0.62rem] text-muted-foreground">
              سود = (فی فروش − قیمت تمام‌شده) × تعداد اقلام — در فاکتور چاپی نمایش داده نمی‌شود
            </p>
          </div>
        )}

        {/* پرداخت‌ها */}
        <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5 ">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Banknote className="size-4 text-primary" />
            پرداخت‌ها
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="text-[0.62rem] text-muted-foreground">نقدی</p>
              <p className="nums mt-0.5 text-xs font-bold">{formatToman(inv.paidCash, false)}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3">
              <p className="text-[0.62rem] text-muted-foreground">چک</p>
              <p className="nums mt-0.5 text-xs font-bold">{formatToman(inv.paidChecks, false)}</p>
            </div>
            <div
              className={cn(
                "rounded-2xl p-3",
                inv.credit > 0 ? "bg-warning/10" : "bg-income/10"
              )}
            >
              <p className={cn("text-[0.62rem]", inv.credit > 0 ? "text-warning" : "text-income")}>
                {inv.credit > 0 ? "مانده نسیه" : "وضعیت"}
              </p>
              <p
                className={cn(
                  "nums mt-0.5 text-xs font-bold",
                  inv.credit > 0 ? "text-warning" : "text-income"
                )}
              >
                {inv.credit > 0 ? formatToman(inv.credit, false) : "تسویه ✓"}
              </p>
            </div>
          </div>

          {inv.account && (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2 text-xs">
              <BankLogo bankKey={inv.account.bankKey} size={28} />
              <span className="text-muted-foreground">حساب نقدی:</span>
              <span className="font-bold">{inv.account.name}</span>
            </div>
          )}

          {/* چک‌ها */}
          {inv.checks.length > 0 && (
            <div className="mt-3 space-y-2">
              {inv.checks.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-border/60 px-3 py-2.5"
                >
                  <BankLogo bankKey={c.bankKey} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="nums text-xs font-bold">{formatToman(c.amount, false)}</div>
                    <div className="nums text-[0.62rem] text-muted-foreground">
                      {getBank(c.bankKey).name} • سررسید{" "}
                      {new Date(c.dueDate).toLocaleDateString("fa-IR")}
                      {c.isRegistered
                        ? c.registeredName
                          ? ` • ثبت به نام ${c.registeredName}`
                          : " • ثبت‌شده"
                        : " • ثبت‌نشده"}
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
                          : c.status === "BOUNCED"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                    )}
                  >
                    {c.status === "CASHED"
                      ? "پاس ✓"
                      : c.status === "PENDING"
                        ? "در جریان"
                        : c.status === "BOUNCED"
                          ? "برگشت خورده"
                          : "لغو"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* تسویه‌های بابت فاکتور */}
          {inv.settlements.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {inv.settlements.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-[0.7rem]">
                  <span className="text-muted-foreground">
                    تسویه {s.method === "CASH" ? "نقدی" : "چکی"} —{" "}
                    {new Date(s.date).toLocaleDateString("fa-IR")}
                  </span>
                  <span className="nums font-bold">{formatToman(s.amount, false)}</span>
                </div>
              ))}
            </div>
          )}

          {inv.credit > 0 && (
            <Button
              onClick={() => {
                setSettleAmount(inv.credit)
                setCheckAmount(inv.credit)
                setSettleSheet(true)
              }}
              className="mt-4 h-12 w-full rounded-2xl font-bold shadow-fab"
            >
              <HandCoins className="size-4" />
              تسویه مانده ({formatToman(inv.credit, false)} تومان)
            </Button>
          )}

          {inv.note && (
            <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-2.5 text-[0.7rem] text-muted-foreground">
              📝 {inv.note}
            </p>
          )}
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
