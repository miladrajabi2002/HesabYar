"use client"

/**
 * پوستهٔ اصلی حساب‌یار (نسخهٔ ۷)
 *  • دسکتاپ: سایدبار تخت با آیکون‌های خطی تک‌رنگ (فقط آیتم فعال رنگی) + نوار بالا با جستجوی سراسری (Ctrl/⌘ K) و زنگ
 *  • موبایل: هدر جمع‌وجور (عنوان بزرگ + جستجو + زنگ «کار امروز») — بدون لوگو تا محتوا جا داشته باشد
 *  • نوار پایین شناور با دکمهٔ + برجسته؛ نشانگر فعال (قرص پشت آیکون + خط درخشان بالا) با فنر بین آیتم‌ها لیز می‌خورد
 *    با اسکرول به پایین کنار می‌رود و در صفحات فرم (فاکتور جدید) پنهان است
 *  • زنگ: چک‌های در جریانِ سررسید امروز/گذشته (همان معیار یادآوری صبحگاهی تلگرام) — /api/alerts
 */
import { useEffect, ReactNode, useState, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { apiGet } from "@/lib/api-client"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { formatJalaliShort, formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { formatToman, toPersianDigits } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { BankLogo } from "@/components/ui/bank-logo"
import { GlobalSearch } from "@/components/search/global-search"
import { BrandLogo } from "@/components/ui/brand-logo"
import {
  IconApps,
  IconBell,
  IconLogout,
  IconPlus,
  IconSearch,
  SECTION_META,
  type SectionHref,
} from "@/components/icons/app-icons"

type NavItem = { href: SectionHref; label: string; short?: string }

const NAV_LIST: NavItem[] = [
  { href: "/", label: "داشبورد" },
  { href: "/invoices", label: "فاکتورها" },
  { href: "/calendar", label: "تقویم مالی", short: "تقویم" },
  { href: "/checks", label: "چک‌ها" },
  { href: "/people", label: "اشخاص" },
  { href: "/products", label: "کالاها و انبار", short: "کالاها" },
  { href: "/accounts", label: "حساب‌های بانکی", short: "حساب‌ها" },
  { href: "/reports", label: "گزارش‌ها" },
  { href: "/settings", label: "تنظیمات" },
]

export const NAV_ITEMS = NAV_LIST

/** آیتم‌های منوی «بیشتر» موبایل (داشبورد/فاکتورها/تقویم در نوار پایین هستند) */
const MORE_ITEMS = NAV_ITEMS.filter((i) => !["/", "/invoices", "/calendar"].includes(i.href))

/** صفحاتی که فرم تمام‌صفحه دارند — نوار پایین پنهان می‌شود تا با دکمهٔ ثبت تداخل نکند */
const FORM_ROUTES = ["/invoices/new"]

function titleFor(pathname: string): string {
  if (pathname === "/") return "داشبورد"
  if (pathname.startsWith("/invoices/new")) return "فاکتور"
  const hit = NAV_ITEMS.filter((i) => i.href !== "/").find((i) => pathname.startsWith(i.href))
  return hit?.label ?? "حساب‌یار"
}

type AlertsData = {
  dueCount: number
  dueChecks: {
    id: string
    amount: number
    dueDate: string
    direction: string
    bankKey: string
    personName: string
    daysLeft: number
  }[]
}

/** نوار پایین با اسکرول به پایین پنهان و با اسکرول به بالا ظاهر می‌شود */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - last.current
      if (Math.abs(dy) < 8) return
      // نزدیک انتهای صفحه همیشه دیده شود (دکمه‌های پایین صفحه پوشانده نشوند ولی منو هم گم نشود)
      const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 40
      setHidden(dy > 0 && y > 120 && !nearBottom)
      last.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return hidden
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isTelegram, haptic } = useTelegram()
  const { moreSheetOpen, setMoreSheetOpen } = useUIStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const scrolledAway = useHideOnScroll()
  const reduceMotion = useReducedMotion()
  const showSidebar = !isTelegram
  const now = nowTehran()
  const today = formatJalaliWithWeekday(now)

  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<AlertsData>("/api/alerts"),
    refetchInterval: 120_000,
    staleTime: 60_000,
  })
  const dueCount = alerts?.dueCount ?? 0

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const isFormRoute = FORM_ROUTES.some((r) => pathname.startsWith(r))
  const navHidden = isFormRoute || (scrolledAway && !moreSheetOpen)
  const moreActive = MORE_ITEMS.some((m) => isActive(m.href)) || moreSheetOpen

  // جستجوی سراسری با Ctrl/⌘ + K (دسکتاپ)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null)
    window.location.href = "/login"
  }

  const go = (href: string) => {
    haptic.tap()
    router.push(href)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ───────── سایدبار دسکتاپ ───────── */}
      {showSidebar ? (
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-[16rem] flex-col border-e border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-2.5 px-5 pb-1 pt-5">
            <BrandLogo size={34} />
            <div className="text-base font-black tracking-tight">حساب‌یار</div>
          </div>

          {/* فاکتور جدید: فروش (اصلی) + خرید */}
          <div className="flex gap-1.5 px-3 pb-3 pt-4">
            <Link
              href="/invoices/new"
              className="group flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-fab transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
            >
              <IconPlus active={isFormRoute} className="size-[1.05rem]" strokeWidth={2.4} />
              فاکتور فروش
            </Link>
            <Link
              href="/invoices/new?type=PURCHASE"
              title="فاکتور خرید جدید"
              className="flex h-10 items-center justify-center rounded-xl bg-purchase/10 px-3 text-label font-bold text-purchase transition-colors hover:bg-purchase/15"
            >
              خرید
            </Link>
          </div>

          <nav className="flex flex-1 flex-col justify-start gap-0.5 px-3 pb-4 pt-1">
            {NAV_LIST.map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                active={isActive(item.href)}
                count={item.href === "/checks" ? dueCount : 0}
              />
            ))}
          </nav>

          <div className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3">
            <div className="nums min-w-0 flex-1 truncate text-caption text-muted-foreground">{today}</div>
            <button
              onClick={logout}
              className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-caption font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <IconLogout className="size-4" />
              خروج
            </button>
          </div>
        </aside>
      ) : null}

      {/* ───────── محتوا ───────── */}
      <div className={cn("flex min-h-screen flex-col", showSidebar && "lg:ps-[16rem]")}>
        {/* هدر موبایل — جمع‌وجور: عنوان بزرگ + جستجو + زنگ */}
        <header className="hy-mobile-header sticky top-0 z-30 border-b border-transparent bg-background/88 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.h1
                  key={titleFor(pathname)}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="truncate text-[1.4rem] font-extrabold leading-tight tracking-tight"
                >
                  {titleFor(pathname)}
                </motion.h1>
              </AnimatePresence>
              <div className="nums truncate text-caption font-medium text-muted-foreground">{today}</div>
            </div>
            <HeaderButton label="جستجوی سراسری" onClick={() => setSearchOpen(true)}>
              <IconSearch className="size-[1.2rem]" />
            </HeaderButton>
            <HeaderButton label="کار امروز" onClick={() => setAlertsOpen(true)} count={dueCount}>
              <IconBell className="size-[1.2rem]" active={dueCount > 0} />
            </HeaderButton>
          </div>
        </header>

        {/* نوار بالای دسکتاپ — جستجوی سراسری و زنگ */}
        <div className="sticky top-0 z-30 hidden h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-8 backdrop-blur-xl lg:flex">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="group flex h-9 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 text-label text-muted-foreground transition-colors hover:border-primary/40"
          >
            <IconSearch className="size-4" />
            جستجوی فاکتور، شخص، کالا یا چک…
            <kbd className="ms-auto rounded-md border border-border bg-muted/60 px-1.5 font-sans text-micro font-bold" dir="ltr">
              Ctrl K
            </kbd>
          </button>
          <span className="flex-1" />
          <HeaderButton label="کار امروز" onClick={() => setAlertsOpen(true)} count={dueCount}>
            <IconBell className="size-[1.15rem]" active={dueCount > 0} />
          </HeaderButton>
        </div>

        <main
          className={cn(
            "mx-auto w-full max-w-6xl flex-1 px-4 pt-3 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7",
            isFormRoute ? "pb-32" : "pb-40"
          )}
        >
          {children}
        </main>
      </div>

      {/* ───────── نوار پایین شناور موبایل ───────── */}
      <motion.nav
        aria-label="منوی اصلی"
        initial={false}
        animate={{ y: navHidden ? 150 : 0, opacity: navHidden ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        className="hy-nav fixed inset-x-3.5 z-40 mx-auto grid h-[4.4rem] max-w-md grid-cols-5 items-center rounded-[1.75rem] px-1.5 [bottom:max(1.15rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)+0.35rem))] lg:hidden"
      >
        <BottomNavItem href="/" label="خانه" active={isActive("/")} />
        <BottomNavItem href="/invoices" label="فاکتورها" active={isActive("/invoices")} />

        {/* دکمهٔ + مرکزی — برجسته، بالاتر از نوار */}
        <div className="relative flex h-full flex-col items-center justify-end pb-[0.55rem]">
          <motion.button
            type="button"
            onClick={() => {
              haptic.medium()
              router.push("/invoices/new")
            }}
            aria-label="فاکتور جدید"
            whileTap={reduceMotion ? undefined : { scale: 0.88, rotate: 90 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="hy-fab absolute -top-[1.9rem] grid size-[3.9rem] place-items-center rounded-[1.4rem] text-primary-foreground"
          >
            <IconPlus className="relative size-7" strokeWidth={2.6} />
          </motion.button>
          <span className="text-micro font-bold leading-none text-primary">فاکتور</span>
        </div>

        <BottomNavItem href="/calendar" label="تقویم" active={isActive("/calendar")} />
        <NavButton
          label="بیشتر"
          active={moreActive}
          onClick={() => {
            haptic.tap()
            setMoreSheetOpen(true)
          }}
          icon={<IconApps active={moreActive} className="size-[1.35rem]" />}
        />
      </motion.nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ───────── شیت «کار امروز» ───────── */}
      <BottomSheet
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="کار امروز"
        description={dueCount ? `${toPersianDigits(dueCount)} چک سررسید امروز یا گذشته` : "همه‌چیز مرتب است"}
      >
        {dueCount === 0 ? (
          <div className="py-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-income/10 text-income">
              <IconBell className="size-6" />
            </span>
            <p className="mt-3 text-sm font-bold">چک سررسیدی برای امروز ندارید</p>
            <p className="mt-1 text-caption text-muted-foreground">صبح هر روز یادآوری در تلگرام هم می‌آید.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {alerts?.dueChecks.map((c) => (
              <Link
                key={c.id}
                href="/checks"
                onClick={() => setAlertsOpen(false)}
                className="flex items-center gap-3 py-3 transition-colors hover:bg-accent/40"
              >
                <BankLogo bankKey={c.bankKey} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{c.personName}</div>
                  <div className="nums text-caption text-muted-foreground">
                    {c.direction === "RECEIVED" ? "دریافتی" : "صادره"} · {formatJalaliShort(new Date(c.dueDate))}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="nums text-sm font-extrabold">{formatToman(c.amount, false)}</div>
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full px-2 py-0.5 text-micro font-bold",
                      c.daysLeft < 0 ? "bg-destructive/10 text-destructive" : "bg-warning/12 text-warning-ink"
                    )}
                  >
                    {c.daysLeft < 0 ? `${toPersianDigits(-c.daysLeft)} روز گذشته` : "امروز"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ───────── شیت «بیشتر» ───────── */}
      <BottomSheet open={moreSheetOpen} onClose={() => setMoreSheetOpen(false)} title="همهٔ بخش‌ها" desktopMode="dialog">
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 pt-1">
          {MORE_ITEMS.map((item, i) => {
            const { icon: Icon, hue } = SECTION_META[item.href]
            const active = isActive(item.href)
            return (
              <motion.button
                key={item.href}
                type="button"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.04 + i * 0.035, type: "spring", stiffness: 460, damping: 28 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setMoreSheetOpen(false)
                  go(item.href)
                }}
                style={{ ["--tile" as string]: hue }}
                className="group flex flex-col items-center gap-2 rounded-2xl py-1 text-center"
              >
                <span
                  className={cn(
                    "relative grid size-[3.6rem] place-items-center rounded-[1.25rem] transition-colors",
                    active ? "bg-primary text-primary-foreground" : "icon-soft"
                  )}
                >
                  <Icon active duotone className="size-7" strokeWidth={2} />
                  {item.href === "/checks" && dueCount > 0 && (
                    <span className="nums absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-micro font-bold text-white ring-2 ring-card">
                      {toPersianDigits(dueCount)}
                    </span>
                  )}
                </span>
                <span className={cn("text-caption leading-tight", active ? "font-extrabold" : "font-semibold")}>
                  {item.short ?? item.label}
                </span>
              </motion.button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setMoreSheetOpen(false)
            logout()
          }}
          className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/8 py-3 text-label font-bold text-destructive transition-colors hover:bg-destructive/12 active:scale-[0.98]"
        >
          <IconLogout className="size-4" />
          خروج از حساب
        </button>
      </BottomSheet>
    </div>
  )
}

function HeaderButton({
  label,
  onClick,
  count = 0,
  children,
}: {
  label: string
  onClick: () => void
  count?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `${label} — ${toPersianDigits(count)} مورد` : label}
      className="group relative grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-95"
    >
      {children}
      {count > 0 && (
        <span className="nums absolute -end-1 -top-1 grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-destructive px-1 text-micro font-bold leading-none text-white ring-2 ring-background">
          {toPersianDigits(count)}
        </span>
      )}
    </button>
  )
}

function SidebarItem({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  const { icon: Icon } = SECTION_META[item.href]
  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors",
        active ? "font-extrabold text-secondary-foreground" : "font-medium text-foreground/75 hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl bg-primary/10"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <span className={cn("relative transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
        <Icon active={active} className="size-[1.2rem]" />
      </span>
      <span className="relative flex-1">{item.label}</span>
      {count > 0 && (
        <span className="nums relative rounded-full bg-warning/15 px-2 text-micro font-extrabold leading-5 text-warning-ink">
          {toPersianDigits(count)}
        </span>
      )}
    </Link>
  )
}

/** نشانگر فعال نوار پایین — قرص پشت آیکون + خط درخشان لبهٔ بالا؛ هر دو با فنر بین آیتم‌ها لیز می‌خورند */
function NavIndicator() {
  return (
    <>
      <motion.span
        layoutId="bottom-nav-glow"
        aria-hidden
        className="absolute -top-px left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-b-full bg-primary shadow-[0_2px_10px_1px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
      <motion.span
        layoutId="bottom-nav-pill"
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/12"
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      />
    </>
  )
}

function NavContent({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <>
      <span className="relative grid h-8 w-14 place-items-center">
        {active && <NavIndicator />}
        <motion.span
          className={cn("relative z-10 transition-colors duration-200", active ? "text-primary" : "text-muted-foreground")}
          animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
        >
          {icon}
        </motion.span>
      </span>
      <span
        className={cn(
          "relative z-10 text-micro leading-none transition-colors duration-200",
          active ? "font-extrabold text-primary" : "font-medium text-muted-foreground"
        )}
      >
        {label}
      </span>
    </>
  )
}

function BottomNavItem({ href, label, active }: { href: SectionHref; label: string; active: boolean }) {
  const { icon: Icon } = SECTION_META[href]
  const { haptic } = useTelegram()
  return (
    <Link
      href={href}
      onClick={() => haptic.tap()}
      aria-current={active ? "page" : undefined}
      className="group relative flex h-full flex-col items-center justify-center gap-1 active:scale-95"
    >
      <NavContent active={active} label={label} icon={<Icon active={active} className="size-[1.35rem]" />} />
    </Link>
  )
}

function NavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-full flex-col items-center justify-center gap-1 active:scale-95"
    >
      <NavContent active={active} label={label} icon={icon} />
    </button>
  )
}
