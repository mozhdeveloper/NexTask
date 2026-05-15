import type { Role } from "@/lib/constants";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  CalendarDays,
  BarChart3,
  User as UserIcon,
  Settings,
  Users,
  ShieldCheck,
  FolderKanban,
  ScrollText,
  HardDrive,
  Inbox,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  employee: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "My Daily Work", href: "/my-work", icon: ClipboardList },
    { label: "My Submissions", href: "/my-submissions", icon: FileText },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Profile", href: "/profile", icon: UserIcon },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  manager: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Daily Submissions", href: "/admin/submissions", icon: ClipboardList },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Projects", href: "/admin/projects", icon: FolderKanban },
    { label: "Profile", href: "/profile", icon: UserIcon },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  admin: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Employees", href: "/admin/employees", icon: Users },
    { label: "Daily Submissions", href: "/admin/submissions", icon: ClipboardList },
    { label: "Revisions", href: "/admin/revisions", icon: Inbox },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Projects", href: "/admin/projects", icon: FolderKanban },
    { label: "Backups", href: "/admin/backups", icon: HardDrive },
    { label: "Activity Log", href: "/admin/activity-log", icon: ScrollText },
    { label: "Users & Roles", href: "/admin/users-roles", icon: ShieldCheck },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
};
