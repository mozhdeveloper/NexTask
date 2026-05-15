import { useDataStore } from "@/store/dataStore";
import type { Notification } from "@/types";
import { nowISO } from "@/lib/dates";
import { uid } from "@/lib/helpers";

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
    return item;
  },
  markRead(id: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
  },
  markAllRead(userId: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(
      notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n))
    );
  },
  clear(userId: string) {
    const { notifications, setNotifications } = useDataStore.getState();
    setNotifications(notifications.filter((n) => n.userId !== userId));
  },
};
