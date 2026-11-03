/**
 * رجیستری بانک‌های ایران — lib/banks.ts
 * لوگوی رسمی از پکیج iranianbanklogos (اسپریت PNG در /public/banks)
 * ترتیب اسپریت: ۵ ستونه — ایندکس → ردیف/ستون
 */

export interface BankInfo {
  key: string
  name: string // نام رسمی فارسی
  color: string // رنگ غالب لوگوی رسمی (برای کارت و نوار رنگی)
  logoIndex: number // جایگاه در اسپریت
}

/** ترتیب اسپریت رسمی پکیج (۵ ستونه) */
const SPRITE_ORDER = [
  "bsi", "mellat", "tejarat", "bmi", "sepah",
  "bki", "parsian", "maskan", "rb", "en",
  "ansar", "bpi", "sb", "sina", "post",
  "ghbi", "tt", "shahr", "ba", "sarmayeh",
  "day", "hi", "iz", "kar", "tourism",
  "bim", "edbi", "me", "ivbb", "resalat",
  "miran", "melal", "rb2",
] as const

const idx = (k: string) => SPRITE_ORDER.indexOf(k as (typeof SPRITE_ORDER)[number])

export const BANKS: BankInfo[] = [
  { key: "bmi", name: "بانک ملی ایران", color: "#1f3f93", logoIndex: idx("bmi") },
  { key: "mellat", name: "بانک ملت", color: "#c8102e", logoIndex: idx("mellat") },
  { key: "bsi", name: "بانک صادرات ایران", color: "#22307f", logoIndex: idx("bsi") },
  { key: "tejarat", name: "بانک تجارت", color: "#2c4592", logoIndex: idx("tejarat") },
  { key: "sepah", name: "بانک سپه", color: "#1b78bd", logoIndex: idx("sepah") },
  { key: "bki", name: "بانک کشاورزی", color: "#0f8a47", logoIndex: idx("bki") },
  { key: "maskan", name: "بانک مسکن", color: "#e5622e", logoIndex: idx("maskan") },
  { key: "rb2", name: "بانک رفاه کارگران", color: "#03507f", logoIndex: idx("rb2") },
  { key: "post", name: "پست بانک ایران", color: "#00813c", logoIndex: idx("post") },
  { key: "parsian", name: "بانک پارسیان", color: "#a51520", logoIndex: idx("parsian") },
  { key: "bpi", name: "بانک پاسارگاد", color: "#c99a00", logoIndex: idx("bpi") },
  { key: "saman", name: "بانک سامان", color: "#0a8fd0", logoIndex: idx("sb") },
  { key: "en", name: "بانک اقتصاد نوین", color: "#721872", logoIndex: idx("en") },
  { key: "ansar", name: "بانک انصار", color: "#b8322f", logoIndex: idx("ansar") },
  { key: "sina", name: "بانک سینا", color: "#0e419b", logoIndex: idx("sina") },
  { key: "ghbi", name: "بانک قوامین", color: "#00994a", logoIndex: idx("ghbi") },
  { key: "tt", name: "بانک توسعه تعاون", color: "#03818b", logoIndex: idx("tt") },
  { key: "shahr", name: "بانک شهر", color: "#d40a0a", logoIndex: idx("shahr") },
  { key: "ayandeh", name: "بانک آینده", color: "#6b3a1f", logoIndex: idx("ba") },
  { key: "day", name: "بانک دی", color: "#037f8a", logoIndex: idx("day") },
  { key: "sarmayeh", name: "بانک سرمایه", color: "#02446f", logoIndex: idx("sarmayeh") },
  { key: "karafarin", name: "بانک کارآفرین", color: "#0d710d", logoIndex: idx("kar") },
  { key: "tourism", name: "بانک گردشگری", color: "#a8060f", logoIndex: idx("tourism") },
  { key: "edbi", name: "بانک توسعه صادرات", color: "#01690e", logoIndex: idx("edbi") },
  { key: "sanat", name: "بانک صنعت و معدن", color: "#143682", logoIndex: idx("bim") },
  { key: "iranZamin", name: "بانک ایران زمین", color: "#6f4a99", logoIndex: idx("iz") },
  { key: "hekmat", name: "بانک حکمت ایرانیان", color: "#0057ac", logoIndex: idx("hi") },
  { key: "mehr", name: "بانک مهر ایران", color: "#e5850a", logoIndex: idx("me") },
  { key: "resalat", name: "بانک رسالت", color: "#01909f", logoIndex: idx("resalat") },
  { key: "miran", name: "بانک میران", color: "#4f9a2a", logoIndex: idx("miran") },
  { key: "melal", name: "بانک ملل", color: "#074f9b", logoIndex: idx("melal") },
  { key: "ivbb", name: "بانک ایران و ونزوئلا", color: "#293292", logoIndex: idx("ivbb") },
  { key: "other", name: "سایر بانک‌ها", color: "#64748B", logoIndex: -1 },
]

