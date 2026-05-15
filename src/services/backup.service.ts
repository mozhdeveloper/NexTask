import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { BackupLog } from "@/types";
import { backupFileName, uid } from "@/lib/helpers";
import { nowISO } from "@/lib/dates";
import { logService } from "./log.service";

export const backupService = {
  list() {
    return useDataStore.getState().backups;
  },
  async run(onProgress?: (p: number) => void) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { backups, setBackups } = useDataStore.getState();
    const id = uid("bk");
    const fileName = backupFileName();
    const filePath = `D:\\OfficeSystemStorage\\backups\\${fileName}`;
    const log: BackupLog = {
      id,
      adminId: me.id,
      fileName,
      filePath,
      sizeBytes: 0,
      startedAt: nowISO(),
      completedAt: null,
      createdAt: nowISO(),
      status: "running",
    };
    setBackups([log, ...backups]);

    for (let i = 1; i <= 20; i++) {
      await new Promise((r) => setTimeout(r, 120));
      onProgress?.(i * 5);
    }

    const sizeBytes = 25_000_000 + Math.floor(Math.random() * 6_000_000);
    const completed: BackupLog = {
      ...log,
      sizeBytes,
      completedAt: nowISO(),
      status: "completed",
    };
    const cur = useDataStore.getState().backups;
    useDataStore.getState().setBackups(cur.map((b) => (b.id === id ? completed : b)));
    logService.append({
      userId: me.id,
      action: "backup.run",
      targetType: "backup",
      targetId: id,
    });
    return completed;
  },
};
