"use client"

/**
 * چک‌ها — دریافتی/صادره با وضعیت پاس، برگشت و سررسید
 * + پیوست‌های تصویری چک در شیت عملیات (ADV-04)
 * + تأیید لغو چک با ConfirmSheet یکدست (UI-05)
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckSquare2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Undo2,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Ban,
  FileText,
  ImagePlus,
  Paperclip,
  X,
} from "lucide-react"
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, nowTehran, diffJalaliDays, startOfJalaliDay } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"
import { cn } from "@/lib/utils"

interface Check {
  id: string
  serial: string
  amount: number
  bankKey: string
  direction: string
  dueDate: string
  status: string
  note: string | null
  person: { id: string; name: string }
  invoice: { id: string; number: number; type: string } | null
  account: { id: string; name: string; bankKey: string } | null
}

interface Account {
  id: string
  name: string
  bankKey: string
  balance: number
}

/** پیوست چک — مطابق select در GET /api/attachments */
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
 * قابل خواندن نیست، آپلود multipart مستقیم با هدر احراز هویت فرستاده می‌شود
 * تا مرورگر boundary را خودش تعیین کند.
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

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در جریان",
  CASHED: "پاس‌شده",
  BOUNCED: "برگشت خورده",
  CANCELED: "لغو‌شده",
}

