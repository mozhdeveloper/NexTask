"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, Minus } from "lucide-react";
import { useRequireRole } from "@/hooks/useAuth";

const PERMISSIONS: Array<{ key: string; label: string; admin: boolean; manager: boolean; employee: boolean }> = [
  { key: "submit_work", label: "Submit daily work", admin: true, manager: true, employee: true },
  { key: "view_own", label: "View own submissions", admin: true, manager: true, employee: true },
  { key: "request_revision", label: "Request a revision", admin: true, manager: true, employee: true },
  { key: "view_all_subs", label: "View all submissions", admin: true, manager: true, employee: false },
  { key: "approve_revisions", label: "Approve / reject revisions", admin: true, manager: true, employee: false },
  { key: "send_reminders", label: "Send reminders", admin: true, manager: true, employee: false },
  { key: "manage_employees", label: "Manage employees", admin: true, manager: true, employee: false },
  { key: "manage_projects", label: "Manage projects", admin: true, manager: true, employee: false },
  { key: "run_backups", label: "Run backups", admin: true, manager: false, employee: false },
  { key: "view_logs", label: "View activity log", admin: true, manager: false, employee: false },
  { key: "reset_data", label: "Reset workspace data", admin: true, manager: false, employee: false },
];

function Cell({ allowed }: { allowed: boolean }) {
  return allowed
    ? <Check className="h-4 w-4 text-emerald-500" />
    : <Minus className="h-4 w-4 text-ink-soft" />;
}

export default function UsersRolesPage() {
  const { ready } = useRequireRole(["admin"]);
  const users = useDataStore((s) => s.users);
  const counts = {
    admin: users.filter((u) => u.role === "admin" && u.isActive).length,
    manager: users.filter((u) => u.role === "manager" && u.isActive).length,
    employee: users.filter((u) => u.role === "employee" && u.isActive).length,
  };

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="Users & Roles" description="Roles define what each member can access in the workspace." />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {(["admin","manager","employee"] as const).map((r) => (
          <Card key={r}>
            <CardHeader>
              <CardTitle className="capitalize">{r}</CardTitle>
              <CardDescription>{counts[r]} active</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={r === "admin" ? "danger" : r === "manager" ? "warning" : "info"} className="capitalize">{r}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Permission matrix</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Permission</TH><TH className="text-center">Admin</TH><TH className="text-center">Manager</TH><TH className="text-center">Employee</TH></TR></THead>
            <TBody>
              {PERMISSIONS.map((p) => (
                <TR key={p.key}>
                  <TD>{p.label}</TD>
                  <TD className="text-center"><div className="flex justify-center"><Cell allowed={p.admin} /></div></TD>
                  <TD className="text-center"><div className="flex justify-center"><Cell allowed={p.manager} /></div></TD>
                  <TD className="text-center"><div className="flex justify-center"><Cell allowed={p.employee} /></div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
