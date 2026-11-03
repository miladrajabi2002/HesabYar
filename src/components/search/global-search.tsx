"use client"

/**
 * جستجوی سراسری (نسخهٔ ۸) — یک جا برای فاکتور، شخص، کالا، چک و بخش‌های برنامه
 *  • دسکتاپ: پالت فرمان بالای صفحه — فیلد بزرگ، دسته با Tab، حرکت با ↑↓، باز کردن با Enter، بستن با Esc
 *  • موبایل: صفحهٔ تمام‌قد مثل جستجوی اندروید — دکمهٔ برگشت، پاک‌کردن، چیپ دسته‌ها؛
 *    دکمهٔ Back گوشی (و BackButton تلگرام) فقط جستجو را می‌بندد، نه صفحهٔ زیرش را
 *  • بدون عبارت: جستجوهای اخیر، موارد اخیراً بازشده، کارهای سریع و میانبر بخش‌ها
 *  • بخش تطابق در نتیجه پررنگ می‌شود؛ ي/ك عربی، نیم‌فاصله و ارقام فارسی/لاتین یکی دیده می‌شوند
 * باز شدن: دکمهٔ جستجو در هدر + میانبر Ctrl+K / ⌘K (app-shell)
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Clock,
  CornerDownLeft,
  Package,
  Plus,
  SearchX,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiGet } from "@/lib/api-client"
import { formatTomanCompact, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { findMatch, foldSearchText } from "@/lib/search-text"
import { acquireBodyScrollLock } from "@/lib/body-scroll-lock"
import { InvoiceTypeMark } from "@/components/ui/type-mark"
import { BankLogo } from "@/components/ui/bank-logo"
import { RoleAvatar } from "@/components/ui/role-avatar"
import { IconSearch, SECTION_META, type SectionHref } from "@/components/icons/app-icons"
import { useTelegram, useTelegramBackButton } from "@/hooks/use-telegram"

interface SearchResults {
  invoices: {
    id: string
    number: number
    type: string
    total: number
    credit: number
    date: string
    person: { name: string }
  }[]
  people: { id: string; name: string; phone: string | null; company: string | null; role: string; balance: number }[]
  products: { id: string; name: string; brand: string | null; code: string | null; unit: string }[]
  checks: {
    id: string
    serial: string
    amount: number
    bankKey: string
    status: string
    direction: string
    dueDate: string
    person: { name: string }
  }[]
  more: Partial<Record<Exclude<Scope, "all">, boolean>>
}

type Scope = "all" | "invoices" | "people" | "products" | "checks"

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "invoices", label: "فاکتورها" },
  { key: "people", label: "اشخاص" },
  { key: "products", label: "کالاها" },
  { key: "checks", label: "چک‌ها" },
]

const PLACEHOLDER: Record<Scope, string> = {
  all: "جستجوی فاکتور، شخص، کالا یا چک…",
  invoices: "شمارهٔ فاکتور، نام شخص، کالا یا مبلغ",
  people: "نام، موبایل یا شرکت",
  products: "نام، برند یا کد کالا",
  checks: "سریال، نام شخص یا مبلغ چک",
}

/** بخش‌های برنامه — برای «رفتن به …» (کلیدواژه‌ها برای پیدا شدن با کلمهٔ نزدیک) */
const PAGES: { href: SectionHref; label: string; short?: string; keywords: string }[] = [
  { href: "/", label: "داشبورد", keywords: "خانه خلاصه امروز" },
  { href: "/invoices", label: "فاکتورها", keywords: "فروش خرید نسیه" },
  { href: "/calendar", label: "تقویم مالی", short: "تقویم", keywords: "سررسید برنامه" },
  { href: "/checks", label: "چک‌ها", keywords: "چک سررسید" },
  { href: "/people", label: "اشخاص", keywords: "مشتری فروشنده طرف حساب بدهکار طلبکار" },
  { href: "/products", label: "کالاها و انبار", short: "کالاها", keywords: "کالا جنس موجودی انبار" },
  { href: "/accounts", label: "حساب‌های بانکی", short: "حساب‌ها", keywords: "بانک کارت موجودی انتقال" },
  { href: "/reports", label: "گزارش‌ها", keywords: "سود فروش نمودار" },
  { href: "/settings", label: "تنظیمات", keywords: "پشتیبان رمز اثر انگشت" },
]

