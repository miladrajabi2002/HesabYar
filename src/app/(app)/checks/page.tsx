"use client"

/**
 * چک‌ها — دریافتی/صادره با وضعیت وصول، برگشت و سررسید
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckSquare2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Undo2,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { apiGet, apiPatch } from "@/lib/api-client"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliWithWeekday, nowTehran, diffJalaliDays, startOfJalaliDay } from "@/lib/jalali"
import { getBank } from "@/lib/banks"
import { BankLogo } from "@/components/ui/bank-logo"
import { BottomSheet, SheetOption } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
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

const STATUS_LABEL: Record<string, string> = {
  PENDING: "در جریان",
  CASHED: "وصول‌شده",
  BOUNCED: "برگشتی",
  CANCELED: "لغو‌شده",
}

export default function ChecksPage() {
  const queryClient = useQueryClient()
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

  const checks = data?.checks ?? []
  const summary = data?.summary

  const cashCheck = async (check: Check, accountId: string) => {
    setSaving(true)
    try {
      await apiPatch(`/api/checks/${check.id}`, { status: "CASHED", accountId })
      toast.success("چک وصول شد ✅ گردش بانکی ثبت شد")
      setActionSheet(null)
      setAccountSheet(false)
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت وصول")
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
    if (!confirm("چک لغو شود؟ مبلغش به حساب شخص برمی‌گردد.")) return
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
              { key: "CASHED", label: "وصول‌شده" },
              { key: "BOUNCED", label: "برگشتی" },
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
                  overdue
                    ? "border-destructive/40"
                    : soon
                      ? "border-warning/40"
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
                    <div className="nums text-sm font-extrabold">{formatToman(c.amount, false)}</div>
                    <div
                      className={cn(
                        "mt-0.5 rounded-md px-1.5 py-px text-[0.6rem] font-bold",
                        c.status === "CASHED"
                          ? "bg-income/10 text-income"
                          : c.status === "PENDING"
                            ? overdue
                              ? "bg-destructive/10 text-destructive"
                              : soon
                                ? "bg-warning/10 text-warning"
                                : "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.status === "PENDING"
                        ? overdue
                          ? `${toPersianDigits(Math.abs(daysLeft))} روز گذشته`
                          : daysLeft === 0
                            ? "امروز سررسید"
                            : `${toPersianDigits(daysLeft)} روز مانده`
                        : STATUS_LABEL[c.status]}
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
              icon={<Landmark className="size-5" />}
              title="وصول شد"
              subtitle="پول به حساب بانکی واریز/برداشت شد"
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
          </div>
        )}
      </BottomSheet>

      {/* شیت انتخاب حساب برای وصول */}
      <BottomSheet
        open={accountSheet}
        onClose={() => setAccountSheet(false)}
        title="وصول در کدام حساب؟"
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
    </div>
  )
}
