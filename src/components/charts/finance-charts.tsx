"use client"

/**
 * نمودارهای مالی (نسخهٔ ۵) — مشترک داشبورد و گزارش‌ها
 *  • TrendChart: یک شاخص در هر لحظه (فروش / سود / خرید) به‌جای چند خط روی هم؛
 *    ستون روزانه + خط میانگین + برجسته‌شدن بهترین روز و امروز، خلاصهٔ بالای نمودار
 *    (جمع، میانگین روزانه، روند) و راهنمای فارسی کامل
 *  • CollectionDonut: از فروش این دوره چقدر نقد/چک/بعداً تسویه/هنوز نسیه است
 */
import { useId, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatToman, formatTomanCompact, toPersianDigits } from "@/lib/money"
import { dayKeyToDate, formatJalaliShort, jalaliDayKey, jalaliMonthKey, nowTehran, weekdayName } from "@/lib/jalali"
import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"

export interface SeriesPoint {
  day: string
  sales: number
  purchases: number
  profit: number
}

type Metric = "sales" | "profit" | "purchases"

const METRICS: Record<Metric, { label: string; color: string; soft: string }> = {
  sales: { label: "فروش", color: "var(--sale)", soft: "color-mix(in srgb, var(--sale) 30%, white)" },
  profit: { label: "سود", color: "var(--warning)", soft: "color-mix(in srgb, var(--warning) 35%, white)" },
  purchases: { label: "خرید", color: "var(--purchase)", soft: "color-mix(in srgb, var(--purchase) 30%, white)" },
}

/** محور عمودی فشرده: ۱٫۲م / ۸۵۰ه */
function axisMoney(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (a >= 1_000_000_000) return toPersianDigits(`${sign}${+(a / 1_000_000_000).toFixed(1)}B`)
  if (a >= 1_000_000) return toPersianDigits(`${sign}${+(a / 1_000_000).toFixed(1)}م`)
  if (a >= 1000) return toPersianDigits(`${sign}${Math.round(a / 1000)}ه`)
  return toPersianDigits(`${sign}${a}`)
}

type Range = "7" | "30" | "month"

/**
 * mode="rolling" (داشبورد): کلید ۷ روز / ۳۰ روز (پیش‌فرض) / این ماه
 * mode="period" (گزارش‌ها): دقیقاً همان بازهٔ انتخاب‌شده (مثلاً کل آبان)، بدون کلید بازه
 * روزهای آینده خالی نمایش داده می‌شوند و در میانگین نمی‌آیند.
 */
