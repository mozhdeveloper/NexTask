// Push subscription service — registers the browser with Supabase + Web Push.

import { supabase } from "@/lib/supabase/client";
import { isPushSupported, urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from "@/lib/push";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[push:${label}]`, e);
}

function subscriptionToRow(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
}

export const pushService = {
  isSupported: isPushSupported,

  /** Current notification permission (or 'unsupported'). */
  permission(): NotificationPermission | "unsupported" {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  },

  /** Active subscription for the current device, or null. */
  async getSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  },

  /**
   * Request permission, subscribe, and upsert the subscription for `userId`.
   * Returns the subscription or null on failure.
   */
  async subscribe(userId: string): Promise<PushSubscription | null> {
    if (!isPushSupported()) {
      warn("subscribe", "push not supported");
      return null;
    }
    if (!VAPID_PUBLIC_KEY) {
      warn("subscribe", "missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      return null;
    }

    // 1. Permission
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      warn("subscribe", `permission ${perm}`);
      return null;
    }

    // 2. Subscribe
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // 3. Persist
    const row = subscriptionToRow(sub);
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        user_agent: row.user_agent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) warn("subscribe:upsert", error);

    return sub;
  },

  /** Cancel the device subscription and remove it from Supabase. */
  async unsubscribe(): Promise<boolean> {
    if (!isPushSupported()) return false;
    const sub = await this.getSubscription();
    if (!sub) return true;

    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch (e) {
      warn("unsubscribe:browser", e);
    }
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) warn("unsubscribe:db", error);
    return !error;
  },

  /** Trigger a server-side push to one or many users (admin/system use). */
  async sendTo(opts: {
    userIds: string[];
    title: string;
    body?: string;
    url?: string;
    tag?: string;
  }): Promise<{ sent: number; failed: number }> {
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        warn("sendTo", await res.text());
        return { sent: 0, failed: opts.userIds.length };
      }
      return (await res.json()) as { sent: number; failed: number };
    } catch (e) {
      warn("sendTo", e);
      return { sent: 0, failed: opts.userIds.length };
    }
  },
};