export default function ChecksPage() {
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const [direction, setDirection] = useState<"ALL" | "RECEIVED" | "ISSUED">("ALL")
  const [status, setStatus] = useState<"PENDING" | "CASHED" | "BOUNCED" | "ALL">("PENDING")
  const [actionSheet, setActionSheet] = useState<Check | null>(null)
  const [accountSheet, setAccountSheet] = useState(false)
  const [bounceSheet, setBounceSheet] = useState(false)
  const [saving, setSaving] = useState(false)

  const params = new URLSearchParams()
  if (direction !== "ALL") params.set("direction", direction)
  if (status !== "ALL") params.set("status", status)
  params.set("pageSize", "100")

  const { data, isLoading } = useQuery({
    queryKey: ["checks", direction, status],
    queryFn: () =>
      apiGet<{
        checks: Check[]
        summary: { pendingReceived: number; pendingIssued: number; cashedReceived: number; cashedIssued: number }
      }>(`/api/checks?${params}`),
  })

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: Account[] }>("/api/accounts"),
    enabled: accountSheet,
  })

  /* ── پیوست‌های تصویری چک (ADV-04) — فقط برای چکی که شیت عملیاتش باز است ── */
  const activeCheckId = actionSheet?.id
  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["attachments", "CHECK", activeCheckId],
    queryFn: () =>
      apiGet<{ attachments: Attachment[] }>(`/api/attachments?refType=CHECK&refId=${activeCheckId}`),
    enabled: !!activeCheckId,
  })
  const checkAttachments = attData?.attachments ?? []

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({})
  const objectUrlsRef = useRef<Map<string, string>>(new Map())

  /** کلید پایدار لیست تصویرها تا objectURL ها فقط یک‌بار و به‌ترتیب دانلود شوند */
  const imageIdsKey = checkAttachments
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
          /* دانلود این پیوست ناموفق — جای اسکلت لودینگ می‌ماند */
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

  const checks = data?.checks ?? []
  const summary = data?.summary

  const cashCheck = async (check: Check, accountId: string) => {
    setSaving(true)
    try {
      await apiPatch(`/api/checks/${check.id}`, { status: "CASHED", accountId })
      toast.success("چک پاس شد ✅ گردش بانکی ثبت شد")
      setActionSheet(null)
      setAccountSheet(false)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت پاس چک")
    } finally {
      setSaving(false)
    }
  }

  const bounceCheck = async (check: Check) => {
    setSaving(true)
    try {
      await apiPatch(`/api/checks/${check.id}`, { status: "BOUNCED" })
      toast.success("برگشت چک ثبت شد؛ مانده به حساب شخص برگشت")
      setBounceSheet(false)
      setActionSheet(null)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت برگشت")
    } finally {
      setSaving(false)
    }
  }

  const cancelCheck = async (check: Check) => {
    if (
      !(
        await confirm({
          title: "لغو چک",
          description: "چک لغو شود؟ مبلغش به حساب شخص برمی‌گردد.",
          confirmText: "بله، لغو کن",
          tone: "danger",
        })
      )
    )
      return
    setSaving(true)
    try {
      await apiPatch(`/api/checks/${check.id}`, { status: "CANCELED" })
      toast.success("چک لغو شد")
      setActionSheet(null)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در لغو")
    } finally {
      setSaving(false)
    }
  }

  /* ── افزودن پیوست تصویری به چک (ADV-04) ── */
  const onPickImages = async (files: FileList | null) => {
    // FileList نمایندهٔ زندهٔ انتخاب input است؛ باید پیش از ریست‌کردن value اسنپ‌شات شود
    const check = actionSheet
    if (!check) return
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
        fd.append("refType", "CHECK")
        fd.append("refId", check.id)
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
      await queryClient.invalidateQueries({ queryKey: ["attachments", "CHECK", check.id] })
    }
  }

  /* ── حذف پیوست تصویری چک ── */
  const removeAttachment = async (att: Attachment) => {
    const check = actionSheet
    if (!check) return
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
      toast.success("پیوست حذف شد")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "CHECK", check.id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف پیوست ناموفق بود")
    }
  }

  const today = startOfJalaliDay(nowTehran())

  return (
    <div>
      <h1 className="mb-4 text-lg font-extrabold sm:text-xl">چک‌ها</h1>

      {/* خلاصه */}
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3.5">
            <div className="flex items-center gap-1.5 text-[0.7rem] text-primary">
              <ArrowDownToLine className="size-3.5" />
              چک دریافت‌شده در جریان
            </div>
            <p className="nums mt-1 text-base font-extrabold text-primary sm:text-lg">
              {formatTomanCompact(summary.pendingReceived)}
            </p>
          </div>
          <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-3.5">
            <div className="flex items-center gap-1.5 text-[0.7rem] text-destructive">
              <ArrowUpFromLine className="size-3.5" />
              چک صادره در جریان
            </div>
            <p className="nums mt-1 text-base font-extrabold text-destructive sm:text-lg">
              {formatTomanCompact(summary.pendingIssued)}
            </p>
          </div>
        </div>
      )}

      {/* فیلترها */}
      <div className="mb-4 space-y-2.5">
        <div className="flex gap-2">
          {(
            [
              { key: "ALL", label: "همه" },
              { key: "RECEIVED", label: "دریافتی" },
              { key: "ISSUED", label: "صادره" },
            ] as const
          ).map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDirection(d.key)}
              className={cn(
                "flex-1 rounded-2xl border py-2 text-xs font-bold transition-all",
                direction === d.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "PENDING", label: "در جریان" },
              { key: "CASHED", label: "پاس‌شده" },
              { key: "BOUNCED", label: "برگشت خورده" },
              { key: "ALL", label: "همه" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              className={cn(
                "flex-1 rounded-2xl border py-2 text-xs font-bold transition-all",
                status === s.key
                  ? s.key === "BOUNCED"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* لیست */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : checks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <CheckSquare2 className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">چکی در این دسته نیست</p>
          <p className="mt-1 text-xs text-muted-foreground">
            چک‌ها هنگام ثبت فاکتور یا تسویه چکی ساخته می‌شوند
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {checks.map((c) => {
            const daysLeft = diffJalaliDays(today, new Date(c.dueDate))
            const overdue = c.status === "PENDING" && daysLeft < 0
            const soon = c.status === "PENDING" && daysLeft >= 0 && daysLeft <= 3
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => c.status === "PENDING" && setActionSheet(c)}
                className={cn(
                  "block w-full rounded-3xl border bg-card p-4 text-start shadow-card transition-all",
                  c.status === "PENDING" && "hover:shadow-card-hover active:scale-[0.995]",
                  c.status !== "PENDING" && "shadow-none",
                  overdue
                    ? "border-destructive/40"
                    : soon
                      ? "border-warning/40"
                      : c.status === "CASHED"
                        ? "border-income/25"
                        : c.status === "BOUNCED"
                          ? "border-destructive/25"
                          : "border-border/70"
                )}
              >
                <div className="flex items-center gap-3">
                  <BankLogo bankKey={c.bankKey} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-extrabold">{c.person.name}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                          c.direction === "RECEIVED"
                            ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {c.direction === "RECEIVED" ? "دریافتی" : "صادره"}
                      </span>
                    </div>
                    <div className="nums mt-0.5 text-[0.65rem] text-muted-foreground">
                      {getBank(c.bankKey).name} • سررسید {formatJalaliWithWeekday(new Date(c.dueDate))}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div
                      className={cn(
                        "nums text-sm font-extrabold",
                        c.status !== "PENDING" && "text-muted-foreground"
                      )}
                    >
                      {formatToman(c.amount, false)}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-px text-[0.6rem] font-bold",
                        c.status === "CASHED"
                          ? "bg-income/10 text-income"
                          : c.status === "BOUNCED"
                            ? "bg-destructive/10 text-destructive"
                            : c.status === "PENDING"
                              ? overdue
                                ? "bg-destructive/10 text-destructive"
                                : soon
                                  ? "bg-warning/10 text-warning"
                                  : "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.status === "CASHED" ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          پاس شده
                        </>
                      ) : c.status === "BOUNCED" ? (
                        <>
                          <Ban className="size-3" />
                          برگشت خورده
                        </>
                      ) : c.status === "PENDING" ? (
                        <>
                          <Clock3 className="size-3" />
                          {overdue
                            ? `${toPersianDigits(Math.abs(daysLeft))} روز گذشته`
                            : daysLeft === 0
                              ? "امروز سررسید"
                              : `${toPersianDigits(daysLeft)} روز مانده`}
                        </>
                      ) : (
                        STATUS_LABEL[c.status]
                      )}
                    </div>
                  </div>
                </div>
                {(c.serial || c.invoice) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed pt-2 text-[0.6rem] text-muted-foreground">
                    {c.serial && (
                      <span className="nums rounded-lg bg-muted px-2 py-0.5">سریال {c.serial}</span>
                    )}
                    {c.invoice && (
                      <Link
                        href={`/invoices/${c.invoice.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-muted px-2 py-0.5 font-medium text-primary hover:underline"
                      >
                        فاکتور {toPersianDigits(c.invoice.number)}
                      </Link>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* شیت عملیات چک */}
      <BottomSheet
        open={!!actionSheet}
        onClose={() => setActionSheet(null)}
        title="اقدام روی چک"
        description={actionSheet ? `${actionSheet.person.name} • ${formatToman(actionSheet.amount)}` : ""}
      >
        {actionSheet && (
          <div className="space-y-2.5">
            <SheetOption
              icon={<CheckCircle2 className="size-5" />}
              title="پاس شد"
              subtitle="مبلغ به حساب بانکی واریز/برداشت شد"
              tone="primary"
              onClick={() => setAccountSheet(true)}
            />
            <SheetOption
              icon={<Undo2 className="size-5" />}
              title="برگشت خورد"
              subtitle="چک پاس نشد؛ مانده به حساب شخص برمی‌گردد"
              tone="danger"
              onClick={() => bounceCheck(actionSheet)}
            />
            <SheetOption
              icon={<XCircle className="size-5" />}
              title="لغو"
              subtitle="چک باطل شد"
              tone="danger"
              onClick={() => cancelCheck(actionSheet)}
            />

            {/* پیوست‌های تصویری چک (ADV-04) — نوار بندانگشتی‌ها داخل همان شیت */}
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
                  <Paperclip className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">پیوست‌های چک</span>
                  <span className="nums shrink-0 rounded-full bg-muted px-1.5 py-px text-[0.6rem] font-bold text-muted-foreground">
                    {toPersianDigits(checkAttachments.length)}
                  </span>
                  {attLoading && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-8 shrink-0 rounded-xl px-2.5 text-[0.7rem] font-bold"
                >
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                  {uploading ? "در حال بارگذاری…" : "افزودن تصویر"}
                </Button>
              </div>

              {checkAttachments.length === 0 && !attLoading ? (
                <p className="rounded-xl bg-muted/40 px-2.5 py-4 text-center text-[0.68rem] leading-relaxed text-muted-foreground">
                  تصویری پیوست نشده — عکس چک را اضافه کنید تا همین‌جا آرشیو شود.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {checkAttachments.map((att) => {
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
                              <img src={url} alt={att.filename} className="size-full object-cover" loading="lazy" />
                            </button>
                          ) : (
                            <div
                              className="flex size-full items-center justify-center"
                              aria-label="در حال بارگذاری پیوست"
                            >
                              <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
                            </div>
                          )
                        ) : (
                          <div className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                            <FileText className="size-5 text-muted-foreground" />
                            <span className="w-full truncate text-[0.55rem] text-muted-foreground">
                              {att.filename}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(att)}
                          aria-label={`حذف تصویر ${att.filename}`}
                          className="absolute end-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-destructive"
                        >
                          <X className="size-3" strokeWidth={2.4} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ورودی مخفی انتخاب تصویر (دوربین در موبایل) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => onPickImages(e.target.files)}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* شیت انتخاب حساب برای پاس چک */}
      <BottomSheet
        open={accountSheet}
        onClose={() => setAccountSheet(false)}
        title="چک در کدام حساب پاس شود؟"
        description={actionSheet ? formatToman(actionSheet.amount) : ""}
      >
        <div className="space-y-2">
          {(accountsData?.accounts ?? []).map((a) => (
            <SheetOption
              key={a.id}
              icon={<BankLogo bankKey={a.bankKey} size={40} showBg={false} />}
              title={a.name}
              subtitle={`${getBank(a.bankKey).name} • مانده ${formatToman(a.balance, false)}`}
              onClick={() => actionSheet && cashCheck(actionSheet, a.id)}
            />
          ))}
          {(accountsData?.accounts ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">حساب بانکی ثبت نشده</p>
          )}
        </div>
      </BottomSheet>

      {/* پیش‌نمایش تمام‌صفحه پیوست چک (ADV-04) — روی شیت عملیات باز می‌شود */}
      <BottomSheet
        open={!!preview}
        onClose={() => setPreview(null)}
        title="پیش‌نمایش پیوست"
        description={preview?.filename}
      >
        <div className="space-y-3">
          {preview && imgUrls[preview.id] ? (
            <img
              src={imgUrls[preview.id]}
              alt={preview.filename}
              className="mx-auto max-h-[64dvh] max-w-full rounded-xl object-contain"
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
        </div>
      </BottomSheet>
    </div>
  )
}
