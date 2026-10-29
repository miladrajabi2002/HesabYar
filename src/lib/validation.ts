/**
 * اعتبارسنجی ورودی API با Zod — lib/validation.ts
 * همه پیام‌های خطا فارسی هستند.
 */
import { z } from "zod"
import { toLatinDigits } from "./money"

/** فقط ارقام (پارسی/لاتین) → عدد صحیح نامنفی تومان */
export const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v) => Math.round(Number(toLatinDigits(String(v)).replace(/[^\d-]/g, "")) || 0))
  .refine((n) => Number.isFinite(n), "مبلغ نامعتبر است")

export const positiveAmount = amountSchema.refine((n) => n > 0, "مبلغ باید بیشتر از صفر باشد")
export const nonNegativeAmount = amountSchema.refine((n) => n >= 0, "مبلغ نمی‌تواند منفی باشد")

export const quantitySchema = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = Number(toLatinDigits(String(v)).replace(/[^\d.-]/g, ""))
    return Number.isFinite(n) ? n : 0
  })
  .refine((n) => n > 0, "تعداد باید بیشتر از صفر باشد")

/** رشته فارسی/لاتین اختیاری که null خالی شود */
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `حداکثر ${max} کاراکتر مجاز است`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} را وارد کنید`)
    .max(max, `${label} حداکثر ${max} کاراکتر است`)

/** تاریخ شمسی «1404-08-15» → لحظه UTC ظهر تهران */
export const jalaliDaySchema = z
  .string()
  .trim()
  .regex(/^1[34]\d{2}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/, "قالب تاریخ باید شمسی مثل ۱۴۰۴-۰۸-۱۵ باشد")

// ───────────────────────── اشخاص ─────────────────────────

export const personRoleSchema = z.enum(["CUSTOMER", "SUPPLIER", "BOTH"], {
  message: "نقش شخص نامعتبر است",
})

export const personCreateSchema = z.object({
  name: requiredText(2, 100, "نام"),
  phone: optionalText(20),
  company: optionalText(100),
  shopAddress: optionalText(300),
  role: personRoleSchema.default("BOTH"),
  note: optionalText(500),
})

export const personUpdateSchema = personCreateSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

// ───────────────────────── اجناس ─────────────────────────

export const productCreateSchema = z.object({
  name: requiredText(2, 150, "نام جنس"),
  brand: optionalText(80),
  code: optionalText(50),
  unit: z.enum(["عدد", "کیلوگرم", "پاکت", "کارتن", "متر", "بسته"], {
    message: "واحد شمارش نامعتبر است",
  }).default("عدد"),
  minStock: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? 0 : Number(toLatinDigits(String(v)).replace(/[^\d.-]/g, "")) || 0)),
})

export const productUpdateSchema = productCreateSchema.partial()

// ───────────────────────── حساب‌های بانکی ─────────────────────────

export const accountCreateSchema = z.object({
  name: requiredText(2, 80, "نام حساب"),
  bankKey: z.string().trim().min(1, "بانک را انتخاب کنید"),
  accountNumber: optionalText(40),
  cardNumber: optionalText(25),
  initialBalance: nonNegativeAmount.default(0),
})

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

export const transferSchema = z.object({
  fromAccountId: z.string().min(1, "حساب مبدأ را انتخاب کنید"),
  toAccountId: z.string().min(1, "حساب مقصد را انتخاب کنید"),
  amount: positiveAmount,
  description: optionalText(200),
  date: jalaliDaySchema.optional(),
})

// ───────────────────────── اقلام فاکتور ─────────────────────────

export const invoiceItemSchema = z.object({
  productId: z.string().min(1, "جنس را انتخاب کنید"),
  quantity: quantitySchema,
  unitPrice: nonNegativeAmount,
})

/** جنس جدید به همراه قیمت — برای افزودن سریع در فاکتور */
export const productQuickCreateSchema = productCreateSchema.extend({
  unitPrice: nonNegativeAmount.optional().default(0),
})

// ───────────────────────── چک ─────────────────────────

export const checkInputSchema = z.object({
  serial: optionalText(40),
  amount: positiveAmount,
  bankKey: z.string().trim().min(1, "بانک چک را انتخاب کنید"),
  dueDate: jalaliDaySchema,
  note: optionalText(200),
})

// ───────────────────────── فاکتور خرید/فروش ─────────────────────────

export const invoiceCreateSchema = z
  .object({
    type: z.enum(["PURCHASE", "SALE"], { message: "نوع فاکتور نامعتبر است" }),
    personId: z.string().min(1, "شخص را انتخاب کنید"),
    date: jalaliDaySchema,
    items: z.array(invoiceItemSchema).min(1, "حداقل یک قلم به فاکتور اضافه کنید"),
    discount: nonNegativeAmount.default(0),
    // پرداخت
    accountId: z.string().optional().nullable(),
    paidCash: nonNegativeAmount.default(0),
    checks: z.array(checkInputSchema).default([]),
    note: optionalText(500),
  })
  .refine((d) => (d.accountId ? true : d.paidCash === 0), {
    message: "برای پرداخت نقدی، حساب بانکی را انتخاب کنید",
    path: ["accountId"],
  })
  .refine((d) => !d.accountId || d.paidCash > 0 || d.checks.length > 0, {
    message: "مبلغ نقدی صفر است؛ حساب را بردارید یا چک اضافه کنید",
    path: ["paidCash"],
  })

// ───────────────────────── تسویه ─────────────────────────

export const settleSchema = z
  .object({
    personId: z.string().min(1, "شخص را انتخاب کنید"),
    invoiceId: z.string().optional().nullable(),
    direction: z.enum(["RECEIVE", "PAY"], { message: "جهت تسویه نامعتبر است" }),
    method: z.enum(["CASH", "CHECK"], { message: "روش تسویه نامعتبر است" }),
    amount: positiveAmount,
    accountId: z.string().optional().nullable(),
    check: checkInputSchema.optional().nullable(),
    date: jalaliDaySchema.optional(),
    note: optionalText(300),
  })
  .refine((d) => (d.method === "CASH" ? !!d.accountId : !!d.check), {
    message: "برای تسویه نقدی حساب بانکی لازم است / برای تسویه چکی مشخصات چک لازم است",
    path: ["accountId"],
  })

// ───────────────────────── تغییر وضعیت چک ─────────────────────────

export const checkStatusSchema = z.object({
  status: z.enum(["CASHED", "BOUNCED", "CANCELED", "PENDING"], {
    message: "وضعیت چک نامعتبر است",
  }),
  accountId: z.string().optional().nullable(),
  note: optionalText(200),
})

// ───────────────────────── فیلترهای لیست ─────────────────────────

export const invoiceFilterSchema = z.object({
  type: z.enum(["PURCHASE", "SALE"]).optional(),
  personId: z.string().optional(),
  month: z.string().regex(/^\d{3,4}-\d{1,2}$/, "قالب ماه شمسی نامعتبر است").optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const personFilterSchema = z.object({
  role: personRoleSchema.optional(),
  q: z.string().trim().max(100).optional(),
  onlyWithBalance: z.coerce.boolean().optional(),
})

export const checkFilterSchema = z.object({
  direction: z.enum(["RECEIVED", "ISSUED"]).optional(),
  status: z.enum(["PENDING", "CASHED", "BOUNCED", "CANCELED"]).optional(),
  personId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// ───────────────────────── تنظیمات ─────────────────────────

export const loginSchema = z.object({
  username: requiredText(1, 60, "نام کاربری"),
  password: requiredText(1, 100, "رمز عبور"),
})

export const settingsSchema = z.object({
  botToken: optionalText(100),
  adminChatId: optionalText(30),
  miniAppUrl: optionalText(200),
  checkDueDaysBefore: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? 3 : Math.max(0, Math.min(30, Number(toLatinDigits(String(v)).replace(/[^\d]/g, "")) || 3))
    ),
})
