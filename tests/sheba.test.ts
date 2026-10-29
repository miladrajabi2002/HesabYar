/**
 * تست رگرسیون شماره شبا — tests/sheba.test.ts
 * اجرا: npm test
 *
 * قواعد:
 *  - ورودی آزاد: ارقام فارسی/عربی/لاتین، با یا بدون IR، با فاصله/خط تیره
 *  - خروجی استاندارد: «IR + ۲۴ رقم لاتین» یا null
 *  - فیلد اختیاری است؛ نبودن کلید نباید مقدار قبلی را پاک کند
 */
import test from "node:test"
import assert from "node:assert/strict"

import { shebaSchema, accountCreateSchema, accountUpdateSchema } from "../src/lib/validation"

const SHEBA24 = "012345678901234567890123" // دقیقاً ۲۴ رقم
const SHEBA24_FA = "۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳"

test("شبا کامل با IR بدون تغییر ذخیره می‌شود", () => {
  assert.equal(shebaSchema.parse(`IR${SHEBA24}`), `IR${SHEBA24}`)
})

test("ارقام فارسی بدون IR → IR + ارقام لاتین", () => {
  assert.equal(shebaSchema.parse(SHEBA24_FA), `IR${SHEBA24}`)
})

test("ارقام فارسی با پیشوند IR → نرمال می‌شود", () => {
  assert.equal(shebaSchema.parse(`IR${SHEBA24_FA}`), `IR${SHEBA24}`)
})

test("حروف کوچک ir هم پذیرفته می‌شود", () => {
  assert.equal(shebaSchema.parse(`ir${SHEBA24}`), `IR${SHEBA24}`)
})

test("فاصله و خط تیره حذف می‌شود", () => {
  assert.equal(
    shebaSchema.parse(`IR ${SHEBA24.slice(0, 4)} ${SHEBA24.slice(4, 8)}-${SHEBA24.slice(8)}`),
    `IR${SHEBA24}`
  )
})

test("رشته خالی → null", () => {
  assert.equal(shebaSchema.parse(""), null)
})

test("null → null", () => {
  assert.equal(shebaSchema.parse(null), null)
})

test("فراخوانی مستقیم با undefined → null (مثل optionalText قبلی)", () => {
  // در سطح شیء، کلیدِ غایب اصلاً ساخته نمی‌شود (تست «ویرایش فقط بایگانی»)
  // و Prisma مقدار را دست نمی‌زند؛ اما فراخوانی مستقیم اسکیما با undefined
  // مثل optionalText قدیم → null است و مشکلی ایجاد نمی‌کند (JSON هرگز undefined ندارد)
  assert.equal(shebaSchema.parse(undefined), null)
})

test("۲۳ رقم رد می‌شود با پیام فارسی", () => {
  const r = shebaSchema.safeParse(SHEBA24.slice(0, 23))
  assert.equal(r.success, false)
  if (!r.success) {
    assert.equal(r.error.issues[0]?.message, "شماره شبا باید بعد از IR دقیقاً ۲۴ رقم باشد")
  }
})

test("بیش از ۲۴ رقم → به ۲۴ رقم بریده می‌شود", () => {
  assert.equal(shebaSchema.parse(`IR${SHEBA24}999`), `IR${SHEBA24}`)
})

test("ورودی طولانی بی‌معنا (بیش از ۶۰ کاراکتر) رد می‌شود", () => {
  assert.equal(shebaSchema.safeParse("x".repeat(80)).success, false)
})

test("«IR» تنها → null (معادل خالی)", () => {
  assert.equal(shebaSchema.parse("IR"), null)
})

test("ساخت حساب: شبا فارسی به شکل استاندارد می‌نشیند", () => {
  const acc = accountCreateSchema.parse({
    name: "جاری ملت",
    bankKey: "mellat",
    accountNumber: SHEBA24_FA,
    initialBalance: 0,
  })
  assert.equal(acc.accountNumber, `IR${SHEBA24}`)
})

test("ساخت حساب بدون شبا → فیلد خالی (null/undefined)", () => {
  const acc = accountCreateSchema.parse({ name: "جاری ملت", bankKey: "mellat", initialBalance: 0 })
  assert.ok(acc.accountNumber === null || acc.accountNumber === undefined)
})

test("ویرایش فقط بایگانی: شبا قبلی پاک نمی‌شود", () => {
  const data = accountUpdateSchema.parse({ isArchived: true })
  // undefined یعنی «تغییر نده» — null یعنی «پاک کن»
  // اگر zod روی undefined هم transform را اجرا کند، شبا ذخیره‌شده پاک می‌شد
  assert.notEqual(data.accountNumber, null)
})

test("ویرایش: خالی‌کردن شبا با رشته خالی ممکن است", () => {
  const data = accountUpdateSchema.parse({ accountNumber: "" })
  assert.equal(data.accountNumber, null)
})

test("ویرایش: شبا ۲۳ رقمی رد می‌شود", () => {
  const r = accountUpdateSchema.safeParse({ accountNumber: SHEBA24.slice(0, 23) })
  assert.equal(r.success, false)
})

test("ویرایش: شبا با IR تکراری یا ناقص نرمال می‌شود", () => {
  const data = accountUpdateSchema.parse({ accountNumber: `ir ${SHEBA24}` })
  assert.equal(data.accountNumber, `IR${SHEBA24}`)
})
