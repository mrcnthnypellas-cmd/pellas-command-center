export function formatCurrency(amount: number, currency = "PHP"): string {
  const symbol = currency === "PHP" ? "₱" : currency + " ";
  return symbol + amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const inD = new Date(checkIn + "T00:00:00");
  const outD = new Date(checkOut + "T00:00:00");
  const ms = outD.getTime() - inD.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
