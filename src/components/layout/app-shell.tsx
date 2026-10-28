"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PieChart,
  Repeat,
  HandCoins,
  BarChart3,
  Settings,
  Plus,
  MoreHorizontal,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { QuickAddSheet } from "@/components/quick-add/quick-add-sheet"
import { MoreSheet } from "./more-sheet"

export const NAV_ITEMS = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard },
  { href: "/transactions", label: "تراکنش‌ها", icon: ArrowLeftRight },
  { href: "/accounts", label: "حساب‌ها", icon: Wallet },
  { href: "/budgets", label: "بودجه", icon: PieChart },
  { href: "/recurring", label: "تکرارشونده", icon: Repeat },
  { href: "/debts", label: "بدهی و طلب", icon: HandCoins },
  { href: "/reports", label: "گزارش‌ها", icon: BarChart3 },
  { href: "/settings", label: "تنظیمات", icon: Settings },
] as const

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  compact,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  active: boolean
  onNavigate?: () => void
  compact?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
        compact && "px-3 py-2"
      )}
    >
      <Icon className={cn("size-[18px] shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
      <span>{label}</span>
      {active ? <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
    </Link>
  )
}

/** پوسته اصلی اپ: سایدبار دسکتاپ + هدر و نوار پایین موبایل + FAB */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isTelegram, user } = useTelegram()
  const { openQuickAdd, moreSheetOpen, setMoreSheetOpen } = useUIStore()

  const showSidebar = !isTelegram
  const today = formatJalaliWithWeekday(nowTehran())

  const bottomNav = [
    { href: "/", label: "داشبورد", icon: LayoutDashboard },
    { href: "/transactions", label: "تراکنش‌ها", icon: ArrowLeftRight },
    { href: "__add__", label: "ثبت", icon: Plus },
    { href: "/reports", label: "گزارش", icon: BarChart3 },
    { href: "__more__", label: "بیشتر", icon: MoreHorizontal },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* سایدبار دسکتاپ (در مینی‌اپ مخفی) */}
      {showSidebar ? (
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white shadow-fab">
              <Send className="size-5 -scale-x-100" />
            </div>
            <div>
              <div className="text-base font-extrabold">حساب‌یار</div>
              <div className="text-xs text-muted-foreground">حسابداری شخصی هوشمند</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname === item.href}
                compact
              />
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <div className="nums">{today}</div>
              {user ? <div className="mt-0.5">کاربر: {user.name || "تلگرام"}</div> : null}
            </div>
          </div>
        </aside>
      ) : null}

      {/* محتوا */}
      <div className={cn("flex min-h-screen flex-col", showSidebar && "lg:ps-64")}>
        {/* هدر موبایل */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
              <Send className="size-4 -scale-x-100" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">حساب‌یار</div>
              <div className="nums text-[0.68rem] leading-tight text-muted-foreground">{today}</div>
            </div>
          </div>
          <Link
            href="/settings"
            aria-label="تنظیمات"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="size-4.5" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* نوار پایین موبایل / مینی‌اپ */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/92 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {bottomNav.map((item) => {
            if (item.href === "__add__") {
              return (
                <button
                  key="fab"
                  type="button"
                  onClick={() => openQuickAdd()}
                  aria-label="ثبت سریع"
                  className="relative -mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-fab transition-transform duration-200 active:scale-90"
                >
                  <Plus className="size-6" />
                </button>
              )
            }
            if (item.href === "__more__") {
              const active = moreSheetOpen || ["/accounts", "/budgets", "/recurring", "/debts", "/settings"].includes(pathname)
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreSheetOpen(true)}
                  aria-label="بیشتر"
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[0.65rem] font-medium transition-colors duration-200",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <MoreHorizontal className="size-5" />
                  بیشتر
                </button>
              )
            }
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[0.65rem] font-medium transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* FAB دسکتاپ */}
      {showSidebar ? (
        <button
          type="button"
          onClick={() => openQuickAdd()}
          className="fixed bottom-6 end-6 z-40 hidden size-14 items-center justify-center rounded-full bg-primary text-white shadow-fab transition-all duration-200 hover:shadow-card-hover hover:brightness-105 active:scale-90 lg:flex"
          aria-label="ثبت سریع"
        >
          <Plus className="size-6" />
        </button>
      ) : null}

      {/* شیت‌های سراسری */}
      <QuickAddSheet />
      <MoreSheet />
    </div>
  )
}
