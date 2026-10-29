/**
 * رجیستری بانک‌های ایران — lib/banks.ts
 * لوگوی رسمی از پکیج iranianbanklogos (اسپریت PNG در /public/banks)
 * ترتیب اسپریت: ۵ ستونه — ایندکس → ردیف/ستون
 */

export interface BankInfo {
  key: string
  name: string // نام رسمی فارسی
  color: string // رنگ برند برای تمایز خودکار
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
  { key: "bmi", name: "بانک ملی ایران", color: "#20419A", logoIndex: idx("bmi") },
  { key: "mellat", name: "بانک ملت", color: "#C8102E", logoIndex: idx("mellat") },
  { key: "bsi", name: "بانک صادرات ایران", color: "#006341", logoIndex: idx("bsi") },
  { key: "tejarat", name: "بانک تجارت", color: "#007A3D", logoIndex: idx("tejarat") },
  { key: "sepah", name: "بانک سپه", color: "#5A6B2F", logoIndex: idx("sepah") },
  { key: "bki", name: "بانک کشاورزی", color: "#2E7D32", logoIndex: idx("bki") },
  { key: "maskan", name: "بانک مسکن", color: "#E67300", logoIndex: idx("maskan") },
  { key: "rb2", name: "بانک رفاه کارگران", color: "#005BBB", logoIndex: idx("rb2") },
  { key: "post", name: "پست بانک ایران", color: "#F37021", logoIndex: idx("post") },
  { key: "parsian", name: "بانک پارسیان", color: "#5B6770", logoIndex: idx("parsian") },
  { key: "bpi", name: "بانک پاسارگاد", color: "#D9A400", logoIndex: idx("bpi") },
  { key: "saman", name: "بانک سامان", color: "#0E5A8D", logoIndex: idx("sb") },
  { key: "en", name: "بانک اقتصاد نوین", color: "#009B77", logoIndex: idx("en") },
  { key: "ansar", name: "بانک انصار", color: "#00968F", logoIndex: idx("ansar") },
  { key: "sina", name: "بانک سینا", color: "#B01E24", logoIndex: idx("sina") },
  { key: "ghbi", name: "بانک قوامین", color: "#A6192E", logoIndex: idx("ghbi") },
  { key: "tt", name: "بانک توسعه تعاون", color: "#3B7A3F", logoIndex: idx("tt") },
  { key: "shahr", name: "بانک شهر", color: "#E30613", logoIndex: idx("shahr") },
  { key: "ayandeh", name: "بانک آینده", color: "#F58220", logoIndex: idx("ba") },
  { key: "day", name: "بانک دی", color: "#00A651", logoIndex: idx("day") },
  { key: "sarmayeh", name: "بانک سرمایه", color: "#1F4E79", logoIndex: idx("sarmayeh") },
  { key: "karafarin", name: "بانک کارآفرین", color: "#009BDB", logoIndex: idx("kar") },
  { key: "tourism", name: "بانک گردشگری", color: "#F0A500", logoIndex: idx("tourism") },
  { key: "edbi", name: "بانک توسعه صادرات", color: "#0C5A8C", logoIndex: idx("edbi") },
  { key: "sanat", name: "بانک صنعت و معدن", color: "#34558B", logoIndex: idx("bim") },
  { key: "iranZamin", name: "بانک ایران زمین", color: "#6D2C5B", logoIndex: idx("iz") },
  { key: "hekmat", name: "بانک حکمت ایرانیان", color: "#8A6D1A", logoIndex: idx("hi") },
  { key: "mehr", name: "بانک مهر ایران", color: "#E84E0F", logoIndex: idx("me") },
  { key: "resalat", name: "بانک رسالت", color: "#7B2D8B", logoIndex: idx("resalat") },
  { key: "miran", name: "بانک میران", color: "#2F4F7F", logoIndex: idx("miran") },
  { key: "melal", name: "بانک ملل", color: "#5B7C99", logoIndex: idx("melal") },
  { key: "ivbb", name: "بانک ایران و ونزوئلا", color: "#B34700", logoIndex: idx("ivbb") },
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
