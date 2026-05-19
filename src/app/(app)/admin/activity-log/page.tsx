"use client";
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  LogIn, LogOut, KeyRound, Upload, Unlock, CheckCircle2, XCircle,
  UserPlus, UserCog, Users, FolderPlus, Folder, FolderMinus,
  Settings, HardDrive, FileDown, AlertTriangle, RefreshCw,
  Download, Search, Activity, ShieldCheck, CalendarOff, CalendarPlus,
  ClipboardCheck, Pencil, Bell, RotateCcw, Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { useDataStore } from "@/store/dataStore";
import { useRequireRole, useAuth } from "@/hooks/useAuth";
import { logService } from "@/services/log.service";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { initials } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ActivityLog } from "@/types";
import type { ComponentType } from "react";

const PAGE_SIZE = 25;

// ─── Action metadata ───────────────────────────────────────────────────────────
type ActionMeta = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  bg: string;   // icon container bg
  text: string; // icon colour
  badgeVariant: "default" | "success" | "warning" | "danger" | "info" | "muted";
  group: string;
};

const ACTION_META: Record<string, ActionMeta> = {
  "auth.login":                   { label: "Logged in",               Icon: LogIn,          bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "auth" },
  "auth.logout":                  { label: "Logged out",              Icon: LogOut,         bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "auth" },
  "auth.password_change":         { label: "Changed password",        Icon: KeyRound,       bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "auth" },
  "submission.upload":            { label: "Submitted daily work",    Icon: Upload,         bg: "bg-blue-100",    text: "text-blue-600",    badgeVariant: "info",     group: "submission" },
  "submission.unlock":            { label: "Unlocked submission",     Icon: Unlock,         bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "submission" },
  "submission.mark_status":       { label: "Updated submission status", Icon: ClipboardCheck, bg: "bg-blue-100", text: "text-blue-600",    badgeVariant: "info",     group: "submission" },
  "submission.start_day":         { label: "Started workday",         Icon: ClipboardCheck, bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "submission" },
  "submission.reset_day":         { label: "Reset workday",           Icon: RotateCcw,      bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "submission" },
  "submission.force_reset":       { label: "Force-reset submission",  Icon: Trash2,         bg: "bg-rose-100",    text: "text-rose-600",    badgeVariant: "danger",   group: "submission" },
  "revision.request":             { label: "Requested revision",      Icon: Pencil,         bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "revision" },
  "revision.approve":             { label: "Approved revision",       Icon: CheckCircle2,   bg: "bg-emerald-100", text: "text-emerald-600", badgeVariant: "success",  group: "revision" },
  "revision.reject":              { label: "Rejected revision",       Icon: XCircle,        bg: "bg-rose-100",    text: "text-rose-600",    badgeVariant: "danger",   group: "revision" },
  "user.create":                  { label: "Created user account",    Icon: UserPlus,       bg: "bg-violet-100",  text: "text-violet-600",  badgeVariant: "info",     group: "user" },
  "user.update":                  { label: "Updated user profile",    Icon: UserCog,        bg: "bg-violet-100",  text: "text-violet-500",  badgeVariant: "muted",    group: "user" },
  "user.toggle_active":           { label: "Toggled user status",     Icon: Users,          bg: "bg-violet-100",  text: "text-violet-600",  badgeVariant: "warning",  group: "user" },
  "project.create":               { label: "Created project",         Icon: FolderPlus,     bg: "bg-teal-100",    text: "text-teal-600",    badgeVariant: "info",     group: "project" },
  "project.update":               { label: "Updated project",         Icon: Folder,         bg: "bg-teal-100",    text: "text-teal-500",    badgeVariant: "muted",    group: "project" },
  "project.delete":               { label: "Deleted project",         Icon: FolderMinus,    bg: "bg-rose-100",    text: "text-rose-600",    badgeVariant: "danger",   group: "project" },
  "settings.holiday_add":         { label: "Added holiday",           Icon: CalendarPlus,   bg: "bg-orange-100",  text: "text-orange-600",  badgeVariant: "warning",  group: "settings" },
  "settings.holiday_remove":      { label: "Removed holiday",         Icon: CalendarOff,    bg: "bg-orange-100",  text: "text-orange-600",  badgeVariant: "warning",  group: "settings" },
  "settings.working_days_update": { label: "Updated working days",    Icon: Settings,       bg: "bg-orange-100",  text: "text-orange-600",  badgeVariant: "warning",  group: "settings" },
  "settings.permissions_update":  { label: "Updated permissions",     Icon: ShieldCheck,    bg: "bg-orange-100",  text: "text-orange-600",  badgeVariant: "warning",  group: "settings" },
  "backup.run":                    { label: "Ran backup",              Icon: HardDrive,      bg: "bg-purple-100",  text: "text-purple-600",  badgeVariant: "muted",    group: "backup" },
  "report.export":                 { label: "Exported report",         Icon: FileDown,       bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "report" },
  "db.reset":                      { label: "Reset database",          Icon: AlertTriangle,  bg: "bg-rose-100",    text: "text-rose-600",    badgeVariant: "danger",   group: "system" },
  "reminder.send":                 { label: "Sent reminders",          Icon: Bell,           bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "user" },
  "download.file":                 { label: "Downloaded attachment",   Icon: Download,       bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "submission" },
  "project.revision_requested":    { label: "Requested project revision", Icon: Pencil,      bg: "bg-amber-100",   text: "text-amber-600",   badgeVariant: "warning",  group: "project" },
  "project.revision_approved":     { label: "Approved project revision", Icon: CheckCircle2, bg: "bg-emerald-100", text: "text-emerald-600", badgeVariant: "success",  group: "project" },
  "project.revision_rejected":     { label: "Rejected project revision", Icon: XCircle,     bg: "bg-rose-100",    text: "text-rose-600",    badgeVariant: "danger",   group: "project" },
};

