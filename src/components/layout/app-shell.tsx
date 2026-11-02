"use client"

/**
 * پوستهٔ اصلی حساب‌یار (نسخهٔ ۴)
 *  • دسکتاپ: سایدبار گروه‌بندی‌شده با نشانگر فعال لغزان + آیکون‌های رنگی متحرک
 *  • موبایل: هدر شیشه‌ای با عنوان صفحه + نوار پایین شناور که با اسکرول به پایین
 *    کنار می‌رود و با اسکرول به بالا برمی‌گردد؛ در صفحات فرم (فاکتور جدید) پنهان است
 *  • شیت «بیشتر» با کاشی‌های رنگی + شیت «فاکتور جدید»
 */
import { useEffect, ReactNode, useState, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useTelegram } from "@/hooks/use-telegram"
import { useUIStore } from "@/lib/ui-store"
import { formatJalaliWithWeekday, nowTehran } from "@/lib/jalali"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { GlobalSearch } from "@/components/search/global-search"
import { BrandLogo } from "@/components/ui/brand-logo"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import {
  IconApps,
  IconLogout,
  IconPlus,
  IconSearch,
  SECTION_META,
  type SectionHref,
} from "@/components/icons/app-icons"

type NavItem = { href: SectionHref; label: string; short?: string }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "کار روزانه",
    items: [
      { href: "/", label: "داشبورد" },
      { href: "/invoices", label: "فاکتورها" },
      { href: "/calendar", label: "تقویم مالی", short: "تقویم" },
      { href: "/checks", label: "چک‌ها" },
    ],
  },
  {
    title: "دفاتر",
    items: [
      { href: "/people", label: "اشخاص" },
      { href: "/products", label: "اجناس و انبار", short: "اجناس" },
      { href: "/accounts", label: "حساب‌های بانکی", short: "حساب‌ها" },
    ],
  },
  {
    title: "تحلیل و تنظیم",
    items: [
      { href: "/reports", label: "گزارش‌ها" },
      { href: "/settings", label: "تنظیمات" },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

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
  const { moreSheetOpen, setMoreSheetOpen, addSheetOpen, openAddSheet, closeAddSheet } =
    useUIStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const scrolledAway = useHideOnScroll()
  const reduceMotion = useReducedMotion()

  const showSidebar = !isTelegram
  const today = formatJalaliWithWeekday(nowTehran())
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const isFormRoute = FORM_ROUTES.some((r) => pathname.startsWith(r))
  const navHidden = isFormRoute || (scrolledAway && !moreSheetOpen && !addSheetOpen)
  const moreActive = MORE_ITEMS.some((m) => isActive(m.href)) || moreSheetOpen

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
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-[17rem] flex-col border-e border-sidebar-border bg-sidebar lg:flex">
          <div className="flex items-center gap-3 px-5 pb-4 pt-6">
            <BrandLogo size={42} />
            <div className="min-w-0">
              <div className="text-[1.05rem] font-black tracking-tight">حساب‌یار</div>
              <div className="text-[0.7rem] text-muted-foreground">حسابداری فروشگاهی</div>
            </div>
          </div>

          <div className="space-y-2 px-3 pb-3">
            <button
              type="button"
              onClick={openAddSheet}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-fab transition-transform hover:brightness-110 active:scale-[0.98]"
            >
              <IconPlus active={addSheetOpen} className="size-[1.1rem]" strokeWidth={2.4} />
              فاکتور جدید
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="group flex w-full items-center gap-2.5 rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <IconSearch className="size-4" />
              <span className="flex-1 text-start">جستجو…</span>
              <kbd className="pointer-events-none select-none rounded-md border border-border bg-muted px-1.5 py-px font-sans text-[0.6rem] font-semibold">
                Ctrl K
              </kbd>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="mt-3 first:mt-1">
                <div className="px-3 pb-1.5 text-[0.65rem] font-bold tracking-wide text-muted-foreground/70">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarItem key={item.href} item={item} active={isActive(item.href)} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="space-y-2 border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2">
              <div className="nums flex-1 truncate rounded-xl px-2 text-[0.7rem] text-muted-foreground">{today}</div>
              <button
                onClick={logout}
                className="group flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <IconLogout className="size-4" />
                خروج
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      {/* ───────── محتوا ───────── */}
      <div className={cn("flex min-h-screen flex-col", showSidebar && "lg:ps-[17rem]")}>
        {/* هدر موبایل — شیشه‌ای */}
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b px-4 pb-2.5 pt-[max(0.7rem,env(safe-area-inset-top))] lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandLogo size={34} />
            <div className="min-w-0">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={titleFor(pathname)}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="truncate text-[0.95rem] font-extrabold leading-tight"
                >
                  {titleFor(pathname)}
                </motion.div>
              </AnimatePresence>
              <div className="nums truncate text-[0.66rem] leading-tight text-muted-foreground">{today}</div>
            </div>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="جستجوی سراسری"
              className="group grid size-10 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
            >
              <IconSearch className="size-[1.2rem]" />
            </button>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto w-full max-w-6xl flex-1 px-4 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8",
            isFormRoute ? "pb-32" : "pb-36"
          )}
        >
          {children}
        </main>
      </div>

      {/* ───────── نوار پایین شناور موبایل ───────── */}
      <motion.nav
        aria-label="منوی اصلی"
        initial={false}
        animate={{ y: navHidden ? 140 : 0, opacity: navHidden ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        className="glass fixed inset-x-3 z-40 mx-auto grid h-[4.6rem] max-w-md grid-cols-5 items-center rounded-[1.75rem] border px-1.5 shadow-float [bottom:max(0.75rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)))] lg:hidden"
      >
        <BottomNavItem href="/" label="خانه" active={isActive("/")} />
        <BottomNavItem href="/invoices" label="فاکتورها" active={isActive("/invoices")} />

        {/* دکمهٔ + مرکزی */}
        <div className="relative flex justify-center">
          <motion.button
            type="button"
            onClick={() => {
              haptic.medium()
              if (addSheetOpen) closeAddSheet()
              else openAddSheet()
            }}
            aria-label="فاکتور جدید"
            whileTap={{ scale: 0.88 }}
            className="relative -mt-7 grid size-[3.6rem] place-items-center rounded-[1.35rem] bg-primary text-primary-foreground shadow-fab ring-[5px] ring-background"
          >
            <motion.span
              animate={{ rotate: addSheetOpen ? 135 : 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              className="grid place-items-center"
            >
              <IconPlus className="size-7" strokeWidth={2.5} />
            </motion.span>
          </motion.button>
        </div>

        <BottomNavItem href="/calendar" label="تقویم" active={isActive("/calendar")} />

        <button
          type="button"
          onClick={() => {
            haptic.tap()
            setMoreSheetOpen(true)
          }}
          aria-label="بیشتر"
          className="group relative flex h-full flex-col items-center justify-center gap-1"
        >
          {moreActive && <NavPill hue="var(--hue-settings)" />}
          <span className={cn("relative z-10 transition-colors", moreActive ? "text-foreground" : "text-muted-foreground")}>
            <IconApps active={moreActive} className="size-[1.4rem]" />
          </span>
          <span
            className={cn(
              "relative z-10 text-[0.62rem] leading-none transition-colors",
              moreActive ? "font-extrabold text-foreground" : "font-medium text-muted-foreground"
            )}
          >
            بیشتر
          </span>
        </button>
      </motion.nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SearchShortcut onOpen={() => setSearchOpen(true)} />

      {/* ───────── شیت «فاکتور جدید» ───────── */}
      <BottomSheet
        open={addSheetOpen}
        onClose={closeAddSheet}
        title="فاکتور جدید"
        description="چه چیزی ثبت می‌کنید؟"
        desktopMode="dialog"
      >
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              {
                type: "SALE",
                title: "فروش",
                sub: "جنس دادم، پول گرفتم",
                tone: "var(--sale)",
                flow: ["+ پول", "− جنس"],
              },
              {
                type: "PURCHASE",
                title: "خرید",
                sub: "جنس گرفتم، پول دادم",
                tone: "var(--purchase)",
                flow: ["+ جنس", "− پول"],
              },
            ] as const
          ).map((o, i) => (
            <motion.button
              key={o.type}
              type="button"
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.06 + i * 0.07, type: "spring", stiffness: 420, damping: 28 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                closeAddSheet()
                go(`/invoices/new?type=${o.type}`)
              }}
              style={{ ["--tile" as string]: o.tone }}
              className="group relative flex flex-col items-start overflow-hidden rounded-[1.6rem] border border-[color:color-mix(in_srgb,var(--tile)_22%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--tile)_9%,white),color-mix(in_srgb,var(--tile)_3%,white))] p-4 text-start shadow-card transition-shadow hover:shadow-card-hover"
            >
              {/* هالهٔ رنگی پشت */}
              <span className="pointer-events-none absolute -end-8 -top-8 size-28 rounded-full bg-[color:var(--tile)] opacity-[0.12] blur-2xl transition-transform duration-500 group-hover:scale-125" />
              <InvoiceTypeMark type={o.type} size={52} className="relative" />
              <span className="relative mt-3.5 block text-[1.05rem] font-black">فاکتور {o.title}</span>
              <span className="relative mt-0.5 block text-[0.7rem] text-muted-foreground">{o.sub}</span>
              {/* جریان جنس/پول */}
              <span className="relative mt-3 flex items-center gap-1.5 text-[0.6rem] font-bold">
                <span className="nums rounded-full bg-[color:color-mix(in_srgb,var(--tile)_13%,transparent)] px-2 py-0.5 text-[color:var(--tile)]">
                  {o.flow[0]}
                </span>
                <span className="nums rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{o.flow[1]}</span>
              </span>
            </motion.button>
          ))}
        </div>
        <p className="mt-3 text-center text-[0.65rem] text-muted-foreground">
          پیش‌نویس خودکار ذخیره می‌شود — هر وقت خواستی ادامه بده
        </p>
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
                    "icon-tile relative grid size-[3.6rem] place-items-center rounded-[1.25rem] transition-transform",
                    active && "ring-2 ring-[color:var(--tile)] ring-offset-2 ring-offset-card"
                  )}
                >
                  <Icon active duotone className="size-7" strokeWidth={2} />
                </span>
                <span className={cn("text-[0.72rem] leading-tight", active ? "font-extrabold" : "font-semibold")}>
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
          className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/8 py-3 text-xs font-bold text-destructive transition-colors hover:bg-destructive/12 active:scale-[0.98]"
        >
          <IconLogout className="size-4" />
          خروج از حساب
        </button>
      </BottomSheet>
    </div>
  )
}

