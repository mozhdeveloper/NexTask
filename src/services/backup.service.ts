// Backup service — delegates to /api/backups/run (server-side); refreshes cache after.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { BackupLog } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { mapBackupLog } from "@/lib/supabase/mappers";
import type { DbBackupLogRow } from "@/lib/supabase/types";
import { logService } from "./log.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[backup:${label}]`, e);
}

export const backupService = {
  list() {
    return useDataStore.getState().backups;
  },

  async run(onProgress?: (p: number) => void) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");

    // Indeterminate progress — real ZIP build can take 10-30s depending on
    // attachment count. We ease toward 90% then jump to 100 when the server
    // returns. No artificial sleep.
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(90, progress + 3);
      onProgress?.(progress);
    }, 400);

    try {
      const res = await fetch("/api/backups/run", { method: "POST" });
      clearInterval(interval);
      onProgress?.(100);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Backup failed");
      }
      const row = (await res.json()) as DbBackupLogRow;
      const completed = mapBackupLog(row);

      const { backups, setBackups } = useDataStore.getState();
      setBackups([completed, ...backups.filter((b) => b.id !== completed.id)]);

      logService.append({
        userId: me.id,
        action: "backup.run",
        targetType: "backup",
        targetId: completed.id,
      });
      return completed;
    } catch (e) {
      clearInterval(interval);
      throw e;
    }
  },

  async refresh() {
    const { data, error } = await supabase
      .from("backup_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped: BackupLog[] = (data ?? []).map((r) => mapBackupLog(r as DbBackupLogRow));
    useDataStore.getState().setBackups(mapped);
  },

  async sendByEmail(email: string, backupId?: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    const res = await fetch("/api/backups/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, backupId: backupId ?? null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error ?? "Failed to send backup email");
    }
    logService.append({
      userId: me.id,
      action: "backup.email",
      targetType: "backup",
      targetId: backupId ?? null,
    });
    return body as {
      ok: true;
      messageId: string | null;
      email: string;
      fileName: string;
      sizeBytes: number;
      attached: boolean;
      signedUrl: string | null;
    };
  },

  async download(backupId: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const res = await fetch(`/api/backups/download?id=${encodeURIComponent(backupId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? "Download failed");
    return body as { url: string; fileName: string };
  },
};
