"use client";
import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Input } from "@/components/ui/input";
import { Search, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/dates";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { useRequireRole } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logService } from "@/services/log.service";
import { toast } from "sonner";

const ACTION_GROUPS: Record<string, string[]> = {
  "auth": ["auth.login", "auth.logout"],
  "submission": ["submission.upload", "submission.unlock", "submission.mark_status"],
  "revision": ["revision.request", "revision.approve", "revision.reject"],
  "user": ["user.create", "user.update", "user.toggle_active"],
  "project": ["project.create", "project.update"],
  "settings": ["settings.holiday_add", "settings.holiday_remove", "settings.working_days_update"],
  "report": [],   // prefix match
  "backup": ["backup.run"],
};

export default function ActivityLogPage() {
  const { ready } = useRequireRole(["admin"]);
  const logs = useDataStore((s) => s.logs);
  const users = useDataStore((s) => s.users);
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await logService.refresh();
      toast.success("Activity log refreshed.");
    } catch {
      toast.error("Failed to refresh logs.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const rows = useMemo(() => {
    // logs are stored newest-first; show newest at top
    return logs.filter((l) => {
      const u = users.find((x) => x.id === l.userId);
      const matchesQ = q
        ? ((u?.name ?? "") + l.action + (l.targetType ?? "") + (l.ip ?? ""))
            .toLowerCase()
            .includes(q.toLowerCase())
        : true;
      const matchesUser = userFilter === "all" || l.userId === userFilter;
      const matchesAction =
        actionFilter === "all" ||
        (actionFilter === "report"
          ? l.action.startsWith("report.")
          : ACTION_GROUPS[actionFilter]?.includes(l.action) ?? l.action.startsWith(actionFilter));
      return matchesQ && matchesUser && matchesAction;
    });
  }, [logs, users, q, userFilter, actionFilter]);

  const exportCsv = () => {
    downloadBlob(
      "activity_log.csv",
      toCsv(
        rows.map((l) => ({
          Time: l.createdAt,
          User: users.find((u) => u.id === l.userId)?.name ?? "",
          Action: l.action,
          Target: l.targetType ?? "",
          TargetId: l.targetId ?? "",
          IP: l.ip ?? "",
          UA: l.userAgent ?? "",
        }))
      ),
      "text/csv"
    );
  };

  const actionBadgeVariant = (action: string): "default" | "success" | "warning" | "danger" | "info" | "muted" => {
    if (action.startsWith("auth.")) return "muted";
    if (action.startsWith("submission.")) return "info";
    if (action.startsWith("revision.")) return "warning";
    if (action.startsWith("user.")) return "warning";
    if (action.startsWith("project.")) return "default";
    if (action.startsWith("settings.")) return "warning";
    if (action.startsWith("backup.")) return "danger";
    if (action.startsWith("report.")) return "muted";
    if (action.startsWith("db.")) return "danger";
    return "muted";
  };

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Audit trail of every action taken in the workspace."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input
                className="pl-9"
                placeholder="Search user, action, target, or IP…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="auth">Auth (login/logout)</SelectItem>
                <SelectItem value="submission">Submissions</SelectItem>
                <SelectItem value="revision">Revisions</SelectItem>
                <SelectItem value="user">User management</SelectItem>
                <SelectItem value="project">Projects</SelectItem>
                <SelectItem value="settings">Settings changes</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="backup">Backups</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats row */}
          <p className="text-xs text-ink-muted">
            Showing {Math.min(rows.length, 200)} of {rows.length} matching events
            {logs.length > 0 && ` · ${logs.length} total in cache`}
          </p>

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>User</TH>
                  <TH>Action</TH>
                  <TH>Target</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {rows.slice(0, 200).map((l) => {
                  const u = users.find((x) => x.id === l.userId);
                  return (
                    <TR key={l.id}>
                      <TD className="text-ink-muted whitespace-nowrap">
                        {fmtDate(l.createdAt, "MMM dd, hh:mm:ss a")}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          {u && (
                            <Avatar className="h-6 w-6 text-[10px]">
                              <AvatarFallback className={u.avatarColor}>
                                {initials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span>{u?.name ?? <span className="text-ink-muted italic">system</span>}</span>
                        </div>
                      </TD>
                      <TD>
                        <Badge variant={actionBadgeVariant(l.action)}>
                          {l.action}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-ink-muted">
                        {l.targetType ? `${l.targetType}:${l.targetId ?? "—"}` : "—"}
                      </TD>
                      <TD className="text-xs text-ink-muted font-mono">{l.ip ?? "—"}</TD>
                    </TR>
                  );
                })}
                {rows.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="text-center text-ink-muted py-8">
                      No matching log entries found.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