function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const { icon: Icon, hue } = SECTION_META[item.href]
  return (
    <Link
      href={item.href}
      style={{ ["--tile" as string]: hue }}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm transition-colors",
        active ? "font-bold text-foreground" : "font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-2xl bg-sidebar-accent"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <span
        className={cn(
          "relative grid size-8 place-items-center rounded-xl transition-all duration-300",
          active ? "icon-tile" : "icon-soft"
        )}
      >
        <Icon active={active} className="size-[1.05rem]" />
      </span>
      <span className="relative">{item.label}</span>
    </Link>
  )
}

/** نشانگر فعال نوار پایین — بین آیتم‌ها لیز می‌خورد */
function NavPill({ hue }: { hue: string }) {
  return (
    <motion.span
      layoutId="bottom-nav-pill"
      style={{ ["--tile" as string]: hue }}
      className="absolute inset-x-1.5 inset-y-1.5 rounded-[1.2rem] bg-[color-mix(in_srgb,var(--tile)_13%,transparent)]"
      transition={{ type: "spring", stiffness: 480, damping: 36 }}
    />
  )
}

function BottomNavItem({ href, label, active }: { href: SectionHref; label: string; active: boolean }) {
  const { icon: Icon, hue } = SECTION_META[href]
  const { haptic } = useTelegram()
  return (
    <Link
      href={href}
      onClick={() => haptic.tap()}
      style={{ ["--tile" as string]: hue }}
      className="group relative flex h-full flex-col items-center justify-center gap-1"
    >
      {active && <NavPill hue={hue} />}
      <span className={cn("relative z-10 transition-colors", active ? "text-[color:var(--tile)]" : "text-muted-foreground")}>
        <Icon active={active} className="size-[1.4rem]" />
      </span>
      <span
        className={cn(
          "relative z-10 text-[0.62rem] leading-none transition-colors",
          active ? "font-extrabold text-foreground" : "font-medium text-muted-foreground"
        )}
      >
        {label}
      </span>
    </Link>
  )
}

/** میانبر Ctrl+K / Cmd+K — همیشه فعال (موبایل و دسکتاپ) */
function SearchShortcut({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onOpen])
  return null
}
