import type { Role } from "@/lib/constants";

export interface PermissionDef {
  key: string;
  label: string;
  description?: string;
  group: string;
  /** Locked = cannot be toggled by admin (system invariants). */
  locked?: boolean;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Submissions
  { key: "submit_work", label: "Submit daily work", group: "Submissions" },
  { key: "view_own", label: "View own submissions", group: "Submissions" },
  { key: "request_revision", label: "Request a revision on own submission", group: "Submissions" },
  { key: "view_all_subs", label: "View all employees' submissions", group: "Submissions" },
  { key: "override_status", label: "Override submission status", group: "Submissions" },
  { key: "unlock_submission", label: "Unlock locked submissions", group: "Submissions" },
  // Revisions
  { key: "approve_revisions", label: "Approve / reject revision requests", group: "Revisions" },
  // People
  { key: "send_reminders", label: "Send reminders to employees", group: "People" },
  { key: "manage_employees", label: "Add / edit / deactivate employees", group: "People" },
  { key: "view_employee_details", label: "View employee details & history", group: "People" },
  // Projects
  { key: "manage_projects", label: "Create / edit / delete projects", group: "Projects" },
  { key: "view_projects", label: "View projects", group: "Projects" },
  // System
  { key: "run_backups", label: "Run / download backups", group: "System" },
  { key: "view_logs", label: "View activity log", group: "System" },
  { key: "manage_settings", label: "Edit workspace settings (work days, holidays)", group: "System" },
  { key: "manage_permissions", label: "Edit role permissions (RBAC)", group: "System", locked: true },
  { key: "reset_data", label: "Reset workspace data", group: "System", locked: true },
];

export const DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  admin: ALL_PERMISSIONS.map((p) => p.key),
  manager: [
    "submit_work",
    "view_own",
    "request_revision",
    "view_all_subs",
    "override_status",
    "unlock_submission",
    "approve_revisions",
    "send_reminders",
    "manage_employees",
    "view_employee_details",
    "manage_projects",
    "view_projects",
  ],
  employee: ["submit_work", "view_own", "request_revision", "view_projects"],
};

export function hasPermission(
  permissions: Record<Role, string[]> | undefined,
  role: Role | undefined,
  key: string
): boolean {
  if (!role) return false;
  const map = permissions ?? DEFAULT_PERMISSIONS;
  return (map[role] ?? []).includes(key);
}
