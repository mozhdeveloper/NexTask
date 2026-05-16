import { useDataStore } from "@/store/dataStore";
import type { WorkSettings } from "@/types";

export const workSettingsService = {
  get(): WorkSettings {
    return useDataStore.getState().workSettings;
  },

  /** Returns true if the given YYYY-MM-DD is a working day (not a holiday, not a weekend if not configured). */
  isWorkingDay(dateStr: string): boolean {
    const ws = useDataStore.getState().workSettings;
    // Parse date at noon local to avoid DST shifts
    const date = new Date(dateStr + "T12:00:00");
    const dow = date.getDay(); // 0=Sun … 6=Sat
    if (!ws.workingDays.includes(dow)) return false;
    if (ws.holidays.some((h) => h.date === dateStr)) return false;
    return true;
  },

  isHoliday(dateStr: string): boolean {
    return useDataStore.getState().workSettings.holidays.some((h) => h.date === dateStr);
  },

  addHoliday(date: string, label: string) {
    const ws = useDataStore.getState().workSettings;
    if (ws.holidays.some((h) => h.date === date)) return; // already exists
    useDataStore.getState().setWorkSettings({
      ...ws,
      holidays: [...ws.holidays, { date, label }].sort((a, b) => a.date.localeCompare(b.date)),
    });
  },

  removeHoliday(date: string) {
    const ws = useDataStore.getState().workSettings;
    useDataStore.getState().setWorkSettings({
      ...ws,
      holidays: ws.holidays.filter((h) => h.date !== date),
    });
  },

  setWorkingDays(days: number[]) {
    const ws = useDataStore.getState().workSettings;
    useDataStore.getState().setWorkSettings({ ...ws, workingDays: days });
  },

  /** Count working days between two dates (inclusive). */
  countWorkingDays(from: Date, to: Date): number {
    let n = 0;
    const d = new Date(from);
    d.setHours(12, 0, 0, 0);
    const end = new Date(to);
    end.setHours(12, 0, 0, 0);
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      if (workSettingsService.isWorkingDay(iso)) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  },
};
