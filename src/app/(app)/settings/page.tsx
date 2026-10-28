"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { motion } from "framer-motion"
import {
  Send,
  Save,
  Download,
  Upload,
  Loader2,
  BellRing,
  ShieldCheck,
  Smartphone,
  Eye,
  EyeOff,
  Database,
  RefreshCcw,
} from "lucide-react"
import { apiGet, apiPut, apiPost, apiPatch, apiUpload } from "@/lib/api-client"
import type { SettingsDTO, AlertRuleDTO, AccountDTO } from "@/types"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatToman, toPersianDigits, toLatinDigits } from "@/lib/money"
import { useTelegram } from "@/hooks/use-telegram"

export default function SettingsPage() {
  const qc = useQueryClient()
  const { isTelegram, webApp } = useTelegram()
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)

  // ---------- بخش‌های صفحه (بدون effect-sync؛ مقداردهی اولیه در mount با key) ----------

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsDTO>("/api/settings"),
  })
  const { data: alertsData } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<{ rules: AlertRuleDTO[] }>("/api/alerts"),
  })
  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiGet<{ accounts: AccountDTO[] }>("/api/accounts"),
  })

  const testMessage = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/api/telegram/test"),
    onSuccess: (res) => toast.success(res.message),
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleAlert = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/api/alerts/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const restoreMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append("file", file)
      return apiUpload<{ message: string }>("/api/backup/restore", fd)
    },
    onSuccess: (res) => {
      toast.success(res.message + " — در حال بارگذاری مجدد…")
      setRestoreOpen(false)
      setTimeout(() => window.location.reload(), 1500)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const alertRules = alertsData?.rules ?? []
  const accounts = accountsData?.accounts ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="تنظیمات" subtitle="ربات تلگرام، هشدارها، بکاپ و وضعیت مینی‌اپ" />

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* اتصال ربات تلگرام */}
          {settings ? (
            <TelegramSection
              key={`${settings.adminChatId ?? ""}|${settings.miniAppUrl ?? ""}|${settings.lowBalanceDefault}|${settings.botTokenMasked ?? ""}`}
              settings={settings}
              onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })}
            />
          ) : null}

          {/* هشدارها */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <BellRing className="size-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold">هشدارهای تلگرام</h3>
                <p className="text-xs text-muted-foreground">نوع اعلان‌های ارسالی به ربات</p>
              </div>
            </div>

            <div className="space-y-3">
              {alertRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">قانون هشداری ثبت نشده است</p>
              ) : (
                alertRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">{rule.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {rule.type === "LOW_BALANCE"
                          ? `حد: ${formatToman(rule.threshold ?? settings?.lowBalanceDefault ?? 100000)} — برای همه حساب‌ها`
                          : rule.type === "BUDGET_THRESHOLD"
                            ? "در عبور از آستانه و سقف بودجه"
                            : rule.type === "DEBT_DUE"
                              ? "۳ روز، ۱ روز و روز سررسید"
                              : "پس از هر ثبت خودکار"}
                        {rule.lastFiredAt ? ` — آخرین ارسال: ${toPersianDigits(new Date(rule.lastFiredAt).toLocaleDateString("fa-IR"))}` : ""}
                      </div>
                    </div>
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(checked: boolean) => toggleAlert.mutate({ id: rule.id, isActive: checked })}
                      aria-label={rule.label}
                    />
                  </div>
                ))
              )}
            </div>
          </motion.section>

          {/* بکاپ و بازیابی */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Database className="size-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold">بکاپ و بازیابی</h3>
                <p className="text-xs text-muted-foreground">
                  بکاپ خودکار روزانه (۰۳:۳۰) با نگهداری ۷ نسخه در پوشه backups
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  window.location.href = "/api/backup"
                  toast.success("در حال آماده‌سازی فایل بکاپ…")
                }}
              >
                <Download className="size-4" />
                دانلود بکاپ
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" />
                بازیابی از فایل
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".db"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setRestoreFile(f)
                    setRestoreOpen(true)
                  }
                  e.target.value = ""
                }}
              />
            </div>
          </motion.section>

          {/* وضعیت مینی‌اپ */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="size-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold">وضعیت مینی‌اپ تلگرام</h3>
                <p className="text-xs text-muted-foreground">اطلاعات اتصال و امنیت</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">آدرس مینی‌اپ</span>
                <span dir="ltr" className="font-mono text-xs">
                  {settings?.miniAppUrl || "تنظیم نشده"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">محیط فعلی</span>
                <span className="font-semibold">
                  {isTelegram ? `داخل تلگرام (${webApp?.platform ?? "unknown"})` : "مرورگر وب"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="size-4 text-income" />
                  اعتبارسنجی initData
                </span>
                <span className="text-xs">HMAC-SHA256 + کنترل زمان ۲۴ ساعته — فعال</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
                <span className="text-muted-foreground">ورود وب</span>
                <span className="text-xs">نام کاربری/رمز از فایل .env (APP_USERNAME / APP_PASSWORD)</span>
              </div>
            </div>
          </motion.section>

          <p className="pb-4 text-center text-xs leading-6 text-muted-foreground">
            حساب‌یار — داده‌ها در SQLite محلی ذخیره می‌شوند و پس از ری‌استارت حفظ هستند.
            <br />
            نسخه <span className="nums">۱.۰.۰</span>
          </p>
        </>
      )}

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="بازیابی از فایل بکاپ"
        description={
          <>
            فایل <span dir="ltr" className="font-mono">{restoreFile?.name}</span> بازیابی می‌شود.
            پیش از جایگزینی، از وضعیت فعلی بکاپ خودکار گرفته می‌شود.
          </>
        }
        confirmText="بازیابی کن"
        destructive
        onConfirm={() => restoreFile && restoreMutation.mutate(restoreFile)}
      >
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-xs text-warning">
          <RefreshCcw className="size-4 shrink-0" />
          تمام داده‌های فعلی با محتوای فایل بکاپ جایگزین می‌شود.
        </div>
      </ConfirmDialog>
    </div>
  )
}

