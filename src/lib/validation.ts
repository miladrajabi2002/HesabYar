/**
 * اسکیماهای اعتبارسنجی Zod — lib/validation.ts
 * تمام ورودی‌های API قبل از هر عملیاتی از این اسکیماها عبور می‌کنند.
 */
import { z } from "zod"

export const ACCOUNT_TYPES = ["CASH", "BANK", "CARD", "SAVINGS", "OTHER"] as const
export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const
export const TX_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const
export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY_JALALI"] as const
export const DEBT_DIRECTIONS = ["I_OWE", "OWED_TO_ME"] as const
export const ALERT_TYPES = ["BUDGET_THRESHOLD", "LOW_BALANCE", "DEBT_DUE", "RECURRING_RUN"] as const

export const ACCOUNT_TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  CASH: "کیف پول",
  BANK: "حساب بانکی",
  CARD: "کارت",
  SAVINGS: "پس‌انداز",
  OTHER: "سایر",
}

export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  DAILY: "روزانه",
  WEEKLY: "هفتگی",
  MONTHLY_JALALI: "ماهانه شمسی",
}

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "تاریخ معتبر نیست" })

const positiveAmount = z
  .number({ message: "مبلغ باید عدد باشد" })
  .int("مبلغ باید عدد صحیح تومان باشد")
  .gt(0, "مبلغ باید بزرگ‌تر از صفر باشد")

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "رنگ باید کد HEX معتبر باشد")

const idField = z.string().min(1, "این فیلد الزامی است")

const monthKeyField = z
  .string()
  .regex(/^\d{3,4}-(0[1-9]|1[0-2])$/, "قالب ماه شمسی باید مثل 1404-08 باشد")

const noteField = z.string().max(300, "یادداشت حداکثر ۳۰۰ کاراکتر است").optional().nullable()

/* ---------- Account ---------- */
export const accountCreateSchema = z.object({
  name: z.string().min(1, "نام حساب الزامی است").max(50, "نام حساب حداکثر ۵۰ کاراکتر است"),
  type: z.enum(ACCOUNT_TYPES, { message: "نوع حساب نامعتبر است" }),
  color: hexColor,
  icon: z.string().min(1, "آیکون الزامی است").max(60),
  initialBalance: z.number().int("موجودی اولیه باید عدد صحیح باشد").gte(0, "موجودی اولیه نمی‌تواند منفی باشد").default(0),
  sortOrder: z.number().int().optional(),
})

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const accountSafeDeleteSchema = z.object({
  action: z.enum(["DELETE_TRANSACTIONS", "MOVE_TRANSACTIONS"], { message: "نوع حذف نامعتبر است" }),
  moveToAccountId: z.string().optional(),
})

/* ---------- Category ---------- */
export const categoryCreateSchema = z.object({
  name: z.string().min(1, "نام دسته الزامی است").max(40, "نام دسته حداکثر ۴۰ کاراکتر است"),
  type: z.enum(CATEGORY_TYPES, { message: "نوع دسته نامعتبر است" }),
  color: hexColor,
  icon: z.string().min(1, "آیکون الزامی است").max(60),
})

export const categoryUpdateSchema = categoryCreateSchema.partial()

export const categorySafeDeleteSchema = z.object({
  action: z.enum(["CLEAR_CATEGORY", "MOVE_TRANSACTIONS"], { message: "نوع حذف نامعتبر است" }),
  moveToCategoryId: z.string().optional(),
})

/* ---------- Transaction ---------- */
export const transactionCreateSchema = z
  .object({
    type: z.enum(TX_TYPES, { message: "نوع تراکنش نامعتبر است" }),
    amount: positiveAmount,
    accountId: idField,
    toAccountId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    date: isoDate,
    note: noteField,
  })
  .superRefine((val, ctx) => {
    if (val.type === "TRANSFER") {
      if (!val.toAccountId) {
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "حساب مقصد انتقال الزامی است" })
      } else if (val.toAccountId === val.accountId) {
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "حساب مبدأ و مقصد نباید یکسان باشند" })
      }
    }
  })

export const transactionUpdateSchema = z
  .object({
    type: z.enum(TX_TYPES).optional(),
    amount: positiveAmount.optional(),
    accountId: idField.optional(),
    toAccountId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    date: isoDate.optional(),
    note: noteField,
  })
  .superRefine((val, ctx) => {
    if (val.type === "TRANSFER" && val.toAccountId && val.accountId && val.toAccountId === val.accountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "حساب مبدأ و مقصد نباید یکسان باشند" })
    }
  })

export const transferCreateSchema = z
  .object({
    fromAccountId: idField,
    toAccountId: idField,
    amount: positiveAmount,
    date: isoDate,
    note: noteField,
  })
  .superRefine((val, ctx) => {
    if (val.fromAccountId === val.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "حساب مبدأ و مقصد نباید یکسان باشند" })
    }
  })

