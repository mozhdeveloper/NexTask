"use client";
import { Bell, ChevronDown, Menu, LogOut, User as UserIcon, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { useAuth } from "@/hooks/useAuth";
import { initials } from "@/lib/status";
import { authService } from "@/services/auth.service";
import { useDataStore } from "@/store/dataStore";
import { notificationService } from "@/services/notification.service";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const user = useAuth();
  const router = useRouter();
  // subscribe to notifications for live updates
  const notifications = useDataStore((s) => s.notifications);
  if (!user) return null;
  const myNotifs = notifications
    .filter((n) => n.userId === user.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const unread = myNotifs.filter((n) => !n.read).length;

  const roleLabel = user.role === "admin" ? "Administrator" : user.role === "manager" ? "Manager" : "Employee";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-surface-border bg-white px-4 md:px-6">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-ink hover:bg-surface-subtle"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative rounded-full p-2 hover:bg-surface-subtle" aria-label="Notifications">
              <Bell className="h-5 w-5 text-ink" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-1rem)] max-w-sm p-0 sm:w-80">
            <div className="flex items-center justify-between border-b border-surface-border p-3">
              <div className="text-sm font-semibold">Notifications</div>
              {myNotifs.length > 0 && (
                <button
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => notificationService.markAllRead(user.id)}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {myNotifs.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-muted">No notifications</div>
              ) : (
                myNotifs.slice(0, 10).map((n) => (
                  <Link
                    key={n.id}
                    href={n.link ?? "#"}
                    onClick={() => notificationService.markRead(n.id)}
                    className={cn(
                      "block border-b border-surface-border px-3 py-3 text-sm last:border-b-0 hover:bg-surface-subtle",
                      !n.read && "bg-primary-soft/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-ink">{n.title}</div>
                      {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <div className="text-xs text-ink-muted">{n.body}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-soft">
                      {fmtDate(n.createdAt, "MMM dd, hh:mm a")}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-surface-subtle">
              <Avatar>
                <AvatarFallback className={user.avatarColor}>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden flex-col text-left md:flex">
                <span className="text-sm font-semibold leading-tight text-ink">{user.name}</span>
                <span className="text-xs text-ink-muted leading-tight">{roleLabel}</span>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-ink-muted md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <UserIcon className="h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <SettingsIcon className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger
              onClick={() => {
                authService.logout();
                router.replace("/login");
              }}
            >
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
