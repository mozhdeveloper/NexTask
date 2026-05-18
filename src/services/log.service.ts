// Activity log service — best-effort insert via /api/logs (server captures IP/UA).
// Logging never throws to the caller.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { ActivityLog } from "@/types";
import { nowISO } from "@/lib/dates";
import { pseudoIp, uid, userAgent } from "@/lib/helpers";
import { supabase } from "@/lib/supabase/client";

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

    const meId = useAuthStore.getState().user?.id ?? entry.userId ?? null;
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: meId,
        action: log.action,
        target_type: log.targetType ?? null,
        target_id: log.targetId ?? null,
        user_agent: log.userAgent ?? null,
      }),
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[log] insert failed", e);
    });

    return log;
  },

  list() {
    return useDataStore.getState().logs;
  },

  async refresh() {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[log] refresh failed", error);
      return;
    }
    const mapped: ActivityLog[] = (data ?? []).map((r) => ({
      id: r.id as string,
      userId: (r.user_id as string | null) ?? "",
      action: r.action as string,
      targetType: (r.target_type as string | null) ?? undefined,
      targetId: (r.target_id as string | null) ?? null,
      ip: (r.ip as string | null) ?? undefined,
      userAgent: (r.user_agent as string | null) ?? undefined,
      createdAt: r.created_at as string,
    }));
    useDataStore.getState().setLogs(mapped);
  },
};