export function TrendChart({
  series,
  height = 220,
  defaultMetric = "sales",
  mode = "rolling",
  className,
}: {
  series: SeriesPoint[]
  height?: number
  defaultMetric?: Metric
  mode?: "rolling" | "period"
  className?: string
}) {
  const [metric, setMetric] = useState<Metric>(defaultMetric)
  const [range, setRange] = useState<Range>("30")
  const m = METRICS[metric]
  const todayK = useMemo(() => jalaliDayKey(nowTehran()), [])

  const points = useMemo(() => {
    let src = series
    if (mode === "rolling") {
      const upToToday = series.filter((s) => s.day <= todayK)
      if (range === "7") src = upToToday.slice(-7)
      else if (range === "30") src = upToToday.slice(-30)
      else {
        const mk = jalaliMonthKey(nowTehran())
        src = series.filter((s) => s.day.startsWith(mk))
      }
    }
    return src.map((s) => {
      const date = dayKeyToDate(s.day)
      return { ...s, date, label: formatJalaliShort(date), value: s[metric], future: s.day > todayK }
    })
  }, [series, metric, range, mode, todayK])

  const stats = useMemo(() => {
    const elapsed = points.filter((p) => !p.future)
    const vals = elapsed.map((p) => p.value)
    const total = vals.reduce((a, b) => a + b, 0)
    const active = vals.filter((v) => v !== 0).length
    const avg = elapsed.length ? total / elapsed.length : 0
    let best = -1
    elapsed.forEach((p, i) => {
      if (best < 0 || p.value > elapsed[best].value) best = i
    })
    // نیمهٔ دوم بازه نسبت به نیمهٔ اول (روند)
    const half = Math.floor(elapsed.length / 2)
    const first = vals.slice(0, half).reduce((a, b) => a + b, 0)
    const second = vals.slice(elapsed.length - half).reduce((a, b) => a + b, 0)
    const trend = half >= 2 && first > 0 ? ((second - first) / first) * 100 : null
    return {
      total,
      avg,
      best: best >= 0 && elapsed[best].value > 0 ? elapsed[best] : null,
      active,
      elapsed: elapsed.length,
      trend,
    }
  }, [points])

  const todayIdx = points.findIndex((p) => p.day === todayK)
  const empty = stats.total === 0

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRICS) as Metric[]).map((k) => ({
            key: k,
            label: METRICS[k].label,
            tone: METRICS[k].color,
          }))}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        {mode === "rolling" && (
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { key: "7", label: "۷ روز" },
              { key: "30", label: "۳۰ روز" },
              { key: "month", label: "این ماه" },
            ]}
          />
        )}
      </div>

      {/* خلاصه */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={metric + range}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          <Stat label={`جمع ${m.label}`} value={formatTomanCompact(stats.total)} tone={m.color} strong />
          <Stat label="میانگین روزانه" value={formatTomanCompact(Math.round(stats.avg))} />
          <Stat
            label={stats.trend === null ? "روزهای فعال" : "روند نیمهٔ دوم"}
            value={
              stats.trend === null
                ? `${toPersianDigits(stats.active)} از ${toPersianDigits(stats.elapsed)}`
                : `${stats.trend >= 0 ? "▲" : "▼"} ${toPersianDigits(Math.abs(Math.round(stats.trend)))}٪`
            }
            tone={stats.trend === null ? undefined : stats.trend >= 0 ? "var(--income)" : "var(--destructive)"}
          />
        </motion.div>
      </AnimatePresence>

      <div className="relative mt-3 w-full" style={{ height }} dir="ltr">
        {empty && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <span
              className="rounded-full bg-muted px-3 py-1.5 text-caption font-medium text-muted-foreground"
              dir="rtl"
            >
              در این بازه {m.label}ی ثبت نشده
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 2, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 4" stroke="var(--border)" vertical={false} />
            <XAxis
              reversed
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={26}
            />
            <YAxis
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={axisMoney}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", radius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof points)[number]
                return (
                  <div
                    dir="rtl"
                    className="min-w-40 rounded-2xl border border-border bg-card/95 p-3 text-xs shadow-float backdrop-blur"
                  >
                    <div className="mb-1.5 font-bold">
                      {weekdayName(p.date)} <span className="nums text-muted-foreground">{p.label}</span>
                    </div>
                    {(Object.keys(METRICS) as Metric[]).map((k) => (
                      <div
                        key={k}
                        className={cn("flex items-center justify-between gap-4 py-0.5", k === metric && "font-extrabold")}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: METRICS[k].color }} />
                          {METRICS[k].label}
                        </span>
                        <span className="nums">{formatToman(p[k], false)}</span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            {stats.avg > 0 && (
              <ReferenceLine
                y={stats.avg}
                stroke={m.color}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                ifOverflow="extendDomain"
              />
            )}
            <Bar dataKey="value" radius={[6, 6, 2, 2]} maxBarSize={26} animationDuration={600}>
              {points.map((p, i) => (
                <Cell
                  key={p.day}
                  fill={(stats.best && p.day === stats.best.day) || i === todayIdx ? m.color : m.soft}
                  fillOpacity={p.value < 0 || p.future ? 0.5 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: m.color }} />
          میانگین روزانه
          <span className="mx-1 opacity-40">|</span>
          <span className="size-2 rounded-sm" style={{ background: m.color }} />
          امروز و بهترین روز
        </span>
        {stats.best && (
          <span className="nums">
            بهترین روز: <b className="text-foreground">{weekdayName(stats.best.date)} {stats.best.label}</b> —{" "}
            {formatTomanCompact(stats.best.value)}
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-2.5 py-2">
      <div className="truncate text-caption text-muted-foreground">{label}</div>
      <div
        className={cn("nums mt-0.5 truncate text-label font-extrabold", strong && "text-sm")}
        style={tone ? { color: `color-mix(in srgb, ${tone} 88%, black)` } : undefined}
      >
        {value}
      </div>
    </div>
  )
}

// ───────────────────────── وصول فروش ─────────────────────────

export interface Collection {
  total: number
  cash: number
  checks: number
  settledLater: number
  open: number
}

const SLICES = [
  { key: "cash", label: "نقد", color: "var(--sale)" },
  { key: "checks", label: "چک", color: "var(--hue-checks)" },
  { key: "settledLater", label: "بعداً تسویه شد", color: "var(--role-customer)" },
  { key: "open", label: "هنوز نسیه", color: "color-mix(in srgb, var(--warning) 45%, var(--muted))" },
] as const

export function CollectionDonut({ data, className }: { data: Collection; className?: string }) {
  const slices = SLICES.map((s) => ({ ...s, value: data[s.key] })).filter((s) => s.value > 0)
  const collectedPct = data.total > 0 ? Math.round(((data.total - data.open) / data.total) * 100) : 0

  if (data.total === 0) {
    return <p className={cn("py-8 text-center text-xs text-muted-foreground", className)}>فروشی در این دوره نبوده</p>
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative size-32 shrink-0 sm:size-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 2.5 : 0}
              cornerRadius={6}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              animationDuration={700}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="nums text-xl font-black leading-none">{toPersianDigits(collectedPct)}٪</div>
            <div className="mt-1 text-caption font-medium text-muted-foreground">وصول شده</div>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {SLICES.map((s, i) => {
          const v = data[s.key]
          const pct = data.total ? (v / data.total) * 100 : 0
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <div className="flex items-center justify-between gap-2 text-caption">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="nums shrink-0 font-bold">{formatTomanCompact(v)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: s.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.2 + i * 0.05, type: "spring", stiffness: 120, damping: 22 }}
                />
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────── مینی‌ترند ─────────────────────────

/** نمودار مینیاتوری خط+سطح برای کارت‌ها — بدون محور؛ آخرین نقطه برجسته */
export function Sparkline({
  values,
  color = "var(--primary)",
  height = 28,
  className,
  muted = false,
}: {
  values: number[]
  color?: string
  height?: number
  className?: string
  /** نسخهٔ ۷: خط خاکستری بدون سایه‌رنگ؛ فقط نقطهٔ پایانی رنگی */
  muted?: boolean
}) {
  const id = useId().replace(/:/g, "")
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const W = 100
  const H = 30
  const max = Math.max(...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 8)
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  const last = values.length - 1
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      aria-hidden
      style={{ overflow: "visible", direction: "ltr" }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!muted && <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />}
      <path
        d={line}
        fill="none"
        stroke={muted ? "color-mix(in srgb, var(--muted-foreground) 45%, transparent)" : color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last)} cy={y(values[last])} r={2.2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
