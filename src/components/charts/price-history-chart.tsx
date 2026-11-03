"use client"

/**
 * روند قیمت یک کالا — بر اساس تاریخ فاکتورها (هر نقطه = یک قلم فاکتور).
 * دو حالت: «خرید و فروش» (یک خط قرمز خرید + یک خط سبز فروش) و «فروشنده‌ها»
 * (قیمت خرید از هر فروشنده یک خط، با رتبه‌بندی ارزان‌ترین).
 * محور زمان راست‌به‌چپ، مثل بقیهٔ نمودارهای برنامه.
 */
import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatToman, toPersianDigits } from "@/lib/money"
import { formatJalaliShort } from "@/lib/jalali"
import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"

export interface PricePoint {
  date: string
  type: "PURCHASE" | "SALE"
  unitPrice: number
  personId?: string
  personName?: string
}

type Range = "all" | "90" | "30"
type View = "type" | "supplier"

const BUY = "var(--destructive)"
const SELL = "var(--income)"
/** رنگ فروشنده‌ها — حداکثر ۵ فروشندهٔ پرتکرار، بقیه در «سایر» */
const SUPPLIER_COLORS = ["#0f766e", "#d97706", "#7c3aed", "#db2777", "#2563eb"]
const OTHER_COLOR = "#8b949e"
const MAX_SUPPLIERS = 5

function axisMoney(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000_000) return toPersianDigits(`${+(a / 1_000_000_000).toFixed(1)}B`)
  if (a >= 1_000_000) return toPersianDigits(`${+(a / 1_000_000).toFixed(1)}م`)
  if (a >= 1000) return toPersianDigits(`${Math.round(a / 1000)}ه`)
  return toPersianDigits(a)
}

