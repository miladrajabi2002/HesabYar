/**
 * مقادیر پیش‌فرض اولیه — lib/defaults.ts
 */

export const DEFAULT_CATEGORIES: { name: string; type: string; color: string; icon: string }[] = [
  { name: "خوراک", type: "EXPENSE", color: "#F97316", icon: "UtensilsCrossed" },
  { name: "رفت‌وآمد", type: "EXPENSE", color: "#0EA5E9", icon: "Car" },
  { name: "خرید", type: "EXPENSE", color: "#EC4899", icon: "ShoppingBag" },
  { name: "قبوض", type: "EXPENSE", color: "#8B5CF6", icon: "Receipt" },
  { name: "سرگرمی", type: "EXPENSE", color: "#EF4444", icon: "Clapperboard" },
  { name: "حقوق", type: "INCOME", color: "#0E7C66", icon: "Briefcase" },
  { name: "فریلنس", type: "INCOME", color: "#14B8A6", icon: "Laptop" },
  { name: "سایر درآمدها", type: "INCOME", color: "#6B7280", icon: "CircleDollarSign" },
]

export const DEFAULT_ALERT_RULES = ["BUDGET_THRESHOLD", "LOW_BALANCE", "DEBT_DUE", "RECURRING_RUN"] as const
