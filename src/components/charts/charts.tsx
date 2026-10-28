"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatToman, formatTomanCompact } from "@/lib/money"

/** Tooltip فارسی مشترک */
function PersianTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string | number }[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div dir="rtl" className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-card">
      {label ? <div className="mb-1 font-semibold text-foreground">{label}</div> : null}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span>{p.name === "income" ? "درآمد" : p.name === "expense" ? "هزینه" : p.name}</span>
          <span className="nums ms-auto font-medium text-foreground">{formatToman(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS_STYLE = { fontSize: 11, fill: "#6B7280", fontFamily: "inherit" } as const

/** نمودار روند درآمد/هزینه (Area) */
export function TrendChart({
  data,
  height = 240,
}: {
  data: { label: string; income: number; expense: number }[]
  height?: number
}) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16A34A" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#16A34A" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E5484D" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#E5484D" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF2" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} reversed />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={56}
            orientation="right"
            tickFormatter={(v: number) => formatTomanCompact(v).replace(" تومان", "")}
          />
          <Tooltip content={<PersianTooltip />} cursor={{ stroke: "#0E7C66", strokeOpacity: 0.18 }} />
          <Area type="monotone" dataKey="income" name="income" stroke="#16A34A" strokeWidth={2.2} fill="url(#gIncome)" animationDuration={700} />
          <Area type="monotone" dataKey="expense" name="expense" stroke="#E5484D" strokeWidth={2.2} fill="url(#gExpense)" animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** دونات تفکیک هزینه‌ها با جمع در مرکز */
export function ExpenseDonut({
  data,
  total,
  height = 220,
}: {
  data: { name: string; amount: number; color: string; percent: number }[]
  total: number
  height?: number
}) {
  return (
    <div className="relative" style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2.5}
            cornerRadius={5}
            strokeWidth={0}
            animationDuration={700}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<PersianTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" dir="rtl">
        <span className="text-[0.68rem] text-muted-foreground">جمع هزینه ماه</span>
        <span className="nums text-sm font-extrabold text-foreground">{formatTomanCompact(total)}</span>
      </div>
    </div>
  )
}

/** نمودار میله‌ای مقایسه درآمد/هزینه */
export function ComparisonBar({
  data,
  height = 240,
}: {
  data: { label: string; income: number; expense: number }[]
  height?: number
}) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ECEEF2" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} reversed />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={56}
            orientation="right"
            tickFormatter={(v: number) => formatTomanCompact(v).replace(" تومان", "")}
          />
          <Tooltip content={<PersianTooltip />} cursor={{ fill: "rgba(14,124,102,0.05)" }} />
          <Bar dataKey="income" name="income" fill="#16A34A" radius={[5, 5, 0, 0]} maxBarSize={26} animationDuration={700} />
          <Bar dataKey="expense" name="expense" fill="#E5484D" radius={[5, 5, 0, 0]} maxBarSize={26} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** راهنمای رنگی نمودارها */
export function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-income" />
        درآمد
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-expense" />
        هزینه
      </span>
    </div>
  )
}
