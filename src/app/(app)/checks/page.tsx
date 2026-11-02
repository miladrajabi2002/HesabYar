"use client"

/**
 * چک‌ها — دریافتی/صادره با وضعیت پاس، برگشت و سررسید
 * + پیوست‌های تصویری چک در شیت عملیات، زیر وضعیت ثبت و بالای گزینه‌های پاس/برگشت/لغو (ADV-04)
 *   عکس چک مستقل از وضعیت ثبت است — چک ثبت‌نشده هم می‌تواند عکس داشته باشد
 * + ثبت چک به نام (نسخهٔ ۳): چک ثبت‌نشده پاس/برگشت/لغو نمی‌شود
 *   دریافتی → به نام ما • صادره → به نام مشتری (نام + کد ملی)
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import {
  CheckSquare2,
  Loader2,
  Undo2,
  XCircle,
  CheckCircle2,
  Clock3,
  Ban,
  FileText,
  ImagePlus,
  Paperclip,
  X,
  BadgeCheck,
  BadgeMinus,
  IdCard,
  UserRound,
} from "lucide-react"
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, nowTehran, diffJalaliDays, startOfJalaliDay } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm"
import { CheckDirectionBadge } from "@/components/ui/check-direction-badge"
import { cn } from "@/lib/utils"
import { Segmented } from "@/components/ui/segmented"
import { SwipeRow } from "@/components/ui/swipe-row"

interface Check {
  id: string
  serial: string
  amount: number
  bankKey: string
  direction: string
  dueDate: string
  status: string
  note: string | null
  isRegistered: boolean
  registeredName: string | null
  registeredNationalId: string | null
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
}

const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024

/** آپلود پیوست با FormData — در مینی‌اپ تلگرام fetch خودکار JSON نمی‌گذارد */
async function postAttachmentForm(url: string, fd: FormData): Promise<void> {
  const headers: Record<string, string> = {}
  const initData = window.Telegram?.WebApp?.initData
  if (initData) headers["x-telegram-init-data"] = initData
  const res = await fetch(url, { method: "POST", body: fd, headers })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || "آپلود پیوست ناموفق بود")
  }
}

