"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreVertical } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { EmployeeFormModal } from "@/components/modals/EmployeeFormModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { userService } from "@/services/user.service";
import { toast } from "sonner";
import type { User } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequireRole } from "@/hooks/useAuth";

export default function EmployeesPage() {
  useRequireRole(["admin", "manager"]);
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);

  const rows = useMemo(() =>
    users
      .filter((u) => (dept === "all" ? true : u.departmentId === dept))
      .filter((u) => (q ? (u.name + u.email).toLowerCase().includes(q.toLowerCase()) : true)),
    [users, q, dept]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage members of your office workspace."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add employee</Button>}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-60">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <THead><TR><TH>Employee</TH><TH>Role</TH><TH>Department</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {rows.map((u) => {
                const d = departments.find((x) => x.id === u.departmentId);
                return (
                  <TR key={u.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-ink-muted">{u.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="capitalize">{u.role}</TD>
                    <TD>{d?.name}</TD>
                    <TD>
                      {u.isActive
                        ? <Badge variant="success">Active</Badge>
                        : <Badge variant="muted">Inactive</Badge>}
                    </TD>
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setEditing(u); setOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onClick={() => setConfirm(u)}>
                            {u.isActive ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <EmployeeFormModal open={open} onOpenChange={setOpen} editing={editing} />
      <ConfirmModal
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.isActive ? "Deactivate employee?" : "Reactivate employee?"}
        description={confirm?.isActive
          ? "They will lose access until you reactivate them."
          : "They will regain access to the workspace."}
        confirmLabel={confirm?.isActive ? "Deactivate" : "Reactivate"}
        destructive={confirm?.isActive}
        onConfirm={() => {
          if (!confirm) return;
          userService.toggleActive(confirm.id);
          toast.success(confirm.isActive ? "Employee deactivated." : "Employee reactivated.");
        }}
      />
    </div>
  );
}