export const BANK_MAP: Record<string, BankInfo> = Object.fromEntries(BANKS.map((b) => [b.key, b]))

/** نام‌های جایگزین رایج بانک‌ها → کلید اصلی رجیستری */
const ALIASES: Record<string, string> = {
  saderat: "bsi",
  melli: "bmi",
  bmi: "bmi",
  pasargad: "bpi",
  bpi: "bpi",
  sb: "saman",
  kar: "karafarin",
  ayandeh: "ayandeh",
  ba: "ayandeh",
  bim: "sanat",
  ivbb: "ivbb",
  mellat: "mellat",
  tejarat: "tejarat",
  sepah: "sepah",
  bki: "bki",
  maskan: "maskan",
  rb: "rb2",
  rb2: "rb2",
  en: "en",
  ansar: "ansar",
  sina: "sina",
  post: "post",
  ghbi: "ghbi",
  tt: "tt",
  shahr: "shahr",
  sarmayeh: "sarmayeh",
  day: "day",
  iz: "iranZamin",
  hi: "hekmat",
  me: "mehr",
  resalat: "resalat",
  miran: "miran",
  melal: "melal",
  edbi: "edbi",
  tourism: "tourism",
  ghavamin: "ghbi",
  saman: "saman",
}

export function getBank(key: string | null | undefined): BankInfo {
  if (!key) return BANK_MAP.other
  const normalized = ALIASES[key] ?? key
  return BANK_MAP[normalized] || BANK_MAP.other
}

/** کلید اسپریت → نام فایل لوگوی تکی در /public/banks/logos */
export function spriteKeyOf(bank: BankInfo): string {
  if (bank.logoIndex < 0) return "other"
  return SPRITE_ORDER[bank.logoIndex]
}

/** شش رقم اول کارت (BIN) → بانک صادرکننده */
const CARD_BINS: Record<string, string> = {
  "603799": "bmi", "610433": "mellat", "991975": "mellat", "603769": "bsi", "627353": "tejarat", "585983": "tejarat",
  "589210": "sepah", "603770": "bki", "639217": "bki", "628023": "maskan", "589463": "rb2", "627760": "post",
  "622106": "parsian", "639194": "parsian", "627884": "parsian", "502229": "bpi", "639347": "bpi", "621986": "saman",
  "627412": "en", "627381": "ansar", "639346": "sina", "639599": "ghbi", "502908": "tt", "502806": "shahr",
  "504706": "shahr", "636214": "ayandeh", "502938": "day", "639607": "sarmayeh", "627488": "karafarin",
  "502910": "karafarin", "505416": "tourism", "627648": "edbi", "207177": "edbi", "627961": "sanat",
  "505785": "iranZamin", "636949": "hekmat", "606373": "mehr", "504172": "resalat", "606256": "melal",
  "581874": "ivbb",
}

/** تشخیص بانک از شمارهٔ کارت (ارقام فارسی/لاتین، با فاصله یا خط تیره) */
export function bankFromCard(card: string | null | undefined): string | null {
  const d = (card ?? "")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/\D/g, "")
  return d.length >= 6 ? (CARD_BINS[d.slice(0, 6)] ?? null) : null
}
