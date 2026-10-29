"use client"

/**
 * تنظیمات — ربات تلگرام، هشدار سررسید چک، بکاپ/بازیابی، پاک‌سازی داده
 */
import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Send,
  BellRing,
  DatabaseBackup,
  Upload,
  Download,
  Loader2,
  Trash2,
  ShieldAlert,
  Check,
} from "lucide-react"
import { apiGet, apiPost, apiPut, apiUpload } from "@/lib/api-client"
import { toPersianDigits } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

interface Settings {
  botTokenMasked: string | null
  hasBotToken: boolean
  botTokenSource: string | null
  adminChatId: string | null
  hasAdminChatId: boolean
  miniAppUrl: string
  checkDueDaysBefore: number
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<Settings>("/api/settings"),
  })

  const [token, setToken] = useState("")
  const [chatId, setChatId] = useState("")
  const [miniAppUrl, setMiniAppUrl] = useState("")
  const [dueDays, setDueDays] = useState(3)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [wipeSheet, setWipeSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (data) {
    // مقداردهی اولیه فرم‌ها
    if (chatId === "" && data.adminChatId) setChatId(data.adminChatId)
    if (miniAppUrl === "" && data.miniAppUrl) setMiniAppUrl(data.miniAppUrl)
    if (!miniAppUrl && !data.miniAppUrl) {
      /* noop */
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiPut("/api/settings", {
        botToken: token || undefined,
        adminChatId: chatId || undefined,
        miniAppUrl: miniAppUrl || undefined,
        checkDueDaysBefore: dueDays,
      })
      toast.success("تنظیمات ذخیره شد ✅")
      setToken("")
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  const testTelegram = async () => {
    setTesting(true)
    try {
      const r = await apiPost<{ message?: string }>("/api/telegram/test")
      toast.success(r.message || "پیام آزمایشی ارسال شد ✅")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال ناموفق")
    } finally {
      setTesting(false)
    }
  }

  const downloadBackup = () => {
    window.location.href = "/api/backup"
    toast.info("فایل بکاپ در حال دانلود است")
  }

  const restoreBackup = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    try {
      const r = await apiUpload<{ message: string }>("/api/backup/restore", fd)
      toast.success(r.message + " — صفحه دوباره بارگذاری می‌شود")
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "بازیابی ناموفق")
    }
  }

  const wipe = async () => {
    setWiping(true)
    try {
      await apiPost("/api/data/wipe", { confirm: "WIPE" })
      toast.success("همه داده‌ها پاک شد")
      setWipeSheet(false)
      await queryClient.invalidateQueries()
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در پاک‌سازی")
    } finally {
      setWiping(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold sm:text-xl">تنظیمات</h1>

      {/* ربات تلگرام */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Send className="size-4 -scale-x-100 text-primary" />
          ربات تلگرام
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              توکن ربات
              {data.hasBotToken && (
                <span className={cn("ms-2 rounded-md px-1.5 py-px text-[0.6rem]", "bg-primary/10 text-primary")}>
                  فعال ({data.botTokenMasked}) — از {data.botTokenSource === "db" ? "دیتابیس" : "env"}
                </span>
              )}
            </label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={data.hasBotToken ? "برای تغییر، توکن جدید را وارد کنید" : "123456:ABC-DEF…"}
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              شناسه چت ادمین (Chat ID)
            </label>
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="مثلاً ۱۲۵۳۹۳۹۸۲۸"
              dir="ltr"
              className="nums font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
              آدرس مینی‌اپ (دکمه «باز کردن حساب‌یار» داخل ربات)
            </label>
            <Input
              value={miniAppUrl}
              onChange={(e) => setMiniAppUrl(e.target.value)}
              placeholder="https://hesabyar.miladrajabi.com"
              dir="ltr"
              className="text-xs"
            />
          </div>

          <Button
            onClick={testTelegram}
            disabled={testing || !data.hasBotToken || !data.hasAdminChatId}
            variant="outline"
            className="h-11 w-full rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
            ارسال پیام آزمایشی
          </Button>
        </div>
      </section>

      {/* هشدار سررسید چک */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <BellRing className="size-4 text-primary" />
          هشدار سررسید چک
        </div>
        <label className="mb-1.5 block text-[0.7rem] font-medium text-muted-foreground">
          چند روز قبل از سررسید، ربات خبر بدهد؟
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 5, 7, 10].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDueDays(d)}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
                dueDays === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              {toPersianDigits(d)} روز قبل
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.62rem] text-muted-foreground">
          چک سررسید‌شده هم (وصول‌نشده) هر ساعت یک‌بار پیگیری و خبر داده می‌شود.
        </p>
      </section>

      {/* بکاپ */}
      <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <DatabaseBackup className="size-4 text-primary" />
          بکاپ و بازیابی
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={downloadBackup}
            variant="outline"
            className="h-12 rounded-2xl border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
          >
            <Download className="size-4" />
            دانلود بکاپ
          </Button>
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            className="h-12 rounded-2xl text-xs font-bold hover:bg-accent"
          >
            <Upload className="size-4" />
            بازیابی از فایل
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".db"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) restoreBackup(f)
          }}
        />
        <p className="mt-2 text-[0.62rem] text-muted-foreground">
          بکاپ خودکار روزانه هم انجام می‌شود (۷ نسخه نگهداری می‌شود).
        </p>
      </section>

      {/* ناحیه خطر */}
      <section className="rounded-3xl border border-destructive/25 bg-destructive/5 p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
          <ShieldAlert className="size-4" />
          ناحیه خطر
        </div>
        <p className="mb-3 text-[0.68rem] text-muted-foreground">
          پاک‌سازی کامل داده‌ها برای وقتی است که داده نمونه می‌خواهید دور بریزید و از صفر شروع کنید.
          همه اشخاص، اجناس، فاکتورها، چک‌ها و حساب‌ها حذف می‌شوند (تنظیمات و توکن ربات می‌ماند).
        </p>
        <Button
          onClick={() => setWipeSheet(true)}
          variant="outline"
          className="h-11 w-full rounded-2xl border-destructive/40 text-xs font-bold text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
          پاک کردن همه داده‌ها
        </Button>
      </section>

      <Button
        onClick={save}
        disabled={saving}
        className="h-13 w-full rounded-2xl py-3.5 text-sm font-bold shadow-fab"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        ذخیره تنظیمات
      </Button>

      {/* شیت تأیید پاک‌سازی */}
      <BottomSheet
        open={wipeSheet}
        onClose={() => setWipeSheet(false)}
        title="مطمئنید؟"
        description="این کار برگشت‌پذیر نیست — قبلش بکاپ بگیرید"
      >
        <div className="space-y-3">
          <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs leading-6 text-destructive">
            همه داده‌ها (اشخاص، اجناس، فاکتورها، چک‌ها، تسویه‌ها و حساب‌ها) برای همیشه حذف می‌شوند.
          </p>
          <Button
            onClick={wipe}
            disabled={wiping}
            className="h-12 w-full rounded-2xl bg-destructive font-bold hover:bg-destructive/90"
          >
            {wiping ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            بله، همه را پاک کن
          </Button>
          <Button
            onClick={() => setWipeSheet(false)}
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold"
          >
            انصراف
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
