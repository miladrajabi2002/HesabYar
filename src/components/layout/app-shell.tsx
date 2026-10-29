"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  Plus,
  Ellipsis,
  CheckSquare,
  Package,
  Landmark,
  BarChart3,
  LogOut,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { SheetOption } from "@/components/ui/bottom-sheet"

export const NAV_ITEMS = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard },
  { href: "/invoices", label: "فاکتورها", icon: FileText },
  { href: "/people", label: "اشخاص", icon: Users },
  { href: "/checks", label: "چک‌ها", icon: CheckSquare },
  { href: "/products", label: "اجناس", icon: Package },
  { href: "/accounts", label: "حساب‌های بانکی", icon: Landmark },
  { href: "/reports", label: "گزارش‌ها", icon: BarChart3 },
  { href: "/settings", label: "تنظیمات", icon: Settings },
] as const

/** آیتم‌های منوی «بیشتر» موبایل */
const MORE_ITEMS = [
  { href: "/checks", label: "چک‌ها", icon: CheckSquare, desc: "سررسید و وصول چک‌ها" },
  { href: "/products", label: "اجناس", icon: Package, desc: "موجودی انبار" },
  { href: "/accounts", label: "حساب‌های بانکی", icon: Landmark, desc: "گردش حساب‌ها" },
  { href: "/reports", label: "گزارش‌ها", icon: BarChart3, desc: "سود و فروش" },
  { href: "/settings", label: "تنظیمات", icon: Settings, desc: "ربات، بکاپ و…" },
] as const

function SidebarItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  active: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-transform duration-200",
          !active && "group-hover:scale-110"
        )}
      />
      <span>{label}</span>
      {active ? <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
    </Link>
  )
}

