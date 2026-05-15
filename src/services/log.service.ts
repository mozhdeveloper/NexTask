import { useDataStore } from "@/store/dataStore";
import type { ActivityLog } from "@/types";
import { nowISO } from "@/lib/dates";
import { pseudoIp, uid, userAgent } from "@/lib/helpers";

export const logService = {
  append(entry: Omit<ActivityLog, "id" | "ip" | "userAgent" | "createdAt">) {
    const log: ActivityLog = {
      id: uid("log"),
      ip: pseudoIp(entry.userId),
      userAgent: userAgent(),
      createdAt: nowISO(),
      ...entry,
    };
    const { logs, setLogs } = useDataStore.getState();
    setLogs([log, ...logs].slice(0, 1000));
    return log;
  },
  list() {
    return useDataStore.getState().logs;
  },
};
