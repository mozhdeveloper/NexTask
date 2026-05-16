"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDataStore } from "@/store/dataStore";
import { backupService } from "@/services/backup.service";
import { todayISO } from "@/lib/dates";

/** Runs in AppShell. When auto-backup is enabled, fires at the configured time once per day. */
export function useAutoBackup() {
  const autoBackupSettings = useDataStore((s) => s.autoBackupSettings);
  const setAutoBackupSettings = useDataStore((s) => s.setAutoBackupSettings);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!autoBackupSettings.enabled) return;

    const check = () => {
      const settings = useDataStore.getState().autoBackupSettings;
      if (!settings.enabled) return;

      const now = new Date();
      const [hh, mm] = settings.time.split(":").map(Number);
      const todayStr = todayISO();

      // Trigger if current hour:minute matches and we haven't backed up today
      if (
        now.getHours() === hh &&
        now.getMinutes() === mm &&
        settings.lastAutoBackupDate !== todayStr
      ) {
        setAutoBackupSettings({ ...settings, lastAutoBackupDate: todayStr });
        // Run backup silently
        backupService.run(() => {}).then(() => {
          toast.success(
            settings.email
              ? `Auto-backup complete. Send to ${settings.email}`
              : "Auto-backup complete.",
            { duration: 8000 }
          );
          if (settings.email) {
            // Open mailto: so user can send the backup file manually
            window.open(
              `mailto:${encodeURIComponent(settings.email)}?subject=${encodeURIComponent("NexTask Daily Backup – " + todayStr)}&body=${encodeURIComponent("Please find today's NexTask backup attached.\n\nBackup date: " + todayStr)}`,
              "_blank"
            );
          }
        });
      }
    };

    // Check every 30 seconds
    timerRef.current = setInterval(check, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoBackupSettings.enabled, autoBackupSettings.time, setAutoBackupSettings]);
}
