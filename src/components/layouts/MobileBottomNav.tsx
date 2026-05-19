"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  FileText,
  Settings,
  Users,
  FolderKanban,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Item = { label: string; href: string; icon: LucideIcon };

const ITEMS_BY_ROLE: Record<string, Item[]> = {
  admin: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Employees", href: "/admin/employees", icon: Users },
    { label: "Submissions", href: "/admin/submissions", icon: FileText },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  manager: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Employees", href: "/manager/employees", icon: Users },
    { label: "Submissions", href: "/manager/submissions", icon: FileText },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  employee: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "My Work", href: "/my-work", icon: ClipboardList },
    { label: "Submissions", href: "/my-submissions", icon: FileText },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Profile", href: "/profile", icon: Settings },
  ],
};

/**
 * Native-feeling bottom navigation for phones / installed PWA.
 * Hidden at `lg+` where the sidebar takes over.
 */
export function MobileBottomNav() {
  const user = useAuth();
  const pathname = usePathname();
  if (!user) return null;
  const items = ITEMS_BY_ROLE[user.role] ?? ITEMS_BY_ROLE.employee;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-ink-soft hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-10 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary-soft",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate leading-none">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
