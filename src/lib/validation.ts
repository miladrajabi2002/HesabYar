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

/**
 * مانده اولیه شخص (حساب قدیمی) — می‌تواند مثبت (طلب ما) یا منفی (بدهی ما) باشد.
 * اگر ارسال نشود undefined برمی‌گردد تا در ویرایش، مقدار قبلی دست‌نخورده بماند
 * (در ایجاد، Prisma از @default(0) استفاده می‌کند).
 */
export const personOpeningBalanceSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined
    const n = Math.round(Number(toLatinDigits(String(v)).replace(/[^\d.-]/g, "")) || 0)
    return Number.isFinite(n) ? n : 0
  })

export const personCreateSchema = z.object({
  name: requiredText(2, 100, "نام"),
  phone: optionalText(20),
  company: optionalText(100),
  shopAddress: optionalText(300),
  role: personRoleSchema.default("BOTH"),
  note: optionalText(500),
  openingBalance: personOpeningBalanceSchema,
})

export const personUpdateSchema = personCreateSchema.partial().extend({
  isArchived: z.boolean().optional(),
})

// ───────────────────────── کالاها ─────────────────────────

export const productCreateSchema = z.object({
  name: requiredText(2, 150, "نام کالا"),
  brand: optionalText(80),
  code: optionalText(50),
  unit: z.enum(["عدد", "کیلوگرم", "پاکت", "کارتن", "متر", "بسته"], {
    message: "واحد شمارش نامعتبر است",
  }).default("عدد"),
  // حد هشدار موجودی — اگر ارسال نشود (ویرایش) دست‌نخورده می‌ماند
  minStock: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      const n = Number(toLatinDigits(String(v)).replace(/[^\d.-]/g, ""))
      return Number.isFinite(n) && n > 0 ? n : 0
    }),
  // موجودی اولیه انبار هنگام ثبت کالا — اگر ارسال نشود (ویرایش) دست‌نخورده می‌ماند
  initialStock: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      const n = Number(toLatinDigits(String(v)).replace(/[^\d.-]/g, ""))
      return Number.isFinite(n) && n > 0 ? n : 0
    }),
  // قیمت خرید هر واحد از موجودی اولیه (تومان) — اگر ارسال نشود (ویرایش) دست‌نخورده می‌ماند
  initialStockCostPrice: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      const n = Number(toLatinDigits(String(v)).replace(/[^\d]/g, ""))
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
    }),
})

export const productUpdateSchema = productCreateSchema.partial()

// ───────────────────────── حساب‌های بانکی ─────────────────────────

/**
 * شماره شبا (IRAN IBAN) — ورودی آزاد پذیرفته می‌شود:
 * ارقام فارسی/عربی/لاتین، با یا بدون پیشوند IR، با یا بدون فاصله/خط تیره.
 * خروجی همیشه به شکل استاندارد «IR + ۲۴ رقم لاتین» ذخیره می‌شود.
 * خالی/null → null (فیلد اختیاری است).
 */
export const shebaSchema = z
  .string()
  .trim()
  .max(60, "شماره شبا نامعتبر است")
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null
    // ارقام فارسی/عربی → لاتین؛ حروف (IR)، فاصله و هر کاراکتر غیررقمی حذف می‌شود
    const digits = toLatinDigits(v.toUpperCase()).replace(/[^0-9]/g, "").slice(0, 24)
    return digits ? `IR${digits}` : null
  })
  .refine((v) => v === null || /^IR\d{24}$/.test(v), {
    message: "شماره شبا باید بعد از IR دقیقاً ۲۴ رقم باشد",
  })

export const accountCreateSchema = z.object({
  name: requiredText(2, 80, "نام حساب"),
  bankKey: z.string().trim().min(1, "بانک را انتخاب کنید"),
  accountNumber: shebaSchema,
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
  productId: z.string().min(1, "کالا را انتخاب کنید"),
  quantity: quantitySchema,
  unitPrice: nonNegativeAmount,
})

/** کالا جدید به همراه قیمت — برای افزودن سریع در فاکتور */
export const productQuickCreateSchema = productCreateSchema.extend({
  unitPrice: nonNegativeAmount.optional().default(0),
})

// ───────────────────────── چک ─────────────────────────

/** کد ملی ایرانی — ارقام فارسی/لاتین پذیرفته می‌شود؛ خالی → null */
export const nationalIdSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null
    return toLatinDigits(v).replace(/[^\d]/g, "") || null
  })
  .refine((v) => v === null || /^\d{10}$/.test(v), {
    message: "کد ملی باید ۱۰ رقم باشد",
  })

export const checkInputSchema = z.object({
  // شناسهٔ چک قدیم — فقط در ویرایش فاکتور؛ باعث به‌روزرسانی درجا و حفظ پیوست‌ها می‌شود
  id: z.string().optional(),
  serial: optionalText(40),
  amount: positiveAmount,
  bankKey: z.string().trim().min(1, "بانک چک را انتخاب کنید"),
  dueDate: jalaliDaySchema,
  note: optionalText(200),
  // ── ثبت چک ──
  isRegistered: z.boolean().default(false),
  registeredName: optionalText(100),
  registeredNationalId: nationalIdSchema,
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

// ───────────────────────── تغییر وضعیت / ثبت چک ─────────────────────────

export const checkStatusSchema = z.object({
  /** تمایزدهندهٔ نوع PATCH — پیش‌فرض status */
  action: z.literal("status").default("status"),
  status: z.enum(["CASHED", "BOUNCED", "CANCELED", "PENDING"], {
    message: "وضعیت چک نامعتبر است",
  }),
  accountId: z.string().optional().nullable(),
  note: optionalText(200),
})

/** PATCH action=register — ثبت چک به نام (ما یا مشتری) */
export const checkRegisterSchema = z.object({
  action: z.literal("register"),
  isRegistered: z.boolean(),
  registeredName: optionalText(100),
  registeredNationalId: nationalIdSchema,
})

export const checkPatchSchema = z.union([checkRegisterSchema, checkStatusSchema])

// ───────────────────────── فیلترهای لیست ─────────────────────────

export const invoiceFilterSchema = z.object({
  type: z.enum(["PURCHASE", "SALE"]).optional(),
  personId: z.string().optional(),
  month: z.string().regex(/^\d{3,4}-\d{1,2}$/, "قالب ماه شمسی نامعتبر است").optional(),
  q: z.string().trim().max(100).optional(),
  /** فقط نسیه‌های بیش از ۳۰ روز */
  overdue: z.enum(["1"]).optional(),
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
  morningReminder: z.boolean().optional(),
  morningHour: z.coerce.number().int().min(5, "ساعت یادآوری از ۵ صبح").max(12, "ساعت یادآوری تا ۱۲ ظهر").optional(),
  telegramBackup: z.boolean().optional(),
  /** رمز بکاپ تلگرام — خالی یعنی بدون تغییر */
  backupPassword: z.string().trim().max(100).optional(),
})