/** دانلود پیوست به‌صورت blob — کوکی نشست در تلگرام نیست، هدر مینی‌اپ لازم است */
async function fetchAttachmentObjectUrl(id: string): Promise<string> {
  const headers: Record<string, string> = {}
  const initData = window.Telegram?.WebApp?.initData
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
  const [saving, setSaving] = useState(false)

  /* ── شیت ثبت چک ── */
  const [registerSheet, setRegisterSheet] = useState(false)
  const [regName, setRegName] = useState("")
  const [regNationalId, setRegNationalId] = useState("")

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
  const regFileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [regUploading, setRegUploading] = useState(false)
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
      toast.success("چک پاس شد گردش بانکی ثبت شد")
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

  /* ── ثبت چک به نام ── */
  const openRegisterSheet = () => {
    if (!actionSheet) return
    setRegName(actionSheet.registeredName ?? "")
    setRegNationalId(actionSheet.registeredNationalId ?? "")
    setRegisterSheet(true)
  }

  const registerCheck = async () => {
    const check = actionSheet
    if (!check) return
    const name = regName.trim()
    if (name.length < 2) return toast.error("نام صاحب حساب را وارد کنید")
    if (regNationalId.trim() && !/^\d{10}$/.test(regNationalId.trim())) {
      return toast.error("کد ملی باید ۱۰ رقم باشد")
    }
    setSaving(true)
    try {
      await apiPatch(`/api/checks/${check.id}`, {
        action: "register",
        isRegistered: true,
        registeredName: name,
        registeredNationalId: regNationalId.trim() || undefined,
      })
      toast.success("چک ثبت شد")
      setRegisterSheet(false)
      setActionSheet(null)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت چک")
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
      toast.success(okCount > 1 ? `${toPersianDigits(okCount)} تصویر پیوست شد` : "تصویر پیوست شد")
      await queryClient.invalidateQueries({ queryKey: ["attachments", "CHECK", check.id] })
    }
  }

  /* ── پیوست تصویر موقع «ثبت چک» ── */
  const onPickRegisterImages = async (files: FileList | null) => {
    const check = actionSheet
    if (!check) return
    const picked = files ? Array.from(files) : []
    if (regFileInputRef.current) regFileInputRef.current.value = ""
    if (picked.length === 0) return
    const valid = picked.filter((f) => f.type.startsWith("image/") && f.size <= MAX_ATTACHMENT_SIZE)
    if (valid.length === 0) {
      toast.error("فقط تصویر (حداکثر ۸ مگابایت) مجاز است")
      return
    }
    setRegUploading(true)
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
      setRegUploading(false)
    }
    if (okCount > 0) {
      toast.success("تصویر چک پیوست شد")
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
      <h1 className="mb-4 hidden text-lg font-extrabold lg:block lg:text-xl">چک‌ها</h1>

      {/* خلاصه — دو کارت در جریان با نوار نسبت */}
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {(
            [
              { key: "RECEIVED", label: "دریافتی در جریان", value: summary.pendingReceived, tone: "var(--sale)" },
              { key: "ISSUED", label: "صادره در جریان", value: summary.pendingIssued, tone: "var(--purchase)" },
            ] as const
          ).map((c, i) => {
            const all = summary.pendingReceived + summary.pendingIssued
            return (
              <motion.button
                key={c.key}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 380, damping: 30 }}
                onClick={() => setDirection(direction === c.key ? "ALL" : c.key)}
                style={{ ["--tile" as string]: c.tone }}
                className={cn(
                  "rounded-3xl border bg-card p-3.5 text-start shadow-card transition-all active:scale-[0.98]",
                  direction === c.key
                    ? "border-[color:var(--tile)] ring-2 ring-[color:color-mix(in_srgb,var(--tile)_18%,transparent)]"
                    : "border-border/70"
                )}
              >
                <div className="flex items-center gap-2 text-[0.72rem] font-bold text-muted-foreground">
                  <CheckDirectionBadge direction={c.key} iconOnly />
                  {c.label}
                </div>
                <p className="nums mt-2 text-base font-extrabold text-[color:var(--tile)] sm:text-lg">
                  {formatTomanCompact(c.value)}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-[color:var(--tile)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${all ? (c.value / all) * 100 : 0}%` }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 120, damping: 20 }}
                  />
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* فیلترها */}
      <div className="mb-4 space-y-2">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { key: "PENDING", label: "در جریان", tone: "var(--hue-checks)" },
            { key: "CASHED", label: "پاس‌شده", tone: "var(--income)" },
            { key: "BOUNCED", label: "برگشتی", tone: "var(--destructive)" },
            { key: "ALL", label: "همه" },
          ]}
        />
        <Segmented
          size="sm"
          value={direction}
          onChange={setDirection}
          options={[
            { key: "ALL", label: "دریافتی و صادره" },
            { key: "RECEIVED", label: "دریافتی", tone: "var(--sale)" },
            { key: "ISSUED", label: "صادره", tone: "var(--purchase)" },
          ]}
          className="sm:max-w-md"
        />
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
          {checks.map((c, i) => {
            const daysLeft = diffJalaliDays(today, new Date(c.dueDate))
            const overdue = c.status === "PENDING" && daysLeft < 0
            const soon = c.status === "PENDING" && daysLeft >= 0 && daysLeft <= 3
            const swipeable = c.status === "PENDING"
            return (
              <motion.div
                key={c.id}
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.035, 0.35), type: "spring", stiffness: 380, damping: 32 }}
              >
              <SwipeRow
                hint={i === 0 && swipeable}
                disabled={!swipeable}
                trailing={[
                  {
                    key: "cash",
                    label: c.direction === "RECEIVED" ? "پاس شد" : "پرداخت شد",
                    icon: <CheckCircle2 className="size-4" />,
                    color: "var(--income)",
                    onAction: () => {
                      if (!c.isRegistered) {
                        toast.error("چک ثبت‌نشده قابل پاس شدن نیست — اول ثبتش کنید")
                        setActionSheet(c)
                        return
                      }
                      setActionSheet(c)
                      setAccountSheet(true)
                    },
                  },
                ]}
                leading={[
                  {
                    key: "bounce",
                    label: "برگشت",
                    icon: <Ban className="size-4" />,
                    color: "var(--destructive)",
                    onAction: async () => {
                      if (!c.isRegistered) {
                        toast.error("چک ثبت‌نشده قابل برگشت نیست — اول ثبتش کنید")
                        setActionSheet(c)
                        return
                      }
                      const okBounce = await confirm({
                        title: "برگشت چک",
                        description: `چک ${formatToman(c.amount)} «${c.person.name}» برگشت خورده؟ مبلغ به حساب شخص برمی‌گردد.`,
                        confirmText: "بله، برگشت خورد",
                        tone: "danger",
                      })
                      if (okBounce) bounceCheck(c)
                    },
                  },
                ]}
              >
              <button
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
                      <CheckDirectionBadge direction={c.direction} size="sm" />
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
                {(c.serial || c.invoice || c.status === "PENDING") && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-dashed pt-2 text-[0.6rem] text-muted-foreground">
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
                    {/* نشان وضعیت ثبت */}
                    {c.status === "PENDING" &&
                      (c.isRegistered ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-income/10 px-2 py-0.5 font-bold text-income">
                          <BadgeCheck className="size-3" />
                          ثبت‌شده{c.registeredName ? ` به نام ${c.registeredName}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-warning/10 px-2 py-0.5 font-bold text-warning">
                          <BadgeMinus className="size-3" />
                          ثبت‌نشده
                        </span>
                      ))}
                  </div>
                )}
              </button>
              </SwipeRow>
              </motion.div>
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
            {/* هشدار چک ثبت‌نشده — پاس/برگشت/لغو قفل است تا ثبت شود */}
            {!actionSheet.isRegistered && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-warning">
                  <BadgeMinus className="size-4 shrink-0" />
                  این چک هنوز ثبت نشده است
                </div>
                <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
                  {actionSheet.direction === "RECEIVED"
                    ? "چک دریافتی را اول «به نام خودتان» ثبت کنید."
                    : "چک صادره را اول «به نام مشتری» ثبت کنید."}{" "}
                  تا وقتی ثبت نشده، پاس/برگشت/لغو ممکن نیست.
                </p>
                <Button
                  onClick={openRegisterSheet}
                  className="mt-2.5 h-11 w-full rounded-2xl text-xs font-bold"
                >
                  <BadgeCheck className="size-4" />
                  ثبت چک به نام…
                </Button>
              </div>
            )}

            {actionSheet.isRegistered && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-income/30 bg-income/[0.06] p-3">
                <BadgeCheck className="size-5 shrink-0 text-income" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-income">
                    ثبت‌شده
                    {actionSheet.direction === "RECEIVED" ? " به نام ما" : " به نام مشتری"}
                  </p>
                  <p className="nums mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                    {actionSheet.registeredName ?? "—"}
                    {actionSheet.registeredNationalId
                      ? ` • کد ملی ${toPersianDigits(actionSheet.registeredNationalId)}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openRegisterSheet}
                  className="h-8 shrink-0 rounded-xl px-2.5 text-[0.68rem] font-bold"
                >
                  ویرایش
                </Button>
              </div>
            )}

            {/* پیوست‌های تصویری چک (ADV-04) — زیر وضعیت ثبت و بالای گزینه‌های پاس/برگشت/لغو؛ مستقل از isRegistered */}
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

              {!actionSheet.isRegistered && (
                <p className="mb-2 rounded-xl bg-warning/10 px-2.5 py-2 text-[0.68rem] font-medium leading-relaxed text-warning">
                  عکس چک مستقل از «ثبت» است — حتی اگر چک هنوز ثبت نشده هم می‌توانید همین‌جا عکسش را بگیرید.
                </p>
              )}

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
            </div>

            <SheetOption
              icon={<CheckCircle2 className="size-5" />}
              title="پاس شد"
              subtitle={
                actionSheet.isRegistered
                  ? "مبلغ به حساب بانکی واریز/برداشت شد"
                  : "اول باید چک ثبت شود"
              }
              tone="primary"
              onClick={() => (actionSheet.isRegistered ? setAccountSheet(true) : toast.error("چک ثبت‌نشده قابل پاس شدن نیست"))}
            />
            <SheetOption
              icon={<Undo2 className="size-5" />}
              title="برگشت خورد"
              subtitle={
                actionSheet.isRegistered
                  ? "چک پاس نشد؛ مانده به حساب شخص برمی‌گردد"
                  : "اول باید چک ثبت شود"
              }
              tone="danger"
              onClick={() => (actionSheet.isRegistered ? bounceCheck(actionSheet) : toast.error("چک ثبت‌نشده قابل برگشت نیست"))}
            />
            <SheetOption
              icon={<XCircle className="size-5" />}
              title="لغو"
              subtitle={actionSheet.isRegistered ? "چک باطل شد" : "اول باید چک ثبت شود"}
              tone="danger"
              onClick={() => (actionSheet.isRegistered ? cancelCheck(actionSheet) : toast.error("چک ثبت‌نشده قابل لغو نیست"))}
            />
          </div>
        )}
      </BottomSheet>

      {/* شیت «ثبت چک به نام» — نام + کد ملی + پیوست تصویر */}
      <BottomSheet
        open={registerSheet}
        onClose={() => setRegisterSheet(false)}
        title="ثبت چک"
        description={
          actionSheet
            ? `${actionSheet.person.name} • ${formatToman(actionSheet.amount)} — ${
                actionSheet.direction === "RECEIVED" ? "دریافتی" : "صادره"
              }`
            : ""
        }
        size="tall"
        footer={
          <Button onClick={registerCheck} disabled={saving} className="h-12 w-full rounded-2xl font-bold">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
            ثبت چک
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl bg-primary/5 px-3 py-2.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            {actionSheet?.direction === "RECEIVED" ? (
              <>
                این چک را <b className="text-primary">به نام خودتان</b> ثبت کنید — یعنی چک در بانک به
                نام شما سنجاق شده و قابل وصول است.
              </>
            ) : (
              <>
                این چک را <b className="text-destructive">به نام مشتری</b> ثبت کنید — یعنی چک شما
                به نام او ثبت شده و سررسید از حساب او برداشت می‌شود.
              </>
            )}
          </p>

          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground">
              <UserRound className="size-3.5" />
              نام صاحب حساب *
            </label>
            <Input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder={actionSheet?.direction === "RECEIVED" ? "مثلاً: میلد رجبی" : "نام مشتری"}
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground">
              <IdCard className="size-3.5" />
              کد ملی صاحب حساب (اختیاری)
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

          {/* پیوست تصویر موقع ثبت */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3.5 text-center">
            <p className="mb-2 flex items-center justify-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground">
              <ImagePlus className="size-3.5" />
              تصویر چک (اختیاری)
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => regFileInputRef.current?.click()}
              disabled={regUploading}
              className="h-9 rounded-xl px-4 text-xs font-bold"
            >
              {regUploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {regUploading ? "در حال بارگذاری…" : "افزودن تصویر چک"}
            </Button>
            <input
              ref={regFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPickRegisterImages(e.target.files)}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </div>
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