/** بخش اتصال ربات تلگرام — مقداردهی اولیه از props در mount (remount با key پس از ذخیره) */
function TelegramSection({
  settings,
  onSaved,
}: {
  settings: SettingsDTO
  onSaved: () => void
}) {
  const [botToken, setBotToken] = useState("")
  const [adminChatId, setAdminChatId] = useState(settings.adminChatId ?? "")
  const [miniAppUrl, setMiniAppUrl] = useState(settings.miniAppUrl ?? "")
  const [lowBalance, setLowBalance] = useState(String(settings.lowBalanceDefault))
  const [showToken, setShowToken] = useState(false)

  const saveSettings = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {}
      if (botToken.trim()) body.botToken = botToken.trim()
      if (adminChatId.trim()) body.adminChatId = adminChatId.trim()
      if (miniAppUrl !== (settings.miniAppUrl ?? "")) body.miniAppUrl = miniAppUrl.trim()
      const lb = Math.round(Number(toLatinDigits(lowBalance).replace(/[^\d]/g, "") || "0"))
      if (lb !== settings.lowBalanceDefault) body.lowBalanceDefault = lb
      return apiPut("/api/settings", body)
    },
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد")
      setBotToken("")
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Send className="size-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-bold">اتصال ربات تلگرام</h3>
          <p className="text-xs text-muted-foreground">هشدارها و اعلان‌های مالی به این ربات ارسال می‌شود</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>توکن ربات (BotFather)</Label>
          <div className="relative">
            <Input
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              type={showToken ? "text" : "password"}
              placeholder={
                settings.hasBotToken
                  ? `ذخیره‌شده: ${settings.botTokenMasked} — برای تغییر، مقدار جدید وارد کنید`
                  : "مثلاً 123456:ABC-DEF…"
              }
              dir="ltr"
              lang="en"
              className="pe-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="نمایش/مخفی"
            >
              {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {settings.hasBotToken ? (
            <p className="text-[0.68rem] text-muted-foreground">
              وضعیت فعلی: <span dir="ltr" className="font-mono">{settings.botTokenMasked}</span>
              {settings.botTokenSource === "env" ? " (از فایل .env)" : " (ذخیره‌شده در اپ)"}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>شناسه عددی چت ادمین</Label>
          <Input
            value={adminChatId}
            onChange={(e) => setAdminChatId(e.target.value)}
            placeholder="مثلاً 1253939828"
            dir="ltr"
            lang="en"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label>آدرس مینی‌اپ (https)</Label>
          <Input
            value={miniAppUrl}
            onChange={(e) => setMiniAppUrl(e.target.value)}
            placeholder="https://hesabyar.miladrajabi.com"
            dir="ltr"
            lang="en"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label>حد پیش‌فرض موجودی کم (تومان)</Label>
          <Input
            value={toPersianDigits(lowBalance)}
            onChange={(e) => setLowBalance(e.target.value)}
            inputMode="numeric"
            className="nums"
          />
          <p className="text-[0.68rem] text-muted-foreground">
            معادل {formatToman(Number(toLatinDigits(lowBalance).replace(/[^\d]/g, "") || "0"))}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => saveSettings.mutate()} className="rounded-xl" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          ذخیره تنظیمات
        </Button>
      </div>
      {settings.hasBotToken ? (
        <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">
          💡 اگر توکن را تغییر دادید، برای فعال‌شدن polling یک‌بار سرویس را ری‌استارت کنید
          (<span dir="ltr" className="font-mono">pm2 restart hesabyar</span> روی سرور).
        </p>
      ) : null}
    </motion.section>
  )
}