export function PriceHistoryChart({ history, height = 190 }: { history: PricePoint[]; height?: number }) {
  const [range, setRange] = useState<Range>("all")
  const [view, setView] = useState<View>("type")

  const points = useMemo(() => {
    const all = history.map((h) => ({
      t: new Date(h.date).getTime(),
      type: h.type,
      price: h.unitPrice,
      personId: h.personId ?? "",
      personName: h.personName ?? "",
    }))
    if (range === "all" || all.length === 0) return all
    const last = Math.max(...all.map((p) => p.t))
    const from = last - Number(range) * 86_400_000
    return all.filter((p) => p.t >= from)
  }, [history, range])

  // فروشنده‌ها: بر اساس تعداد خرید مرتب می‌شوند؛ فراتر از سقف → «سایر»
  const suppliers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; prices: number[] }>()
    for (const p of points) {
      if (p.type !== "PURCHASE") continue
      const cur = map.get(p.personId) ?? { id: p.personId, name: p.personName, prices: [] }
      cur.prices.push(p.price)
      map.set(p.personId, cur)
    }
    const sorted = [...map.values()].sort((a, b) => b.prices.length - a.prices.length)
    const top = sorted.slice(0, MAX_SUPPLIERS).map((s, i) => ({
      ...s,
      key: `s${i}`,
      color: SUPPLIER_COLORS[i],
      last: s.prices[s.prices.length - 1],
      avg: Math.round(s.prices.reduce((a, b) => a + b, 0) / s.prices.length),
    }))
    const topIds = new Set(top.map((s) => s.id))
    return { top, topIds, hasOther: sorted.length > MAX_SUPPLIERS }
  }, [points])

  const supplierMode = view === "supplier"

  const rows = useMemo(() => {
    const src = supplierMode ? points.filter((p) => p.type === "PURCHASE") : points
    return src.map((p, i) => {
      const row: Record<string, number | string | undefined> = { i, t: p.t, name: p.personName }
      if (supplierMode) {
        const s = suppliers.top.find((x) => x.id === p.personId)
        row[s ? s.key : "other"] = p.price
        row.color = s ? s.color : OTHER_COLOR
      } else {
        row[p.type === "PURCHASE" ? "buy" : "sell"] = p.price
      }
      return row
    })
  }, [points, supplierMode, suppliers])

  const cheapestId = useMemo(() => {
    if (suppliers.top.length < 2) return null
    return [...suppliers.top].sort((a, b) => a.last - b.last)[0].id
  }, [suppliers])

  // قیمت ثابت (مثلاً یک فروشنده بدون تغییر) با دامنهٔ auto پنج برچسب یکسان می‌ساخت →
  // خط وسط و سه تیک: یک پله پایین‌تر، خود قیمت، یک پله بالاتر
  const ys = rows.flatMap((r) =>
    Object.entries(r)
      .filter(([k, v]) => k !== "i" && k !== "t" && typeof v === "number")
      .map(([, v]) => v as number)
  )
  const flat = ys.length > 0 && ys[0] > 0 && Math.min(...ys) === Math.max(...ys) ? ys[0] : null
  const yStep = flat ? 10 ** Math.max(0, Math.floor(Math.log10(flat)) - 1) : 0
  const yTicks = flat ? [flat - yStep, flat, flat + yStep] : undefined
  const yDomain: [number | string, number | string] = flat ? [flat - yStep, flat + yStep] : ["auto", "auto"]

  // تیک‌های محور زمان یکتا — چند فاکتور در یک روز تیک (و کلید) تکراری می‌ساخت
  const xTicks = [...new Set(rows.map((r) => r.t as number))]

  if (history.length === 0) return null

  const hasSuppliers = history.filter((h) => h.type === "PURCHASE").length > 0

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold">روند قیمت خرید و فروش</h3>
        {history.length > 4 && (
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { key: "all", label: "همه" },
              { key: "90", label: "۹۰ روز" },
              { key: "30", label: "۳۰ روز" },
            ]}
          />
        )}
      </div>

      {hasSuppliers && (
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { key: "type", label: "خرید و فروش" },
            { key: "supplier", label: "مقایسهٔ فروشنده‌ها" },
          ]}
          className="mt-2.5"
        />
      )}

      {/* راهنما */}
      {!supplierMode && (
        <div className="mt-2.5 flex items-center gap-3 text-caption text-muted-foreground">
          <Legend color={BUY} label="خرید" />
          <Legend color={SELL} label="فروش" />
        </div>
      )}

      <div className="mt-3 w-full" style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 2, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke="var(--border)" vertical={false} />
            <XAxis
              reversed
              type="number"
              dataKey="t"
              domain={["dataMin", "dataMax"]}
              ticks={xTicks}
              scale="time"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(t: number) => formatJalaliShort(new Date(t))}
              minTickGap={36}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              orientation="right"
              domain={yDomain}
              ticks={yTicks}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={axisMoney}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as Record<string, number | string | undefined>
                const price = (supplierMode
                  ? [...suppliers.top.map((s) => p[s.key]), p.other].find((v) => typeof v === "number")
                  : (p.buy ?? p.sell)) as number
                const color = supplierMode ? (p.color as string) : p.buy !== undefined ? BUY : SELL
                return (
                  <div dir="rtl" className="rounded-2xl border border-border bg-card p-2.5 text-xs shadow-float">
                    <div className="nums font-bold">{formatJalaliShort(new Date(p.t as number))}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: color }} />
                      {supplierMode ? p.name : p.buy !== undefined ? "خرید" : "فروش"}
                      <span className="nums font-extrabold">{formatToman(price, false)}</span>
                    </div>
                    {!supplierMode && p.name && <div className="mt-0.5 text-caption text-muted-foreground">{p.name}</div>}
                  </div>
                )
              }}
            />
            {/* بدون Fragment: Recharts 2 با React 19 فرزندان داخل <>…</> را نمی‌بیند و خط‌ها رسم نمی‌شدند */}
            {supplierMode &&
              suppliers.top.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  stroke={s.color}
                  strokeWidth={2.2}
                  connectNulls
                  dot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            {supplierMode && suppliers.hasOther && (
              <Line
                dataKey="other"
                stroke={OTHER_COLOR}
                strokeWidth={0}
                dot={{ r: 3.5, strokeWidth: 0, fill: OTHER_COLOR }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
            {!supplierMode && (
              <Line
                dataKey="buy"
                type="monotone"
                stroke={BUY}
                strokeWidth={2.2}
                connectNulls
                dot={{ r: 3.5, strokeWidth: 0, fill: BUY }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
            {!supplierMode && (
              <Line
                dataKey="sell"
                type="monotone"
                stroke={SELL}
                strokeWidth={2.2}
                connectNulls
                dot={{ r: 3.5, strokeWidth: 0, fill: SELL }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* رتبه‌بندی فروشنده‌ها: ارزان‌ترین بر اساس آخرین قیمت خرید */}
      {supplierMode && (
        <div className="mt-3 space-y-1.5">
          {suppliers.top.length === 0 ? (
            <p className="py-2 text-center text-caption text-muted-foreground">در این بازه خریدی ثبت نشده</p>
          ) : (
            [...suppliers.top]
              .sort((a, b) => a.last - b.last)
              .map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-caption font-bold">{s.name}</div>
                    <div className="nums text-micro text-muted-foreground">
                      {toPersianDigits(s.prices.length)} خرید • میانگین {formatToman(s.avg, false)}
                    </div>
                  </div>
                  {s.id === cheapestId && (
                    <span className="shrink-0 rounded-full bg-income/15 px-2 py-0.5 text-micro font-extrabold text-income">
                      ارزان‌ترین
                    </span>
                  )}
                  <span className={cn("nums shrink-0 text-label font-extrabold")}>{formatToman(s.last, false)}</span>
                </div>
              ))
          )}
          {suppliers.hasOther && (
            <p className="text-center text-micro text-muted-foreground">
              فروشنده‌های کم‌خرید در نمودار با نقطهٔ خاکستری نشان داده شده‌اند
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
