"use client";

import { useCallback, useEffect, useState } from "react";
import { pushService } from "@/services/push.service";
import { isPushSupported } from "@/lib/push";

type PermissionState = NotificationPermission | "unsupported";

export function usePushNotifications(userId?: string | null) {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    pushService.getSubscription().then((s) => setSubscribed(!!s));
  }, []);

  const enable = useCallback(async () => {
    if (!userId || busy) return false;
    setBusy(true);
    try {
      const sub = await pushService.subscribe(userId);
      const ok = !!sub;
      setSubscribed(ok);
      setPermission(Notification.permission);
      return ok;
    } finally {
      setBusy(false);
    }
  }, [userId, busy]);

  const disable = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    try {
      const ok = await pushService.unsubscribe();
      if (ok) setSubscribed(false);
      return ok;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    supported: permission !== "unsupported",
    permission,
    subscribed,
    busy,
    enable,
    disable,
  };
}
