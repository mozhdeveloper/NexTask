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
        "flex h-screen flex-col border-r border-surface-border bg-white transition-[width]",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <Logo size={32} className="!gap-0 [&>span]:hidden" />
        ) : (
          <Logo />
        )}
        {/* Close button on mobile */}
        {!collapsed && onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-ink-muted hover:bg-surface-subtle lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 scrollbar-thin">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => onClose?.()}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-ink hover:bg-surface-subtle"
              )}
              title={collapsed ? it.label : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-primary" : "text-ink-muted group-hover:text-ink"
                )}
              />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-surface-border p-2">
        <button
          onClick={() => {
            authService.logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-surface-subtle"
          title="Logout"
        >
          <LogOut className="h-4 w-4 text-ink-muted" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
}
