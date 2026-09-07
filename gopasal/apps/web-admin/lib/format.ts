/** Nepali Rupee + date/number formatting for the admin console. */
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function rs(amount: number): string {
  return `रु ${nf.format(Math.round(amount))}`;
}

export function rsPlain(amount: number): string {
  return `Rs. ${nf.format(Math.round(amount))}`;
}

/** Compact currency for KPI tiles: रु 1.2L / रु 3.4Cr (Nepali/Indian scale). */
export function rsCompact(amount: number): string {
  const a = Math.round(amount);
  if (a >= 1_00_00_000) return `रु ${nf2.format(a / 1_00_00_000)}Cr`;
  if (a >= 1_00_000) return `रु ${nf2.format(a / 1_00_000)}L`;
  if (a >= 1_000) return `रु ${nf2.format(a / 1_000)}K`;
  return `रु ${nf.format(a)}`;
}

export function num(n: number): string {
  return nf.format(n);
}

export function pct(n: number): string {
  return `${nf2.format(n)}%`;
}

/** Compact relative time ("3m ago", "2h ago", "4d ago"). */
export function ago(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Nepal phone stored as 98XXXXXXXX → +977 98XX-XXXXXX for display. */
export function phone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+977 ${d.slice(0, 4)}-${d.slice(4)}`;
  return p;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