function getMeta(action: string): ActionMeta {
  if (ACTION_META[action]) return ACTION_META[action];
  const prefix = action.split(".")[0];
  const fallbacks: Record<string, ActionMeta> = {
    auth:       { label: action, Icon: LogIn,         bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "auth" },
    submission: { label: action, Icon: Upload,        bg: "bg-blue-100",    text: "text-blue-500",    badgeVariant: "info",     group: "submission" },
    revision:   { label: action, Icon: Pencil,        bg: "bg-amber-100",   text: "text-amber-500",   badgeVariant: "warning",  group: "revision" },
    user:       { label: action, Icon: UserCog,       bg: "bg-violet-100",  text: "text-violet-500",  badgeVariant: "muted",    group: "user" },
    project:    { label: action, Icon: Folder,        bg: "bg-teal-100",    text: "text-teal-500",    badgeVariant: "muted",    group: "project" },
    settings:   { label: action, Icon: Settings,      bg: "bg-orange-100",  text: "text-orange-500",  badgeVariant: "warning",  group: "settings" },
    backup:     { label: action, Icon: HardDrive,     bg: "bg-purple-100",  text: "text-purple-500",  badgeVariant: "muted",    group: "backup" },
    report:     { label: action, Icon: FileDown,      bg: "bg-slate-100",   text: "text-slate-500",   badgeVariant: "muted",    group: "report" },
  };
  return fallbacks[prefix] ?? { label: action, Icon: Activity, bg: "bg-slate-100", text: "text-slate-500", badgeVariant: "muted", group: "other" };
}

// ─── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso, "MMM dd, yyyy");
}

// ─── Target label ──────────────────────────────────────────────────────────────
function targetLabel(l: ActivityLog, users: ReturnType<typeof useDataStore.getState>["users"]): string | null {
  if (!l.targetType) return null;
  if (l.targetType === "user") {
    const u = users.find((x) => x.id === l.targetId);
    return u ? u.name : l.targetId ?? null;
  }
  if (l.targetType === "project") {
    // We don't have projects here but targetId works
    return l.targetId ? `#${l.targetId.slice(-6)}` : null;
  }
  return l.targetId ? `${l.targetType} #${l.targetId.slice(-6)}` : l.targetType;
}

const ACTION_GROUPS = [
  { value: "all",        label: "All actions" },
  { value: "auth",       label: "Auth" },
  { value: "submission", label: "Submissions" },
  { value: "revision",   label: "Revisions" },
  { value: "user",       label: "User management" },
  { value: "project",    label: "Projects" },
  { value: "settings",   label: "Settings" },
  { value: "backup",     label: "Backups" },
  { value: "report",     label: "Reports" },
  { value: "system",     label: "System" },
];

