"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/dates";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { useRequireRole } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export default function ActivityLogPage() {
  useRequireRole(["admin"]);
  const logs = useDataStore((s) => s.logs);
  const users = useDataStore((s) => s.users);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return [...logs].reverse().filter((l) => {
      const u = users.find((x) => x.id === l.userId);
      return q ? ((u?.name ?? "") + l.action + (l.targetType ?? "")).toLowerCase().includes(q.toLowerCase()) : true;
    });
  }, [logs, users, q]);

  const exportCsv = () => {
    downloadBlob("activity_log.csv", toCsv(rows.map((l) => ({
      Time: l.createdAt, User: users.find((u) => u.id === l.userId)?.name ?? "", Action: l.action, Target: l.targetType ?? "", TargetId: l.targetId ?? "", IP: l.ip ?? "",
    }))), "text/csv");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Audit trail of every action taken in the workspace."
        actions={<Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input className="pl-9" placeholder="Search actor, action, or target…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Table>
            <THead><TR><TH>Time</TH><TH>User</TH><TH>Action</TH><TH>Target</TH><TH>IP</TH></TR></THead>
            <TBody>
              {rows.slice(0, 200).map((l) => {
                const u = users.find((x) => x.id === l.userId);
                return (
                  <TR key={l.id}>
                    <TD className="text-ink-muted">{fmtDate(l.createdAt, "MMM dd, hh:mm:ss a")}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        {u && <Avatar className="h-6 w-6 text-[10px]"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>}
                        <span>{u?.name ?? "system"}</span>
                      </div>
                    </TD>
                    <TD><Badge variant="muted">{l.action}</Badge></TD>
                    <TD className="text-xs text-ink-muted">{l.targetType ? `${l.targetType}:${l.targetId}` : "—"}</TD>
                    <TD className="text-xs text-ink-muted">{l.ip ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
