import { cx } from "@/lib/cx";

/** Brand mark: a leaf in a rounded square. */
export function Logo({ size = "md", tone = "dark", withText = true, subtitle }: { size?: "sm" | "md" | "lg"; tone?: "dark" | "light"; withText?: boolean; subtitle?: string }) {
  const box = { sm: "h-8 w-8 rounded-[10px]", md: "h-9 w-9 rounded-xl", lg: "h-11 w-11 rounded-2xl" }[size];
  const icon = { sm: 16, md: 18, lg: 22 }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cx("flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md ring-1 ring-inset ring-white/15", box)}>
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 19c0-8 5.5-13 15-14-.5 9.5-6 15-14 15" fill="currentColor" fillOpacity=".95" />
          <path d="M5 19c3-4 6-6.5 10-9" stroke="#0f402b" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {withText && (
        <span className="leading-tight">
          <span className={cx("block font-display font-semibold", size === "lg" ? "text-2xl" : "text-xl", tone === "light" ? "text-white" : "text-slate-900")}>GreenBite</span>
          {subtitle && <span className={cx("block text-[10.5px] font-semibold uppercase tracking-[0.14em]", tone === "light" ? "text-brand-300" : "text-brand-700")}>{subtitle}</span>}
        </span>
      )}
    </span>
  );
}

/** The official Indian vegetarian symbol: a green dot inside a green square. */
export function VegMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-green-700 bg-white", className)} title="Pure vegetarian" aria-label="Vegetarian">
      <span className="h-[45%] w-[45%] rounded-full bg-green-700" />
    </span>
  );
}

/**
 * Hand-checked, vegetarian-only food photography (Unsplash) used for hero art and
 * for hotels / dishes that haven't uploaded their own photo yet.
 */
export const VEG_PHOTOS = [
  "1606491956689-2ea866880c84", // pav bhaji
  "1668236543090-82eba5ee5976", // masala dosa thali
  "1567188040759-fb8a883dc6d8", // paneer tikka
  "1601050690597-df0568f70950", // samosa
  "1589301760014-d929f3979dbc", // idli on banana leaf
  "1630383249896-424e482df921", // idli vada sambar
  "1512621776951-a57141f2eefd", // salad bowl
  "1610192244261-3f33de3f55e4", // chaat
  "1626132647523-66f5bf380027", // misal pav
];

export const photoUrl = (id: string, w = 800, h?: number) =>
  `https://images.unsplash.com/photo-${id}?w=${w}${h ? `&h=${h}` : ""}&q=70&auto=format&fit=crop`;

const CUISINE_PHOTOS: [RegExp, string[]][] = [
  [/south|udupi|dosa|idli|kerala|tamil|andhra|breakfast/i, ["1668236543090-82eba5ee5976", "1589301760014-d929f3979dbc", "1630383249896-424e482df921"]],
  [/street|chaat|mumbai|pav|snack/i, ["1606491956689-2ea866880c84", "1610192244261-3f33de3f55e4", "1626132647523-66f5bf380027", "1601050690597-df0568f70950"]],
  [/north|punjabi|tandoor|paneer|thali|mughlai|gujarati|rajasthani|jain/i, ["1567188040759-fb8a883dc6d8", "1601050690597-df0568f70950"]],
  [/healthy|salad|vegan|bowl|continental/i, ["1512621776951-a57141f2eefd"]],
];

/**
 * Stable fallback photo for a hotel that hasn't uploaded its own: matched to its cuisines
 * when possible (a South Indian place gets dosa/idli), and always the same for the same hotel.
 */
export function fallbackPhoto(seed: string, w = 800, h?: number, cuisines: string[] = []) {
  let n = 0;
  for (const c of seed) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  const text = cuisines.join(" ");
  const pool = (text && CUISINE_PHOTOS.find(([rx]) => rx.test(text))?.[1]) || VEG_PHOTOS;
  return photoUrl(pool[n % pool.length], w, h);
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-semibold text-brand-800 ring-1 ring-inset ring-brand-300/40", className ?? "h-9 w-9 text-sm")}>
      {initials || "?"}
    </span>
  );
}
