// Notification service — Supabase-backed with optimistic cache updates.

import { useDataStore } from "@/store/dataStore";
import type { Notification } from "@/types";
import { nowISO } from "@/lib/dates";
import { uid } from "@/lib/helpers";
import { supabase } from "@/lib/supabase/client";
import { mapNotification } from "@/lib/supabase/mappers";
import type { DbNotificationRow } from "@/lib/supabase/types";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[notifications:${label}]`, e);
}

export const notificationService = {
  list(userId: string) {
    return useDataStore
      .getState()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  unreadCount(userId: string) {
    return useDataStore
      .getState()
      .notifications.filter((n) => n.userId === userId && !n.read).length;
  },

  push(n: Omit<Notification, "id" | "createdAt" | "read">) {
    const item: Notification = { id: uid("ntf"), createdAt: nowISO(), read: false, ...n };
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications([item, ...notifications]);

    supabase
      .from("notifications")
      .insert({
        id: item.id,
        user_id: item.userId,
        type: item.type,
        title: item.title,
        body: item.body,
        link: item.link ?? null,
        read: false,
        created_at: item.createdAt,
      })
      .then(({ error }) => {
        if (error) warn("push", error);
      });

    // Fire-and-forget Web Push to the recipient's registered devices.
    // Fails silently if VAPID is unconfigured or the user has no subscription.
    fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: [item.userId],
        title: item.title,
        body: item.body,
        url: item.link ?? "/dashboard",
        tag: `ntf-${item.type}`,
      }),
    }).catch(() => {
      /* push is best-effort; ignore network errors */
    });

    return item;
  },

  markRead(id: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
    supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .then(({ error }) => {
        if (error) warn("markRead", error);
      });
  },

  markAllRead(userId: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)));
    supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false)
      .then(({ error }) => {
        if (error) warn("markAllRead", error);
      });
  },

  clear(userId: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(notifications.filter((n) => n.userId !== userId));
    supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) warn("clear", error);
      });
  },

  async refresh(userId: string) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped = (data ?? []).map((r) => mapNotification(r as DbNotificationRow));
    const { notifications, setNotifications } = useDataStore.getState();
    const others = notifications.filter((n) => n.userId !== userId);
    setNotifications([...mapped, ...others]);
  },
};
