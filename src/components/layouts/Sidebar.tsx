"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { NAV_BY_ROLE } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/services/auth.service";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  employee: "Employee",
};

export function Sidebar({
  collapsed = false,
  onClose,
}: {
  collapsed?: boolean;
  onClose?: () => void;
}) {
  const user = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role];

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-surface-border bg-white",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 flex-shrink-0 items-center border-b border-surface-border",
          collapsed ? "justify-center" : "gap-2 px-4"
        )}
      >
        {collapsed ? (
          <Logo size={28} className="!gap-0 [&>span]:hidden" />
        ) : (
          <Logo size={28} />
        )}
        {!collapsed && onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-ink-muted hover:bg-surface-subtle lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <ul className="space-y-0.5">
          {items.map((it) => {
            const active =
              pathname === it.href || pathname.startsWith(it.href + "/");
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => onClose?.()}
                  title={collapsed ? it.label : undefined}
                  className={cn(
                    "group relative flex items-center rounded-lg text-sm font-medium transition-colors",
                    collapsed
                      ? "mx-auto h-10 w-10 justify-center"
                      : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  )}
                >
                  {/* Active left border */}
                  {active && !collapsed && (
                    <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0 transition-colors",
                      active
                        ? "text-primary"
                        : "text-ink-soft group-hover:text-ink"
                    )}
                  />
                  {!collapsed && (
                    <span className="truncate">{it.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: user card + logout */}
      <div className="flex-shrink-0 border-t border-surface-border">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className={user.avatarColor ?? "bg-surface-subtle"}>
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold leading-tight text-ink">
                {user.name}
              </p>
              <p className="text-[10px] text-ink-muted">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
            </div>
          </div>
        )}
        <div className="px-2 pb-3">
          <button
            onClick={() => {
              authService.logout();
              router.replace("/login");
            }}
            title="Logout"
            className={cn(
              "flex w-full items-center rounded-lg text-sm font-medium text-ink-muted",
              "transition-colors hover:bg-danger-soft hover:text-danger",
              collapsed ? "mx-auto h-10 w-10 justify-center" : "gap-3 px-3 py-2"
            )}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}