/** پوسته اصلی: سایدبار دسکتاپ + منوی شناور موبایل (ایده vignet) + شیت فاکتور جدید */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isTelegram } = useTelegram()
  const { moreSheetOpen, setMoreSheetOpen, addSheetOpen, openAddSheet, closeAddSheet } =
    useUIStore()

  const showSidebar = !isTelegram
  const today = formatJalaliWithWeekday(nowTehran())
  const isMainNav = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  const bottomNav = [
    { href: "/", label: "داشبورد", icon: LayoutDashboard, active: pathname === "/" },
    { href: "/invoices", label: "فاکتورها", icon: FileText, active: isMainNav("/invoices") },
    { href: "/people", label: "اشخاص", icon: Users, active: isMainNav("/people") },
  ]
  const moreActive = MORE_ITEMS.some((m) => isMainNav(m.href)) || moreSheetOpen

  return (
    <div className="min-h-screen bg-background">
      {/* سایدبار دسکتاپ */}
      {showSidebar ? (
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white shadow-fab">
              <Send className="size-5 -scale-x-100" />
            </div>
            <div>
              <div className="text-base font-extrabold">حساب‌یار</div>
              <div className="text-xs text-muted-foreground">حسابداری فروشگاهی</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {NAV_ITEMS.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isMainNav(item.href)}
              />
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-4">
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
                window.location.href = "/login"
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <LogOut className="size-4" />
              خروج از حساب
            </button>
            <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <div className="nums">{today}</div>
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
              <div className="text-sm font-bold leading-tight">حساب‌یار فروشگاهی</div>
              <div className="nums text-[0.68rem] leading-tight text-muted-foreground">{today}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMoreSheetOpen(true)}
            aria-label="بیشتر"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent"
          >
            <Ellipsis className="size-5" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-44 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
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

      {/* منوی پایین شناور موبایل — ایده vignet */}
      <nav
        aria-label="منوی اصلی"
        className="fixed inset-x-3 z-40 mx-auto grid h-[4.9rem] max-w-md grid-cols-5 items-end gap-0.5 rounded-[1.65rem] border border-black/[0.08] bg-background/95 p-1.5 shadow-[0_16px_40px_-8px_rgba(16,24,40,0.22)] backdrop-blur-2xl [bottom:max(0.9rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {bottomNav.slice(0, 2).map((item) => (
          <BottomNavItem key={item.href} {...item} />
        ))}

        {/* دکمه + وسط */}
        <button
          type="button"
          onClick={openAddSheet}
          aria-label="فاکتور جدید"
          className="group relative z-20 flex min-h-[3.75rem] min-w-0 flex-col items-center justify-end rounded-2xl focus-visible:outline-none"
        >
          <span className="absolute -top-5 left-1/2 -translate-x-1/2">
            <span className="grid size-[3.4rem] place-items-center rounded-[1.4rem] border-[5px] border-background bg-primary text-white shadow-fab transition-transform duration-200 group-hover:bg-primary/95 group-active:scale-90">
              <Plus className="size-6" strokeWidth={2.4} />
            </span>
          </span>
          <span className="text-[0.62rem] font-bold leading-4 text-primary">فاکتور</span>
        </button>

        <BottomNavItem {...bottomNav[2]} />

        <button
          type="button"
          onClick={() => setMoreSheetOpen(true)}
          aria-label="بیشتر"
          className={cn(
            "group relative z-10 flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.62rem] font-medium transition-colors duration-200 focus-visible:outline-none",
            moreActive ? "text-primary" : "text-muted-foreground/80"
          )}
        >
          <span
            className={cn(
              "grid size-8 place-items-center rounded-xl transition-all duration-200 group-active:scale-[0.92]",
              moreActive ? "bg-primary text-white shadow-fab" : "group-hover:bg-foreground/[0.05]"
            )}
          >
            <Ellipsis className="size-[1.05rem]" strokeWidth={moreActive ? 2.2 : 1.8} />
          </span>
          <span className="leading-4">بیشتر</span>
        </button>
      </nav>

      {/* شیت «فاکتور جدید» — انتخاب نوع */}
      <BottomSheet
        open={addSheetOpen}
        onClose={closeAddSheet}
        title="ثبت فاکتور جدید"
        description="نوع فاکتور را انتخاب کنید"
        desktopMode="dialog"
      >
        <div className="space-y-2.5">
          <SheetOption
            icon={<FileText className="size-5" />}
            title="فاکتور فروش"
            subtitle="جنس فروختم — به مشتری"
            tone="primary"
            onClick={() => {
              closeAddSheet()
              window.location.href = "/invoices/new?type=SALE"
            }}
          />
          <SheetOption
            icon={<Package className="size-5" />}
            title="فاکتور خرید"
            subtitle="جنس خریدم — از تأمین‌کننده"
            onClick={() => {
              closeAddSheet()
              window.location.href = "/invoices/new?type=PURCHASE"
            }}
          />
        </div>
      </BottomSheet>

      {/* شیت «بیشتر» */}
      <BottomSheet
        open={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        title="بیشتر"
        desktopMode="dialog"
      >
        <div className="space-y-2.5">
          {MORE_ITEMS.map((item) => (
            <SheetOption
              key={item.href}
              icon={<item.icon className="size-5" />}
              title={item.label}
              subtitle={item.desc}
              selected={isMainNav(item.href)}
              onClick={() => {
                setMoreSheetOpen(false)
                window.location.href = item.href
              }}
            />
          ))}
          <SheetOption
            icon={<LogOut className="size-5" />}
            title="خروج از حساب"
            tone="danger"
            onClick={async () => {
              setMoreSheetOpen(false)
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
              window.location.href = "/login"
            }}
          />
        </div>
      </BottomSheet>
    </div>
  )
}

function BottomNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.62rem] font-medium transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground/80"
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-xl transition-all duration-200 group-active:scale-[0.92]",
          active ? "bg-primary text-white shadow-fab" : "group-hover:bg-foreground/[0.05]"
        )}
      >
        <Icon className="size-[1.05rem]" strokeWidth={active ? 2.2 : 1.8} />
      </span>
      <span className="leading-4">{label}</span>
    </Link>
  )
}