export const transactionQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  monthJalali: monthKeyField.optional(),
  type: z.enum(TX_TYPES).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  q: z.string().max(100, "جست‌وجو حداکثر ۱۰۰ کاراکتر است").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

/* ---------- Budget ---------- */
export const budgetCreateSchema = z.object({
  categoryId: idField,
  amount: positiveAmount,
  monthJalali: monthKeyField,
  alertThreshold: z.number().int().min(1, "آستانه هشدار حداقل ۱ درصد است").max(100, "آستانه هشدار حداکثر ۱۰۰ درصد است").default(80),
})

export const budgetUpdateSchema = z.object({
  amount: positiveAmount.optional(),
  alertThreshold: z.number().int().min(1).max(100).optional(),
})

export const budgetCopySchema = z.object({
  fromMonth: monthKeyField,
  toMonth: monthKeyField,
})

/* ---------- Recurring ---------- */
export const recurringCreateSchema = z
  .object({
    title: z.string().min(1, "عنوان الزامی است").max(80, "عنوان حداکثر ۸۰ کاراکتر است"),
    type: z.enum(["INCOME", "EXPENSE"], { message: "نوع تکرارشونده نامعتبر است" }),
    amount: positiveAmount,
    accountId: idField,
    categoryId: z.string().optional().nullable(),
    frequency: z.enum(FREQUENCIES, { message: "تواتر نامعتبر است" }),
    interval: z.number().int().min(1, "بازه حداقل ۱ است").max(365, "بازه حداکثر ۳۶۵ است").default(1),
    dayOfMonth: z.number().int().min(1, "روز ماه بین ۱ تا ۳۱ است").max(31, "روز ماه بین ۱ تا ۳۱ است").optional().nullable(),
    startDate: isoDate,
  })
  .superRefine((val, ctx) => {
    if (val.frequency === "MONTHLY_JALALI" && (val.dayOfMonth === null || val.dayOfMonth === undefined)) {
      ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "برای تکرار ماهانه شمسی، روز ماه الزامی است" })
    }
  })

export const recurringUpdateSchema = z
  .object({
    title: z.string().min(1, "عنوان الزامی است").max(80, "عنوان حداکثر ۸۰ کاراکتر است").optional(),
    type: z.enum(["INCOME", "EXPENSE"]).optional(),
    amount: positiveAmount.optional(),
    accountId: idField.optional(),
    categoryId: z.string().optional().nullable(),
    frequency: z.enum(FREQUENCIES).optional(),
    interval: z.number().int().min(1, "بازه حداقل ۱ است").max(365, "بازه حداکثر ۳۶۵ است").optional(),
    dayOfMonth: z.number().int().min(1, "روز ماه بین ۱ تا ۳۱ است").max(31, "روز ماه بین ۱ تا ۳۱ است").optional().nullable(),
    startDate: isoDate.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.frequency === "MONTHLY_JALALI" && val.dayOfMonth === null) {
      ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "برای تکرار ماهانه شمسی، روز ماه الزامی است" })
    }
  })

/* ---------- Debt ---------- */
export const debtCreateSchema = z.object({
  direction: z.enum(DEBT_DIRECTIONS, { message: "نوع بدهی/طلب نامعتبر است" }),
  person: z.string().min(1, "نام شخص الزامی است").max(60, "نام حداکثر ۶۰ کاراکتر است"),
  amount: positiveAmount,
  dueDate: isoDate.optional().nullable(),
  note: noteField,
})

export const debtUpdateSchema = debtCreateSchema.partial()

export const debtSettleSchema = z.object({
  amount: positiveAmount,
  accountId: idField,
  date: isoDate.optional(),
  note: noteField,
})

/* ---------- AlertRule ---------- */
export const alertRuleCreateSchema = z.object({
  type: z.enum(ALERT_TYPES, { message: "نوع هشدار نامعتبر است" }),
  accountId: z.string().optional().nullable(),
  threshold: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
})

export const alertRuleUpdateSchema = z.object({
  threshold: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  accountId: z.string().optional().nullable(),
})

/* ---------- Settings ---------- */
export const settingsUpdateSchema = z.object({
  botToken: z.string().max(64).optional().nullable(),
  adminChatId: z.string().regex(/^\d{3,15}$/, "شناسه عددی تلگرام معتبر نیست").optional().nullable(),
  miniAppUrl: z.union([z.string().url("آدرس مینی‌اپ معتبر نیست"), z.literal("")]).optional().nullable(),
  lowBalanceDefault: z.number().int().min(0, "حد موجودی نمی‌تواند منفی باشد").optional(),
})

/* ---------- Auth ---------- */
export const loginSchema = z.object({
  username: z.string().min(1, "نام کاربری الزامی است").max(60),
  password: z.string().min(1, "رمز عبور الزامی است").max(100),
})

/* ---------- Reports ---------- */
export const reportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => new Date(v.from).getTime() <= new Date(v.to).getTime(), {
    message: "تاریخ شروع باید قبل از تاریخ پایان باشد",
  })
