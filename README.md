# 🌿 حساب‌یار — اپلیکیشن حسابداری شخصی

حساب‌یار یک اپلیکیشن کامل حسابداری شخصی فارسی است که شامل سه بخش یکپارچه در یک کدبیس واحد است:

- **وب‌اپلیکیشن کامل** — داشبورد مالی، مدیریت حساب‌ها، تراکنش‌ها، بودجه، بدهی/طلب و گزارش‌ها
- **Telegram Mini App** — همان وب‌اپ با اعتبارسنجی امن `initData` داخل تلگرام
- **ربات تلگرام** — ارسال هشدارها و اعلان‌های مالی (بودجه، موجودی کم، سررسید بدهی، تکرارشونده)

> همه مبالغ **تومان با ارقام فارسی** و همه تاریخ‌ها **شمسی** هستند. داده‌ها در **SQLite** محلی ذخیره می‌شوند و پس از ری‌استارت کاملاً حفظ هستند.

---

## 🧰 پیش‌نیازها

| ابزار | نسخه |
|---|---|
| Node.js | ۲۰ یا بالاتر (پیشنهادی ۲۲ LTS) |
| npm | همراه Node |

هیچ دیتابیس سروری، Redis یا Docker لازم نیست — فقط `npm install && npm run dev`.

---

## 🚀 نصب و اجرا

```bash
# ۱) نصب وابستگی‌ها
npm install

# ۲) ساخت فایل تنظیمات از نمونه
cp .env.example .env
# مقادیر .env را ویرایش کنید (رمز ورود، SESSION_SECRET و…)

# ۳) ساخت دیتابیس (prisma/dev.db)
npm run db:push

# ۴) اجرا در حالت توسعه
npm run dev
# → http://localhost:3000

# اجرای production
npm run build
npm start
```

### داده نمونه (اختیاری)

```bash
npm run seed
```

۲ حساب، ۸ دسته، ~۵۵ تراکنش سه ماه اخیر، ۲ بودجه، ۱ قاعده تکرارشونده و ۱ بدهی/طلب **با برچسب «نمونه»** می‌سازد.
⚠️ seed فقط روی **دیتابیس خالی** اجرا می‌شود و هرگز به‌صورت خودکار در جریان اپ تزریق نمی‌شود.

### تست‌ها

```bash
npm run test
```

تست‌های `money` (ارقام فارسی)، `jalali` (تقویم شمسی)، `auth` (توکن نشست + initData تلگرام) و `finance` (فرمول موجودی).

---

## 🤖 راه‌اندازی ربات تلگرام از BotFather

