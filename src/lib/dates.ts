import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isAfter,
  startOfMonth,
  endOfMonth,
  differenceInDays,
} from "date-fns";

export const todayISO = () => format(new Date(), "yyyy-MM-dd");
export const nowISO = () => new Date().toISOString();

export function fmtDate(iso: string | Date, pattern = "MMM dd, yyyy") {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  return format(d, pattern);
}

export function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return format(parseISO(iso), "hh:mm a");
}

export function fmtBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function weekDays(date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function monthDays(date = new Date()) {
  return eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
}

export function isPastDeadline(deadline: string, date = new Date()) {
  const [h, m] = deadline.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return isAfter(new Date(), d);
}

export { isSameDay, parseISO, format, differenceInDays };
