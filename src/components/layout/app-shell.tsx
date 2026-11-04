"use client"

/**
 * پوستهٔ اصلی حساب‌یار (نسخهٔ ۷)
 *  • دسکتاپ: سایدبار تخت با آیکون‌های خطی تک‌رنگ (فقط آیتم فعال رنگی) + نوار بالا با جستجوی سراسری (Ctrl/⌘ K) و زنگ
 *  • موبایل: هدر جمع‌وجور (عنوان بزرگ + جستجو + زنگ «کار امروز») — بدون لوگو تا محتوا جا داشته باشد
 *  | نوار پایین چسبیده به لبه با دکمهٔ «فاکتور جدید» هم‌تراز تب‌ها؛ نشانگر فعال (خط نارنجی بالای تب) با فنر لیز می‌خورد
 *    با اسکرول به پایین کنار می‌رود و در صفحات فرم (فاکتور جدید) پنهان است
 *  • شیت «بیشتر»: صفحهٔ پشت کمی عقب می‌رود و کاشی‌ها پشت سر هم ظاهر می‌شوند
 *  • زنگ: اعلان‌های «کار امروز» (چک سررسیدشده، نسیهٔ معوق، کالای رو به اتمام) — /api/alerts و AlertsSheet
 *    عدد زنگ = اعلان‌های دیده‌نشده
 */