1. در تلگرام به [@BotFather](https://t.me/BotFather) بروید و `/newbot` بزنید
2. نام و یوزرنیم ربات را انتخاب کنید → **توکن** را دریافت کنید (شکل `123456:ABC-DEF…`)
3. **شناسه عددی خود** را از [@userinfobot](https://t.me/userinfobot) بگیرید
4. توکن و شناسه را در یکی از این دو محل وارد کنید:
   - فایل `.env` → `BOT_TOKEN` و `ADMIN_CHAT_ID`
   - یا صفحه **تنظیمات** داخل اپ (اولویت با همین است)
5. آدرس مینی‌اپ (https) را در `MINI_APP_URL` یا صفحه تنظیمات بگذارید، مثلاً `https://hesabyar.miladrajabi.com`
6. یک‌بار سرویس را ری‌استارت کنید تا polling فعال شود

### فعال‌سازی دکمه مینی‌اپ روی ربات

پس از بالا آمدن دامنه با SSL، این دستور را اجرا کنید تا دکمه «حساب‌یار» در منوی ربات ثبت شود:

```bash
curl -s "https://api.telegram.org/bot<توکن>/setChatMenuButton" \
  -H "content-type: application/json" \
  -d '{"menu_button": {"type": "web_app", "text": "حساب‌یار", "web_app": {"url": "https://hesabyar.miladrajabi.com"}}}'
```

راه دستی: در BotFather → `/mybots` → ربات → **Bot Settings** → **Menu Button** → آدرس مینی‌اپ را وارد کنید.

سپس در تلگرام به ربات `/start` بدهید و دکمه «باز کردن حساب‌یار» را بزنید.

---

## 🖥 استقرار روی سرور (Ubuntu + nginx + pm2)

نمونه واقعی: `hesabyar.miladrajabi.com`

```bash
# در پوشه پروژه روی سرور
cd /var/www/miladrajabi.com/bot/hesabyar

npm install
cp .env.example .env      # مقادیر واقعی را بگذارید (پورت و دامنه)
npm run db:push
npm run build

# اجرای دائمی با pm2 روی پورت ۳۱۰۰
PORT=3100 pm2 start npm --name hesabyar -- start
pm2 save

# کانفیگ nginx (ساب‌دامین + SSL)
sudo tee /etc/nginx/sites-available/hesabyar.miladrajabi.com << 'NGINX'
server {
    listen 80;
    server_name hesabyar.miladrajabi.com;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/hesabyar.miladrajabi.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# گواهی SSL رایگان
sudo certbot --nginx -d hesabyar.miladrajabi.com
```

⚠️ نکته nginx: هدر `X-Frame-Options` عمداً ست نمی‌شود تا مینی‌اپ داخل iframe تلگرام باز شود.

### دستورات راهنمای pm2

```bash
pm2 logs hesabyar       # مشاهده لاگ
pm2 restart hesabyar    # ری‌استارت (بعد از تغییر توکن ربات لازم است)
pm2 status              # وضعیت
pm2 monit               # مانیتور زنده
```

### بکاپ

- **دستی**: صفحه تنظیمات → «دانلود بکاپ» (فایل با تاریخ شمسی)
- **خودکار**: روزانه ۰۳:۳۰ در پوشه `backups/` با نگهداری ۷ نسخه
- **بازیابی**: صفحه تنظیمات → «بازیابی از فایل» (قبل از جایگزینی، بکاپ خودکار می‌گیرد)

---

## 📁 ساختار پروژه

```
├── prisma/                  # schema.prisma (۹ مدل)، seed.ts، dev.db
├── src/
│   ├── app/
│   │   ├── (app)/           # صفحات محافظت‌شده: داشبورد، تراکنش‌ها، حساب‌ها،
│   │   │                    # بودجه، تکرارشونده، بدهی، گزارش، تنظیمات
│   │   ├── login/           # ورود تک‌کاربره
│   │   └── api/             # ۲۵+ مسیر API (Zod + احراز هویت)
│   ├── components/          # FarsiUI سفارشی + کامپوننت‌های برنامه
│   ├── lib/
│   │   ├── db.ts            # Prisma singleton
│   │   ├── finance.ts       # getAccountBalances و خلاصه‌ها (Aggregate)
│   │   ├── jalali.ts        # تبدیل/گروه‌بندی شمسی (UTC+3:30 ثابت)
│   │   ├── money.ts         # formatToman و ارقام فارسی
│   │   ├── validation.ts    # اسکیماهای Zod
│   │   ├── auth.ts          # کوکی نشست HMAC
│   │   ├── recurring.ts     # catch-up تکرارشونده‌ها
│   │   ├── backup.ts        # بکاپ/بازیابی SQLite
│   │   ├── scheduler.ts     # node-cron (هر ۵ دقیقه + بکاپ روزانه)
│   │   └── telegram/        # bot (polling)، validateInitData، alerts
│   └── instrumentation.ts   # فعال‌سازی زمان‌بند و ربات
├── tests/                   # تست‌های node:test
└── backups/                 # بکاپ خودکار (۷ نسخه)
```

## 🔌 APIها (خلاصه)

| مسیر | متدها | توضیح |
|---|---|---|
| `/api/auth/*` | POST | ورود/خروج/بررسی نشست |
| `/api/accounts` | GET, POST | لیست با موجودی زنده / ایجاد |
| `/api/accounts/[id]` | PATCH, DELETE | ویرایش / حذف امن (جابه‌جایی یا پاک‌سازی تراکنش‌ها) |
| `/api/categories` | GET, POST | لیست / ایجاد |
| `/api/transactions` | GET, POST | فیلتر شمسی (monthJalali)، جست‌وجو، صفحه‌بندی / ثبت |
| `/api/transfers` | POST | انتقال بین دو حساب (یک رکورد TRANSFER) |
| `/api/budgets` | GET, POST | بودجه ماه شمسی با درصد مصرف |
| `/api/recurring` + `/run` | GET/POST/PATCH/DELETE | قواعد تکرارشونده + اجرای دستی |
| `/api/debts` + `/settle` | CRUD + POST | بدهی/طلب + تسویه با تراکنش واقعی |
| `/api/dashboard` | GET | کل داده داشبورد در یک پاسخ |
| `/api/reports/summary` | GET | خلاصه بازه + مقایسه دوره قبل |
| `/api/alerts`، `/api/settings` | CRUD | هشدارها و تنظیمات (توکن ماسک می‌شود) |
| `/api/backup`، `/api/backup/restore` | GET, POST | دانلود / بازیابی بکاپ |
| `/api/telegram/test` | POST | پیام آزمایشی ربات |

## 🔐 امنیت

- اعتبارسنجی **Zod** روی همه ورودی‌ها → خطای ۴۰۰ فارسی
- نشست وب با کوکی **HttpOnly + HMAC** و مقایسه زمان-ثابت
- مینی‌اپ: `initData` دقیقاً طبق مستندات تلگرام (HMAC-SHA256 دو مرحله‌ای + `timingSafeEqual` + انقضای ۲۴ ساعت) → hash جعلی = **401**
- توکن ربات و chatId هرگز خام به کلاینت ارسال نمی‌شوند (ماسک `1234…ABCD`)
- Rate limit در حافظه برای ورود، بکاپ/بازیابی، تست تلگرام و وبهوک
- فقط Prisma Client — بدون SQL خام

## 🛠 پشته فناوری

Next.js 16 (App Router) + TypeScript strict • Tailwind CSS 4 + **FarsiUI** • SQLite + Prisma • Framer Motion • Recharts • jalaali-js • Zod • grammY (polling) • node-cron • Vazirmatn

## 📝 نکته درباره FarsiUI

کامپوننت‌های [FarsiUI](https://github.com/MiladJoodi/FarsiUI) (دکمه، Input، Dialog، Drawer، Select، Switch، Tabs، PriceInput با حروف‌نویسی فارسی، Empty و…) واقعاً از رجیستری رسمی `npx farsiui add` نصب و با توکن‌های رنگی برند (سبز-تیل `#0E7C66`، گوشه ۱۲/۱۶/۲۴ پیکسل) سفارشی‌سازی شده‌اند.

---

ساخته‌شده با ❤️ — «حساب‌یار»
