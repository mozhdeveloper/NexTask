"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { notificationService } from "@/services/notification.service";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";
import type { Notification } from "@/types";

const TYPE_DOT: Record<string, string> = {
  info: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-danger",
};

const TYPE_BADGE: Record<string, string> = {
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-danger/10 text-danger",
};

type FilterType = "all" | "unread" | Notification["type"];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Alerts" },
];

export default function NotificationsPage() {
  const user = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");
  const notifications = useDataStore((s) => s.notifications);

  if (!user) return null;

  const mine = notifications
    .filter((n) => n.userId === user.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const filtered = mine.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "all") return true;
    return n.type === filter;
  });

  const unread = mine.filter((n) => !n.read).length;

  function handleClick(n: Notification) {
    notificationService.markRead(n.id);
    router.push(n.link ?? "/dashboard");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread notification${unread !== 1 ? "s" : ""}` : "All caught up!"}
        actions={
          <div className="flex gap-2">
            {unread > 0 && (
              <Button size="sm" variant="outline" onClick={() => notificationService.markAllRead(user.id)}>
                <Check className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            {mine.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => notificationService.clear(user.id)}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </Button>
            )}
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-white"
                : "border-surface-border bg-white text-ink-muted hover:border-primary/40 hover:text-ink"
            )}
          >
            {label}
            {value === "unread" && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{unread}</span>
            )}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle">
              <Bell className="h-6 w-6 text-ink-soft" />
            </div>
            <p className="font-semibold text-ink">No notifications</p>
            <p className="mt-1 text-sm text-ink-muted">
              {filter === "unread" ? "You're all caught up!" : "Nothing here yet."}
            </p>
          </CardContent>
        ) : (
          <ul className="divide-y divide-surface-border">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full px-4 py-4 text-left transition-colors hover:bg-surface-subtle sm:px-5",
                    !n.read && "bg-primary-soft/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TYPE_DOT[n.type] ?? "bg-ink-soft")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TYPE_BADGE[n.type])}>
                          {n.type}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-ink-soft">
                          {fmtDate(n.createdAt, "MMM dd, hh:mm a")}
                        </span>
                        {!n.read && (
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-1 font-medium text-ink">{n.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted leading-relaxed">{n.body}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
