const APP_TIME_ZONE = "Europe/Stockholm";

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function todayISO() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function tomorrowISO() {
  const date = new Date(`${todayISO()}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isPastDate(value: string | null | undefined) {
  return isIsoDate(value) && value < todayISO();
}

export function normalizeSearchDate(value: string | null | undefined) {
  return isIsoDate(value) && !isPastDate(value) ? value : todayISO();
}