export default function ActivityLogPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const me = useAuth();
  const isManager = me?.role === "manager";
  const logs = useDataStore((s) => s.logs);
  const users = useDataStore((s) => s.users);

  // For managers, compute the set of user IDs in their department.
  const deptEmployeeIds = useMemo(() => {
    if (!isManager || !me?.departmentId) return null;
    return new Set(users.filter((u) => u.departmentId === me.departmentId).map((u) => u.id));
  }, [isManager, me?.departmentId, users]);
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  // Tick every minute to keep relative times fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  void now; // used implicitly via relativeTime()

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await logService.refresh();
      toast.success("Activity log refreshed.");
    } catch {
      toast.error("Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const rows = useMemo(() => {
    return logs.filter((l) => {
      // Managers only see activity from their department's employees.
      if (deptEmployeeIds && !deptEmployeeIds.has(l.userId)) return false;
      const u = users.find((x) => x.id === l.userId);
      if (q) {
        const hay = [u?.name ?? "", l.action, getMeta(l.action).label, l.targetType ?? "", l.targetId ?? "", l.ip ?? ""]
          .join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (userFilter !== "all" && l.userId !== userFilter) return false;
      if (actionFilter !== "all") {
        const group = getMeta(l.action).group;
        if (group !== actionFilter && !l.action.startsWith(actionFilter + ".")) return false;
      }
      return true;
    });
  }, [logs, users, q, userFilter, actionFilter, deptEmployeeIds]);

  useEffect(() => { setPage(1); }, [q, userFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Stats
  // For stats cards, use only the dept-scoped logs when the viewer is a manager.
  const scopedLogs = deptEmployeeIds
    ? logs.filter((l) => deptEmployeeIds.has(l.userId))
    : logs;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = scopedLogs.filter((l) => new Date(l.createdAt) >= todayStart).length;
  const uniqueUsers = new Set(scopedLogs.filter((l) => {
    const d = new Date(l.createdAt);
    return (Date.now() - d.getTime()) < 7 * 86400_000;
  }).map((l) => l.userId)).size;
  const lastEvent = scopedLogs[0];

  const exportCsv = () => {
    downloadBlob(
      "activity_log.csv",
      toCsv(rows.map((l) => ({
        Time: l.createdAt,
        User: users.find((u) => u.id === l.userId)?.name ?? "",
        Action: l.action,
        Label: getMeta(l.action).label,
        Target: l.targetType ?? "",
        TargetId: l.targetId ?? "",
        IP: l.ip ?? "",
      }))),
      "text/csv"
    );
  };

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isManager ? "Team Activity Log" : "Activity Log"}
        description={isManager ? "Audit trail of actions by your department's employees." : "Full audit trail of every action in the workspace."}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        }
      />

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Total events</p>
                <p className="mt-1 text-2xl font-semibold">{scopedLogs.length.toLocaleString()}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Activity className="h-5 w-5 text-blue-500" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today</p>
                <p className="mt-1 text-2xl font-semibold">{todayCount}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <ClipboardCheck className="h-5 w-5 text-emerald-500" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Active users (7d)</p>
                <p className="mt-1 text-2xl font-semibold">{uniqueUsers}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
                <Users className="h-5 w-5 text-violet-500" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Last activity</p>
                <p className="mt-1 text-sm font-medium leading-tight">
                  {lastEvent ? relativeTime(lastEvent.createdAt) : "—"}
                </p>
                {lastEvent && (
                  <p className="text-xs text-ink-muted">{getMeta(lastEvent.action).label}</p>
                )}
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <Activity className="h-5 w-5 text-amber-500" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative flex-1 min-w-0 sm:min-w-52">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input
                className="pl-9"
                placeholder="Search user, action, IP…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {(isManager && deptEmployeeIds
                  ? users.filter((u) => deptEmployeeIds.has(u.id))
                  : users.filter((u) => u.isActive)
                ).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                {ACTION_GROUPS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(q || userFilter !== "all" || actionFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setQ(""); setUserFilter("all"); setActionFilter("all"); }}
                className="text-ink-muted"
              >
                Clear filters
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Showing <span className="font-medium text-ink">{rows.length.toLocaleString()}</span> event{rows.length !== 1 ? "s" : ""}
            {scopedLogs.length !== rows.length && ` of ${scopedLogs.length.toLocaleString()} total`}
          </p>
        </CardContent>
      </Card>

      {/* ── Feed ──────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle">
              <Activity className="h-6 w-6 text-ink-soft" />
            </div>
            <p className="font-medium text-ink">No events found</p>
            <p className="mt-1 text-sm text-ink-muted">Try adjusting your search or filters.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-surface-border">
              {pageRows.map((l, i) => {
                const u = users.find((x) => x.id === l.userId);
                const meta = getMeta(l.action);
                const target = targetLabel(l, users);
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "flex items-start gap-4 px-5 py-4 transition hover:bg-surface-subtle",
                      i === 0 && "rounded-t-xl"
                    )}
                  >
                    {/* Icon */}
                    <span className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", meta.bg)}>
                      <meta.Icon className={cn("h-4 w-4", meta.text)} />
                    </span>

                    {/* Main content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* Actor */}
                        <div className="flex items-center gap-1.5">
                          {u ? (
                            <Avatar className="h-5 w-5 text-[9px]">
                              <AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback>
                            </Avatar>
                          ) : null}
                          <span className="text-sm font-medium">
                            {u?.name ?? <span className="italic text-ink-muted">system</span>}
                          </span>
                        </div>

                        {/* Action label */}
                        <span className="text-sm text-ink">{meta.label}</span>

                        {/* Target */}
                        {target && (
                          <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-ink-muted">
                            {target}
                          </span>
                        )}
                      </div>

                      {/* Sub-row: raw action key + IP */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <Badge variant={meta.badgeVariant} className="text-[10px] px-1.5 py-0">
                          {l.action}
                        </Badge>
                        {l.ip && (
                          <span className="font-mono text-[11px] text-ink-muted">{l.ip}</span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 text-right">
                      <p
                        className="text-sm text-ink-muted"
                        title={fmtDate(l.createdAt, "MMM dd, yyyy 'at' hh:mm:ss a")}
                      >
                        {relativeTime(l.createdAt)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-soft">
                        {fmtDate(l.createdAt, "MMM dd, hh:mm a")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <Pagination page={safePage} totalPages={totalPages} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </div>
  );
}
