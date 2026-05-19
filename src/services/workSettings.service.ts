// Work settings service. Singleton `work_settings` row + holidays table.
// Pure helpers (isWorkingDay, countWorkingDays) read from the local cache and stay sync.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { WorkSettings } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { mapWorkSettings, mapAutoBackupSettings } from "@/lib/supabase/mappers";
import type { DbWorkSettingsRow, DbHolidayRow } from "@/lib/supabase/types";
import { logService } from "./log.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[workSettings:${label}]`, e);
}

function meId() {
  return useAuthStore.getState().user?.id ?? "system";
}

export const workSettingsService = {
  get(): WorkSettings {
    return useDataStore.getState().workSettings;
  },

  isWorkingDay(dateStr: string): boolean {
    const ws = useDataStore.getState().workSettings;
    const date = new Date(dateStr + "T12:00:00");
    const dow = date.getDay();
    if (!ws.workingDays.includes(dow)) return false;
    if (ws.holidays.some((h) => h.date === dateStr)) return false;
    return true;
  },

  /** True when current time-of-day is within the configured working window. */
  isWithinWorkHours(date: Date = new Date()): boolean {
    const ws = useDataStore.getState().workSettings;
    const [sh, sm] = (ws.workStartTime ?? "09:00").split(":").map(Number);
    const [eh, em] = (ws.workEndTime ?? "18:00").split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const now = date.getHours() * 60 + date.getMinutes();
    return now >= start && now <= end;
  },

  /** True if current time is past the work-end hour for the given (today's) date. */
  isPastWorkEnd(date: Date = new Date()): boolean {
    const ws = useDataStore.getState().workSettings;
    const [eh, em] = (ws.workEndTime ?? "18:00").split(":").map(Number);
    return date.getHours() * 60 + date.getMinutes() > eh * 60 + em;
  },

  setWorkHours(start: string, end: string) {
    const ws = useDataStore.getState().workSettings;
    useDataStore.getState().setWorkSettings({ ...ws, workStartTime: start, workEndTime: end });
    supabase
      .from("work_settings")
      .upsert({ id: true, work_start_time: start, work_end_time: end })
      .then(({ error }) => {
        if (error) warn("setWorkHours", error);
      });
    logService.append({
      userId: meId(),
      action: "settings.work_hours_update",
      targetType: "work_settings",
      targetId: null,
    });
  },

  isHoliday(dateStr: string): boolean {
    return useDataStore.getState().workSettings.holidays.some((h) => h.date === dateStr);
  },

  addHoliday(date: string, label: string) {
    const ws = useDataStore.getState().workSettings;
    if (ws.holidays.some((h) => h.date === date)) return;
    useDataStore.getState().setWorkSettings({
      ...ws,
      holidays: [...ws.holidays, { date, label }].sort((a, b) => a.date.localeCompare(b.date)),
    });
    supabase
      .from("holidays")
      .insert({ date, label })
      .then(({ error }) => {
        if (error) warn("addHoliday", error);
      });
    logService.append({
      userId: meId(),
      action: "settings.holiday_add",
      targetType: "holiday",
      targetId: date,
    });
  },

  removeHoliday(date: string) {
    const ws = useDataStore.getState().workSettings;
    useDataStore.getState().setWorkSettings({
      ...ws,
      holidays: ws.holidays.filter((h) => h.date !== date),
    });
    supabase
      .from("holidays")
      .delete()
      .eq("date", date)
      .then(({ error }) => {
        if (error) warn("removeHoliday", error);
      });
    logService.append({
      userId: meId(),
      action: "settings.holiday_remove",
      targetType: "holiday",
      targetId: date,
    });
  },

  setWorkingDays(days: number[]) {
    const ws = useDataStore.getState().workSettings;
    useDataStore.getState().setWorkSettings({ ...ws, workingDays: days });
    supabase
      .from("work_settings")
      .upsert({ id: true, working_days: days })
      .then(({ error }) => {
        if (error) warn("setWorkingDays", error);
      });
    logService.append({
      userId: meId(),
      action: "settings.working_days_update",
      targetType: "work_settings",
      targetId: null,
    });
  },

  setAutoBackup(
    patch: Partial<{ enabled: boolean; email: string; time: string; lastAutoBackupDate: string | null }>
  ) {
    const cur = useDataStore.getState().autoBackupSettings;
    const next = { ...cur, ...patch };
    useDataStore.getState().setAutoBackupSettings(next);

    const dbPatch: Record<string, unknown> = { id: true };
    if (patch.enabled !== undefined) dbPatch.auto_backup_enabled = patch.enabled;
    if (patch.email !== undefined) dbPatch.auto_backup_email = patch.email;
    if (patch.time !== undefined) dbPatch.auto_backup_time = patch.time;
    if (patch.lastAutoBackupDate !== undefined)
      dbPatch.last_auto_backup_date = patch.lastAutoBackupDate;

    supabase
      .from("work_settings")
      .upsert(dbPatch)
      .then(({ error }) => {
        if (error) warn("setAutoBackup", error);
      });
  },

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

  async refresh() {
    const [ws, hol] = await Promise.all([
      supabase.from("work_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("holidays").select("*").order("date"),
    ]);
    const wsRow = (ws.data ?? null) as DbWorkSettingsRow | null;
    const holRows = (hol.data ?? []) as DbHolidayRow[];
    useDataStore.getState().setWorkSettings(mapWorkSettings(wsRow, holRows));
    useDataStore.getState().setAutoBackupSettings(mapAutoBackupSettings(wsRow));
  },
};