const CHECK_STATUS: Record<string, string> = {
  PENDING: "در جریان",
  CASHED: "پاس شد",
  BOUNCED: "برگشتی",
  CANCELED: "لغوشده",
}

/* ───────── اخیرها (localStorage) ───────── */

type RecentKind = "invoice" | "person" | "product" | "check"
interface RecentEntry {
  kind: RecentKind
  id: string
  title: string
  sub?: string
  href: string
  /** نوع فاکتور / نقش شخص / کلید بانک — برای آیکون */
  meta?: string
}

const RECENT_ITEMS_KEY = "hesabyar:search-recent"
const RECENT_QUERIES_KEY = "hesabyar:search-queries"

function readList<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeList(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* حالت خصوصی / فضای پر */
  }
}

/* ───────── آیتم‌ها ───────── */

interface Item {
  key: string
  href?: string
  onSelect?: () => void
  title: string
  sub?: string
  icon: ReactNode
  trailing?: ReactNode
  recent?: RecentEntry
  /** تطابق فقط روی عنوان هایلایت شود؟ (پیش‌فرض: عنوان و زیرعنوان) */
  highlight?: boolean
}
interface Group {
  key: string
  label: string
  items: Item[]
  action?: { label: string; href?: string; onClick?: () => void }
}

const DESKTOP_QUERY = "(min-width: 1024px)"
function subscribeDesktop(cb: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener("change", cb)
  return () => media.removeEventListener("change", cb)
}
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  if (!mounted) return null
  // پنل فقط هنگام باز بودن mount می‌شود → هر بار با فیلد خالی و دستهٔ «همه» شروع می‌شود
  return createPortal(<AnimatePresence>{open && <SearchPanel key="search" onClose={onClose} />}</AnimatePresence>, document.body)
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { haptic, isTelegram } = useTelegram()
  const reduceMotion = useReducedMotion()
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, () => false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [q, setQ] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [recentItems, setRecentItems] = useState<RecentEntry[]>(() => readList<RecentEntry>(RECENT_ITEMS_KEY))
  const [recentQueries, setRecentQueries] = useState<string[]>(() => readList<string>(RECENT_QUERIES_KEY))

  const [debouncedQ, setDebouncedQ] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 220)
    return () => clearTimeout(t)
  }, [q])

  const searching = debouncedQ.length >= 2
  const { data, isFetching, isError } = useQuery({
    queryKey: ["global-search", debouncedQ, scope],
    queryFn: () =>
      apiGet<SearchResults>(
        `/api/search?q=${encodeURIComponent(debouncedQ)}${scope !== "all" ? `&scope=${scope}` : ""}`
      ),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  // نتیجهٔ قبلی تا رسیدن نتیجهٔ تازه می‌ماند (بدون پرش)، ولی وقتی عبارت پاک شد دیگر نشان داده نمی‌شود
  const results = searching ? data : undefined
  const typing = q.trim() !== debouncedQ || (isFetching && !data)

  /* ───── بستن: در موبایل یک ورودی تاریخچه اضافه می‌شود تا Back گوشی فقط جستجو را ببندد ───── */
  const historyPushed = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (isDesktop) return
    window.history.pushState(null, "", window.location.href)
    historyPushed.current = true
    const onPop = () => {
      if (!historyPushed.current) return
      historyPushed.current = false
      onCloseRef.current()
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [isDesktop])

  const close = useCallback(() => {
    if (historyPushed.current) {
      historyPushed.current = false
      window.history.back()
    }
    onCloseRef.current()
  }, [])
  useTelegramBackButton(isTelegram && !isDesktop, close)

  // Esc وقتی فوکوس روی فیلد نیست (مثلاً بعد از کلیک روی چیپ)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement !== inputRef.current) {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [close])

  const navigate = (href: string) => {
    haptic.tap()
    onClose()
    // ورودی تاریخچهٔ جستجو با مقصد جایگزین می‌شود → Back از نتیجه به همان صفحهٔ قبلی برمی‌گردد
    if (historyPushed.current) {
      historyPushed.current = false
      router.replace(href)
    } else {
      router.push(href)
    }
  }

  // قفل اسکرول صفحهٔ زیر + برگرداندن فوکوس پس از بستن
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const release = acquireBodyScrollLock()
    const raf = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => {
      cancelAnimationFrame(raf)
      release()
      returnFocus?.focus({ preventScroll: true })
    }
  }, [])

  const remember = (entry: RecentEntry | undefined) => {
    const query = q.trim()
    if (query.length >= 2) {
      const next = [query, ...recentQueries.filter((x) => foldSearchText(x) !== foldSearchText(query))].slice(0, 6)
      setRecentQueries(next)
      writeList(RECENT_QUERIES_KEY, next)
    }
    if (entry) {
      const next = [entry, ...recentItems.filter((x) => !(x.kind === entry.kind && x.id === entry.id))].slice(0, 5)
      setRecentItems(next)
      writeList(RECENT_ITEMS_KEY, next)
    }
  }

  const select = (item: Item) => {
    if (item.onSelect) {
      item.onSelect()
      return
    }
    remember(item.recent)
    if (item.href) navigate(item.href)
  }

  /* ───── ساخت گروه‌ها ───── */
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = []
    const query = q.trim()
    const fq = foldSearchText(query)

    const pageMatches = query
      ? PAGES.filter((p) => foldSearchText(`${p.label} ${p.keywords}`).includes(fq))
      : []
    const pageGroup = (items: typeof PAGES): Group => ({
      key: "pages",
      label: "رفتن به",
      items: items.map((p) => {
        const Icon = SECTION_META[p.href].icon
        return {
          key: `page:${p.href}`,
          href: p.href,
          title: p.label,
          icon: (
            <Tile>
              <Icon className="size-[1.15rem]" />
            </Tile>
          ),
        }
      }),
    })

    // بدون عبارت: اخیرها + کارهای سریع
    if (!query) {
      if (recentItems.length > 0) {
        out.push({
          key: "recent",
          label: "اخیراً باز شده",
          action: {
            label: "پاک کردن",
            onClick: () => {
              setRecentItems([])
              writeList(RECENT_ITEMS_KEY, [])
            },
          },
          items: recentItems.map((r) => ({
            key: `recent:${r.kind}:${r.id}`,
            href: r.href,
            title: r.title,
            sub: r.sub,
            icon: recentIcon(r),
            recent: r,
          })),
        })
      }
      out.push({
        key: "actions",
        label: "کارهای سریع",
        items: [
          {
            key: "new-sale",
            href: "/invoices/new",
            title: "فاکتور فروش جدید",
            icon: (
              <Tile tone="var(--sale)">
                <Plus className="size-[1.15rem]" strokeWidth={2.4} />
              </Tile>
            ),
          },
          {
            key: "new-purchase",
            href: "/invoices/new?type=PURCHASE",
            title: "فاکتور خرید جدید",
            icon: (
              <Tile tone="var(--purchase)">
                <Plus className="size-[1.15rem]" strokeWidth={2.4} />
              </Tile>
            ),
          },
        ],
      })
      return out
    }

    // یک حرف: فقط بخش‌های برنامه (جستجوی سرور از ۲ حرف)
    if (!results) {
      if (scope === "all" && pageMatches.length) out.push(pageGroup(pageMatches))
      return out
    }

    const r = results
    const moreHref = (path: string) => `${path}?q=${encodeURIComponent(debouncedQ)}`
    const seeAll = (key: Exclude<Scope, "all">, href?: string) =>
      r.more[key]
        ? scope === "all"
          ? { label: "بیشتر", onClick: () => setScope(key) }
          : href
            ? { label: "همه در صفحهٔ خودش", href }
            : undefined
        : undefined

    if (scope === "all" && pageMatches.length) out.push(pageGroup(pageMatches))

    if (r.people.length) {
      out.push({
        key: "people",
        label: "اشخاص",
        action: seeAll("people", moreHref("/people")),
        items: r.people.map((p) => {
          const sub = [p.phone ? toPersianDigits(p.phone) : null, p.company].filter(Boolean).join(" | ")
          return {
            key: `person:${p.id}`,
            href: `/people/${p.id}`,
            title: p.name,
            sub: sub || undefined,
            icon: <RoleAvatar role={p.role} name={p.name} size={38} />,
            trailing:
              p.balance !== 0 ? (
                <span className="text-end">
                  <span className="nums block text-label font-bold">{formatTomanCompact(Math.abs(p.balance))}</span>
                  <span className={cn("block text-caption", p.balance > 0 ? "text-warning-ink" : "text-muted-foreground")}>
                    {p.balance > 0 ? "بدهکار" : "طلبکار"}
                  </span>
                </span>
              ) : null,
            recent: { kind: "person", id: p.id, title: p.name, sub: sub || undefined, href: `/people/${p.id}`, meta: p.role },
          }
        }),
      })
    }

    if (r.invoices.length) {
      out.push({
        key: "invoices",
        label: "فاکتورها",
        action: seeAll("invoices", moreHref("/invoices")),
        items: r.invoices.map((inv) => {
          const title = `${inv.type === "SALE" ? "فروش" : "خرید"} ${toPersianDigits(inv.number)} | ${inv.person.name}`
          const sub = formatJalaliShort(new Date(inv.date))
          return {
            key: `invoice:${inv.id}`,
            href: `/invoices/${inv.id}`,
            title,
            sub,
            icon: <InvoiceTypeMark type={inv.type} size={38} />,
            trailing: (
              <span className="text-end">
                <span className="nums block text-label font-bold">{formatTomanCompact(inv.total)}</span>
                <span className={cn("block text-caption", inv.credit > 0 ? "text-warning-ink" : "text-muted-foreground")}>
                  {inv.credit > 0 ? `مانده ${formatTomanCompact(inv.credit)}` : "تسویه"}
                </span>
              </span>
            ),
            recent: { kind: "invoice", id: inv.id, title, sub, href: `/invoices/${inv.id}`, meta: inv.type },
          }
        }),
      })
    }

    if (r.products.length) {
      out.push({
        key: "products",
        label: "کالاها",
        action: seeAll("products", moreHref("/products")),
        items: r.products.map((p) => {
          const sub = [p.brand, p.code ? `کد ${p.code}` : null].filter(Boolean).join(" | ")
          const href = `/products?open=${p.id}`
          return {
            key: `product:${p.id}`,
            href,
            title: p.name,
            sub: sub || undefined,
            icon: (
              <Tile>
                <Package className="size-[1.15rem]" />
              </Tile>
            ),
            recent: { kind: "product", id: p.id, title: p.name, sub: sub || undefined, href },
          }
        }),
      })
    }

    if (r.checks.length) {
      out.push({
        key: "checks",
        label: "چک‌ها",
        action: seeAll("checks"),
        items: r.checks.map((c) => {
          const received = c.direction === "RECEIVED"
          const title = `${c.person.name}`
          const sub = [
            `سررسید ${formatJalaliShort(new Date(c.dueDate))}`,
            CHECK_STATUS[c.status],
            c.serial ? toPersianDigits(c.serial) : null,
          ]
            .filter(Boolean)
            .join(" | ")
          const href = `/checks?open=${c.id}`
          return {
            key: `check:${c.id}`,
            href,
            title,
            sub,
            icon: <BankLogo bankKey={c.bankKey} size={38} />,
            trailing: (
              <span className="flex items-center gap-1.5">
                <span className="nums text-label font-bold">{formatTomanCompact(c.amount)}</span>
                <span
                  aria-label={received ? "دریافتی" : "صادره"}
                  className={cn(
                    "grid size-6 place-items-center rounded-lg",
                    received ? "bg-[color:var(--sale)]/10 text-[color:var(--sale)]" : "bg-[color:var(--purchase)]/10 text-[color:var(--purchase)]"
                  )}
                >
                  {received ? <ArrowDownToLine className="size-3.5" /> : <ArrowUpFromLine className="size-3.5" />}
                </span>
              </span>
            ),
            recent: { kind: "check", id: c.id, title, sub, href, meta: c.bankKey },
          }
        }),
      })
    }

    return out
  }, [q, debouncedQ, results, scope, recentItems])

  const items = useMemo(() => groups.flatMap((g) => g.items), [groups])

  // ردیف فعال (کیبورد) — با عوض شدن فهرست خودبه‌خود به اولی برمی‌گردد
  const sig = items.map((i) => i.key).join("|")
  const [activeState, setActiveState] = useState({ sig: "", idx: 0 })
  const active = activeState.sig === sig ? Math.min(activeState.idx, items.length - 1) : 0
  const setActive = (idx: number) => setActiveState({ sig, idx })
  const keyboardMoved = useRef(false)

  useEffect(() => {
    if (!keyboardMoved.current) return
    keyboardMoved.current = false
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const cycleScope = (dir: 1 | -1) => {
    const i = SCOPES.findIndex((s) => s.key === scope)
    setScope(SCOPES[(i + dir + SCOPES.length) % SCOPES.length].key)
    listRef.current?.scrollTo({ top: 0 })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return
      e.preventDefault()
      keyboardMoved.current = true
      const d = e.key === "ArrowDown" ? 1 : -1
      setActive((active + d + items.length) % items.length)
    } else if (e.key === "Enter") {
      const item = items[active]
      if (item) {
        e.preventDefault()
        select(item)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      if (q) setQ("")
      else close()
    } else if (e.key === "Tab" && isDesktop) {
      e.preventDefault()
      cycleScope(e.shiftKey ? -1 : 1)
    }
  }

  const showEmpty = searching && !!results && !typing && groups.length === 0
  const showSkeleton = searching && !results
  const countFor = (s: Scope) => {
    if (!results || s === "all" || scope !== "all") return null
    const n = results[s].length
    return n ? `${toPersianDigits(n)}${results.more[s] ? "+" : ""}` : null
  }

  /* ───── اجزای مشترک ───── */
  const field = (
    <input
      ref={inputRef}
      value={q}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={PLACEHOLDER[scope]}
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      role="combobox"
      aria-expanded={items.length > 0}
      aria-controls="global-search-list"
      aria-activedescendant={items[active] ? `gs-${active}` : undefined}
      aria-label="جستجوی سراسری"
      className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/75 lg:text-title [&::-webkit-search-cancel-button]:appearance-none"
    />
  )

  const clearBtn = q ? (
    <button
      type="button"
      onClick={() => {
        setQ("")
        inputRef.current?.focus()
      }}
      aria-label="پاک کردن"
      className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-foreground/70 transition-colors hover:bg-foreground/15"
    >
      <X className="size-3.5" strokeWidth={2.6} />
    </button>
  ) : null

  const scopeBar = (
    <div role="tablist" aria-label="دستهٔ جستجو" className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {SCOPES.map((s) => {
        const on = scope === s.key
        const count = countFor(s.key)
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              haptic.tap()
              setScope(s.key)
              listRef.current?.scrollTo({ top: 0 })
              inputRef.current?.focus({ preventScroll: true })
            }}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-label font-bold transition-colors",
              on
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground lg:bg-transparent lg:hover:bg-muted"
            )}
          >
            {s.label}
            {count && (
              <span className={cn("nums text-caption font-bold", on ? "text-background/70" : "text-muted-foreground/80")}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  let flatIndex = 0
  const body = (
    <div id="global-search-list" role="listbox" aria-label="نتیجه‌ها">
      {/* جستجوهای اخیر — چیپ، با زدن دوباره جستجو می‌شود */}
      {!q.trim() && recentQueries.length > 0 && (
        <section className="mb-2 px-1 pt-1 lg:px-2">
          <SectionLabel
            label="جستجوهای اخیر"
            action={{
              label: "پاک کردن",
              onClick: () => {
                setRecentQueries([])
                writeList(RECENT_QUERIES_KEY, [])
              },
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {recentQueries.map((rq) => (
              <button
                key={rq}
                type="button"
                onClick={() => {
                  setQ(rq)
                  inputRef.current?.focus({ preventScroll: true })
                }}
                className="flex h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 text-label font-medium transition-colors hover:bg-muted"
              >
                <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{rq}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.key} className="mb-2 last:mb-0">
          <div className="px-1 lg:px-2">
            <SectionLabel label={g.label} action={g.action} onNavigate={(href) => navigate(href)} />
          </div>
          <div className="divide-y divide-border/60 lg:divide-y-0">
            {g.items.map((item) => {
              const idx = flatIndex++
              return (
                <ResultRow
                  key={item.key}
                  id={`gs-${idx}`}
                  idx={idx}
                  item={item}
                  query={searching ? debouncedQ : q.trim()}
                  active={isDesktop && idx === active}
                  onHover={() => isDesktop && idx !== active && setActive(idx)}
                  onSelect={() => select(item)}
                />
              )
            })}
          </div>
        </section>
      ))}

      {/* میانبر بخش‌ها — فقط وقتی چیزی تایپ نشده */}
      {!q.trim() && (
        <section className="px-1 pt-1 lg:px-2">
          <SectionLabel label="بخش‌ها" />
          <div className="grid grid-cols-4 gap-1.5">
            {PAGES.filter((p) => p.href !== "/").map((p) => {
              const Icon = SECTION_META[p.href].icon
              return (
                <button
                  key={p.href}
                  type="button"
                  onClick={() => navigate(p.href)}
                  className="flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center transition-colors hover:bg-muted active:bg-muted"
                >
                  <Icon className="size-5 text-muted-foreground" />
                  <span className="w-full truncate text-caption font-bold">{p.short ?? p.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {q.trim().length === 1 && groups.length === 0 && (
        <p className="py-10 text-center text-label text-muted-foreground">حداقل دو حرف بنویسید</p>
      )}

      {showSkeleton && <SkeletonRows />}

      {showEmpty && (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-6" />
          </span>
          <p className="mt-3 text-body font-bold">
            {scope === "all" ? "چیزی پیدا نشد" : `در ${SCOPES.find((s) => s.key === scope)?.label} چیزی پیدا نشد`}
          </p>
          <p className="mt-1 text-label text-muted-foreground">
            املای دیگری امتحان کنید، یا فقط بخشی از نام یا شماره را بنویسید
          </p>
          {scope !== "all" && (
            <button
              type="button"
              onClick={() => setScope("all")}
              className="mt-4 h-9 rounded-full bg-muted px-4 text-label font-bold transition-colors hover:bg-accent"
            >
              جستجو در همه
            </button>
          )}
        </div>
      )}

      {isError && searching && (
        <p className="py-10 text-center text-label text-destructive">جستجو انجام نشد — اتصال را بررسی کنید</p>
      )}
    </div>
  )

  /* ───── دسکتاپ: پالت فرمان ───── */
  if (isDesktop) {
    return (
      <motion.div
        className="fixed inset-0 z-[100]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.14 }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="بستن"
          onClick={close}
          className="absolute inset-0 cursor-default bg-[rgb(15_26_23/0.32)]"
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="جستجوی سراسری"
          initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-x-0 top-[11vh] mx-auto flex max-h-[min(78vh,42rem)] w-[min(42rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-3xl border border-black/10 bg-card shadow-[0_24px_70px_-12px_rgba(15,26,23,0.35)]"
        >
          <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
            <IconSearch className="size-5 shrink-0 text-muted-foreground" />
            {field}
            {clearBtn}
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-caption font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              Esc
            </button>
            <ProgressLine show={searching && isFetching} />
          </div>
          <div className="shrink-0 border-b border-border px-4 py-2">{scopeBar}</div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {body}
          </div>
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-muted/40 px-5 text-caption text-muted-foreground">
            <Hint keys={["↑", "↓"]} label="حرکت" />
            <Hint keys={[<CornerDownLeft key="e" className="size-3" />]} label="باز کردن" />
            <Hint keys={["Tab"]} label="دسته بعدی" />
            <span className="flex-1" />
            <Hint keys={["Ctrl", "K"]} label="از هر صفحه" />
          </div>
        </motion.div>
      </motion.div>
    )
  }

  /* ───── موبایل: صفحهٔ تمام‌قد ───── */
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="جستجوی سراسری"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, transition: { duration: 0.14 } }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      <div className="relative shrink-0 bg-background px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+1.85rem)]">
        <div className="flex items-center gap-1.5">
          {!isTelegram && (
            <button
              type="button"
              onClick={close}
              aria-label="برگشت"
              className="grid size-11 shrink-0 place-items-center rounded-full text-foreground/80 active:bg-muted"
            >
              <ArrowRight className="size-[1.35rem]" />
            </button>
          )}
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-input bg-card ps-3.5 pe-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15">
            <IconSearch className="size-[1.1rem] shrink-0 text-muted-foreground" />
            {field}
            {clearBtn}
          </div>
          {isTelegram && (
            <button
              type="button"
              onClick={close}
              className="h-11 shrink-0 rounded-xl px-2.5 text-label font-bold text-primary active:bg-muted"
            >
              انصراف
            </button>
          )}
        </div>
        <div className="-mx-3 mt-2.5 px-3">{scopeBar}</div>
        <ProgressLine show={searching && isFetching} />
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 [padding-bottom:max(1.5rem,calc(env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px)+1rem))]"
        // بستن کیبورد با شروع اسکرول نتیجه‌ها — فهرست کامل دیده شود
        onTouchMove={() => {
          if (document.activeElement === inputRef.current) inputRef.current?.blur()
        }}
      >
        {body}
      </div>
    </motion.div>
  )
}

/* ───────── اجزای کوچک ───────── */

function Tile({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className="grid size-[38px] shrink-0 place-items-center rounded-[32%] bg-muted text-foreground/75"
      style={tone ? { background: `color-mix(in srgb, ${tone} 12%, white)`, color: tone } : undefined}
    >
      {children}
    </span>
  )
}

function recentIcon(r: RecentEntry): ReactNode {
  switch (r.kind) {
    case "invoice":
      return <InvoiceTypeMark type={r.meta ?? "SALE"} size={38} />
    case "person":
      return <RoleAvatar role={r.meta} name={r.title} size={38} />
    case "check":
      return <BankLogo bankKey={r.meta ?? ""} size={38} />
    default:
      return (
        <Tile>
          <Package className="size-[1.15rem]" />
        </Tile>
      )
  }
}

function SectionLabel({
  label,
  action,
  onNavigate,
}: {
  label: string
  action?: Group["action"]
  onNavigate?: (href: string) => void
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-2">
      <span className="text-caption font-bold text-muted-foreground">{label}</span>
      {action && (
        <button
          type="button"
          onClick={() => (action.href ? onNavigate?.(action.href) : action.onClick?.())}
          className="rounded-md px-1.5 py-0.5 text-caption font-bold text-primary transition-colors hover:bg-primary/10"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

function ResultRow({
  id,
  idx,
  item,
  query,
  active,
  onHover,
  onSelect,
}: {
  id: string
  idx: number
  item: Item
  query: string
  active: boolean
  onHover: () => void
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      data-idx={idx}
      data-active={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className="group flex min-h-14 w-full items-center gap-3 px-1 py-2 text-start transition-colors active:bg-muted/70 lg:min-h-0 lg:rounded-xl lg:px-2 lg:py-1.5 lg:data-[active=true]:bg-accent"
    >
      {item.icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-bold lg:text-label">
          <Highlight text={item.title} query={query} />
        </span>
        {item.sub && (
          <span className="nums block truncate text-caption text-muted-foreground">
            <Highlight text={item.sub} query={query} />
          </span>
        )}
      </span>
      {item.trailing && <span className="shrink-0">{item.trailing}</span>}
      <CornerDownLeft
        aria-hidden
        className="hidden size-4 shrink-0 text-muted-foreground lg:group-data-[active=true]:block"
      />
    </button>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const m = query.length >= 1 ? findMatch(text, query) : null
  if (!m) return <>{text}</>
  return (
    <>
      {text.slice(0, m[0])}
      <mark className="rounded-[4px] bg-warning/25 text-inherit">{text.slice(m[0], m[1])}</mark>
      {text.slice(m[1])}
    </>
  )
}

function Hint({ keys, label }: { keys: ReactNode[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-0.5" dir="ltr">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="grid h-5 min-w-5 place-items-center rounded-md border border-border bg-card px-1 font-sans text-caption font-bold text-foreground/70"
          >
            {k}
          </kbd>
        ))}
      </span>
      {label}
    </span>
  )
}

function ProgressLine({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0"
      )}
    >
      <span className="hy-search-progress absolute inset-y-0 w-1/3 rounded-full bg-primary" />
    </span>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-1 px-1 pt-2 lg:px-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <span className="size-[38px] shrink-0 animate-pulse rounded-[32%] bg-muted" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-2/5 animate-pulse rounded-full bg-muted" />
            <span className="block h-3 w-1/4 animate-pulse rounded-full bg-muted/70" />
          </span>
          <span className="h-3.5 w-14 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}
