/**
 * انتقال صفحات (MO-07) — هر ناوبری، محتوای صفحه با یک fade + slide کوتاه ظاهر می‌شود.
 * template.tsx در هر تغییر مسیر دوباره mount می‌شود؛ پس انیمیشن دقیقاً روی «رفتن به صفحه بعد» اجرا می‌شود.
 * انیمیشن CSS است (نه framer-motion): transform/opacity با keyframes روی compositor اجرا می‌شود و
 * وقتی رشتهٔ اصلی مشغول رندر صفحهٔ تازه است، فریم نمی‌اندازد. reduced-motion در globals.css خاموشش می‌کند.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="hy-page-enter">{children}</div>
}