import { useEffect, useLayoutEffect, ReactNode, useState, useRef, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { apiGet } from "@/lib/api-client"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { formatJalali, formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { toPersianDigits } from "@/lib/money"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { GlobalSearch } from "@/components/search/global-search"
import { AlertsSheet, type AlertsData } from "@/components/layout/alerts-sheet"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ArrowDownLeft, ArrowUpRight, ChevronDown, RefreshCw, Store } from "lucide-react"
import { PullToRefresh } from "@/components/ui/pull-to-refresh"
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
  const queryClient = useQueryClient()
  const { moreSheetOpen, setMoreSheetOpen, pageSub } = useUIStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const scrolledAway = useHideOnScroll()
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  )
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
  // شمارندهٔ «چک‌ها» در سایدبار: چک‌های سررسیدشده‌ای که هنوز در فهرست اعلان‌اند
  const dueCount = alerts?.items.filter((i) => i.kind === "check").length ?? 0
  // عدد زنگ: اعلان‌هایی که هنوز دیده نشده‌اند (با باز کردن شیت صفر می‌شود)
  const todoCount = alerts?.unreadCount ?? 0
  const hasAlerts = (alerts?.totalCount ?? 0) > 0

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const isFormRoute = FORM_ROUTES.some((r) => pathname.startsWith(r))
  // صفحات فرم و جزئیات سربرگ اختصاصی خودشان را دارند (بازگشت + عنوان + اقدام‌ها) — هدر عمومی موبایل پنهان است
  const ownHeader = isFormRoute || /^\/invoices\/(?!new)[^/]+/.test(pathname) || /^\/people\/[^/]+/.test(pathname)
  const navHidden = isFormRoute || (scrolledAway && !moreSheetOpen)
  const moreActive = MORE_ITEMS.some((m) => isActive(m.href)) || moreSheetOpen
  // وقتی شیت «بیشتر» باز است خط فعال روی «بیشتر» می‌رود (دو خط هم‌زمان نداریم)
  const tabActive = (href: string) => !moreSheetOpen && isActive(href)

  // شیت «بیشتر»: صفحهٔ پشت کمی عقب می‌رود؛ مبدأ کوچک شدن وسطِ همان بخشی از صفحه است که دیده می‌شود
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (moreSheetOpen && contentRef.current) {
      contentRef.current.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`
    }
  }, [moreSheetOpen])

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
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-[15.25rem] flex-col border-e border-sidebar-border bg-[#fbfcfb] px-3 pb-3 pt-4 lg:flex">
          <div className="flex items-center gap-2.5 px-1.5 pt-0.5">
            <BrandLogo size={34} />
            <div className="text-base font-black tracking-tight">حساب‌یار</div>
          </div>

          {/* دکمهٔ دوتکه: فاکتور فروش (اصلی) + فلش برای انواع دیگر */}
          <NewInvoiceSplit active={isFormRoute} />

          <nav className="flex flex-1 flex-col justify-start gap-0.5">
            {NAV_LIST.map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                active={isActive(item.href)}
                count={item.href === "/checks" ? dueCount : 0}
              />
            ))}
          </nav>

          <div className="flex items-center gap-2.5 border-t border-sidebar-border px-1.5 pt-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Store className="size-[1.05rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-label font-bold">فروشگاه شما</div>
              <div className="nums truncate text-caption text-muted-foreground">{formatJalali(now)}</div>
            </div>
            <button
              onClick={logout}
              aria-label="خروج از حساب"
              title="خروج"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <IconLogout className="size-[1.1rem]" />
            </button>
          </div>
        </aside>
      ) : null}

      {/* ───────── محتوا ───────── */}
      {/* transform فقط وقتی شیت باز است می‌ماند تا fixedهای داخل محتوا در حالت عادی سالم باشند */}
      <div
        ref={contentRef}
        className={cn(
          "flex min-h-screen flex-col transition-[scale,translate]",
          showSidebar && "lg:ps-[15.25rem]",
          moreSheetOpen && !reduceMotion
            ? "duration-[460ms] ease-[cubic-bezier(0.32,0.72,0,1)] max-lg:translate-y-2 max-lg:scale-[0.955]"
            : "duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        )}
      >
        {/* هدر موبایل — جمع‌وجور: عنوان بزرگ + جستجو + زنگ */}
        <header
          className={cn(
            "hy-mobile-header sticky top-0 z-30 bg-background/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+1.6rem)] backdrop-blur-xl lg:hidden",
            ownHeader && "hidden"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-page font-extrabold tracking-tight">{titleFor(pathname)}</h1>
              <div className="nums truncate text-caption font-medium text-muted-foreground">{pageSub ?? today}</div>
            </div>
            <HeaderButton label="جستجوی سراسری" onClick={() => setSearchOpen(true)}>
              <IconSearch className="size-[1.2rem]" />
            </HeaderButton>
            <HeaderButton label="کار امروز" onClick={() => setAlertsOpen(true)} count={todoCount}>
              <IconBell className="size-[1.2rem]" active={hasAlerts} />
            </HeaderButton>
          </div>
        </header>

        {/* نوار بالای دسکتاپ — جستجوی سراسری و زنگ */}
        <div className="sticky top-0 z-30 hidden h-[3.75rem] items-center gap-3 border-b border-border bg-background/85 px-8 backdrop-blur-xl lg:flex">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-keyshortcuts="Control+K Meta+K"
            className="group flex h-10 w-full max-w-[26rem] items-center gap-2.5 rounded-xl border border-input bg-card ps-3 pe-1.5 text-label text-muted-foreground shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-[border-color,box-shadow,color] hover:border-foreground/20 hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
          >
            <IconSearch className="size-[1.05rem] shrink-0 transition-colors group-hover:text-primary" />
            <span className="truncate">جستجو در فاکتورها، اشخاص، کالاها…</span>
            <span className="ms-auto flex shrink-0 items-center gap-1" dir="ltr">
              <kbd className="grid h-7 place-items-center rounded-lg bg-muted px-2 font-sans text-caption font-bold text-muted-foreground">
                {isMac ? "⌘ K" : "Ctrl K"}
              </kbd>
            </span>
          </button>
          <span className="flex-1" />
          <span className="nums text-label font-medium text-muted-foreground">{today}</span>
          <HeaderButton label="کار امروز" onClick={() => setAlertsOpen(true)} count={todoCount}>
            <IconBell className="size-[1.15rem]" active={hasAlerts} />
          </HeaderButton>
        </div>

        <main
          className={cn(
            "mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7",
            ownHeader ? "pt-[calc(env(safe-area-inset-top,0px)+1.6rem)]" : "pt-2",
            isFormRoute ? "pb-32" : "pb-40"
          )}
        >
          {/* داخل تلگرام کشیدن به پایین مینی‌اپ را می‌بندد؛ آنجا خاموش است */}
          <PullToRefresh
            disabled={isTelegram}
            onRefresh={() => queryClient.refetchQueries({ type: "active" })}
            haptic={(k) => (k === "success" ? haptic.success() : haptic.medium())}
            topOffset={ownHeader ? "calc(env(safe-area-inset-top, 0px) + 1rem)" : "calc(env(safe-area-inset-top, 0px) + 5.25rem)"}
            icon={<RefreshCw className="size-[1.1rem]" strokeWidth={2.4} />}
          >
            {children}
          </PullToRefresh>
        </main>
      </div>

      {/* ───────── نوار پایین موبایل — چسبیده به لبه، خط نارنجی بالای تب فعال ───────── */}
      <motion.nav
        aria-label="منوی اصلی"
        initial={false}
        animate={{ y: navHidden ? "100%" : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        className="hy-nav fixed inset-x-0 bottom-0 z-40 [padding-bottom:max(0.5rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)))] lg:hidden"
      >
        <div className="mx-auto grid h-[3.75rem] max-w-md grid-cols-5 px-1">
          <BottomNavItem href="/" label="خانه" active={tabActive("/")} />
          <BottomNavItem href="/invoices" label="فاکتورها" active={tabActive("/invoices")} />

          {/* دکمهٔ + مرکزی — قرص کم‌رنگ هم‌تراز بقیهٔ تب‌ها، با برچسب */}
          <motion.button
            type="button"
            onClick={() => {
              haptic.medium()
              router.push("/invoices/new")
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
            className="relative flex h-full flex-col items-center justify-center gap-1"
          >
            <span className="grid h-7 w-11 place-items-center rounded-full bg-primary/12 text-primary">
              <IconPlus className="size-[1.2rem]" strokeWidth={2.6} />
            </span>
            <span className="text-micro font-bold leading-none text-primary">فاکتور جدید</span>
          </motion.button>

          <BottomNavItem href="/calendar" label="تقویم" active={tabActive("/calendar")} />
          <NavButton
            label="بیشتر"
            active={moreActive}
            onClick={() => {
              haptic.tap()
              setMoreSheetOpen(true)
            }}
            icon={<IconApps active={moreActive} className="size-[1.3rem]" />}
          />
        </div>
      </motion.nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ───────── شیت «کار امروز» — اعلان‌های قابل اقدام و بستن ───────── */}
      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} data={alerts} />

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
                // کاشی‌ها پشت سر هم با کمی فنر می‌آیند، بعد از اینکه شیت راه افتاد
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  opacity: { duration: 0.26, delay: 0.09 + i * 0.026 },
                  default: { type: "spring", stiffness: 420, damping: 22, delay: 0.09 + i * 0.026 },
                }}
                whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                onClick={() => {
                  setMoreSheetOpen(false)
                  go(item.href)
                }}
                style={{ ["--tile" as string]: hue }}
                className="group flex flex-col items-center gap-2 rounded-2xl py-1 text-center"
              >
                <span
                  className={cn(
                    "relative grid size-[3.6rem] place-items-center rounded-3xl transition-colors",
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
        <motion.button
          type="button"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: 0.09 + MORE_ITEMS.length * 0.026 }}
          onClick={() => {
            setMoreSheetOpen(false)
            logout()
          }}
          className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/8 py-3 text-label font-bold text-destructive transition-colors hover:bg-destructive/12 active:scale-[0.98]"
        >
          <IconLogout className="size-4" />
          خروج از حساب
        </motion.button>
      </BottomSheet>
    </div>
  )
}

/** دکمهٔ دوتکهٔ سایدبار: «+ فاکتور فروش» و فلش چسبیده که انواع فاکتور را باز می‌کند (طرح S1) */
function NewInvoiceSplit({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  const items = [
    { href: "/invoices/new", label: "فاکتور فروش", hint: "پول می‌آید", Icon: ArrowDownLeft, cls: "bg-sale/10 text-sale" },
    { href: "/invoices/new?type=PURCHASE", label: "فاکتور خرید", hint: "پول می‌رود", Icon: ArrowUpRight, cls: "bg-purchase/10 text-purchase" },
  ]
  return (
    <div ref={ref} className="relative mb-3 mt-4">
      <div className="flex h-10 overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-fab">
        <Link
          href="/invoices/new"
          className="flex flex-1 items-center justify-center gap-1.5 text-sm font-bold transition-colors hover:bg-white/10"
        >
          <IconPlus active={active} className="size-[1.05rem]" strokeWidth={2.4} />
          فاکتور فروش
        </Link>
        <button
          type="button"
          aria-label="انواع فاکتور"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid w-10 place-items-center border-s border-white/25 transition-colors hover:bg-white/10"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-xl border border-border bg-popover p-1 shadow-float">
          {items.map(({ href, label, hint, Icon, cls }) => (
            <Link
              key={href}
              role="menuitem"
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
            >
              <span className={cn("grid size-8 place-items-center rounded-lg", cls)}>
                <Icon className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-label font-bold">{label}</span>
                <span className="block text-caption text-muted-foreground">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
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
        <span className="nums relative rounded-full bg-warning/15 px-2 text-caption font-extrabold leading-5 text-warning-ink">
          {toPersianDigits(count)}
        </span>
      )}
    </Link>
  )
}

/** نشانگر فعال نوار پایین — خط نارنجی روی لبهٔ بالای تب که بین آیتم‌ها لیز می‌خورد */
function NavIndicator() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-px flex justify-center">
      <motion.span
        layoutId="bottom-nav-line"
        className="block h-[3px] w-7 rounded-b-full bg-primary"
        transition={{ type: "spring", stiffness: 520, damping: 40 }}
      />
    </span>
  )
}

function NavContent({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <>
      {active && <NavIndicator />}
      <span className="relative grid h-7 w-12 place-items-center">
        <span className={cn("relative z-10 transition-colors duration-200", active ? "text-primary" : "text-muted-foreground")}>
          {icon}
        </span>
      </span>
      <span
        className={cn(
          "relative z-10 text-micro leading-none transition-colors duration-200",
          active ? "font-bold text-foreground" : "font-medium text-muted-foreground"
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
      <NavContent active={active} label={label} icon={<Icon active={active} className="size-[1.3rem]" />} />
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
