"use client";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreVertical, Users, UserCheck, UserX, Shield, Briefcase } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { EmployeeFormModal } from "@/components/modals/EmployeeFormModal";
import { EmployeeDetailsModal } from "@/components/modals/EmployeeDetailsModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { userService } from "@/services/user.service";
import { toast } from "sonner";
import type { User } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequireRole } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const PAGE_SIZE = 15;

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  manager: "bg-primary-soft text-primary border border-primary/30",
  employee: "bg-surface-subtle text-ink-muted border border-surface-border",
};

function StatCard({
  icon: Icon, label, value, iconClass,
}: { icon: LucideIcon; label: string; value: number; iconClass?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-4 shadow-card">
      <span className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold leading-none text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const canManage = usePermission("manage_employees");
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [role, setRole] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [details, setDetails] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const [page, setPage] = useState(1);

  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);
  const inactiveCount = users.length - activeCount;
  const privilegedCount = useMemo(
    () => users.filter((u) => u.role === "admin" || u.role === "manager").length,
    [users],
  );

  const rows = useMemo(() =>
    users
      .filter((u) => (dept === "all" ? true : u.departmentId === dept))
      .filter((u) => (role === "all" ? true : u.role === role))
      .filter((u) => (q ? (u.name + u.email).toLowerCase().includes(q.toLowerCase()) : true)),
    [users, q, dept, role]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q, dept, role]);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage members of your office workspace."
        actions={
          canManage
            ? (
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="h-4 w-4" /> Add employee
              </Button>
            )
            : undefined
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Total employees" value={users.length} iconClass="bg-primary-soft text-primary" />
        <StatCard icon={UserCheck} label="Active" value={activeCount} iconClass="bg-success-soft text-success" />
        <StatCard icon={UserX} label="Inactive" value={inactiveCount} iconClass="bg-surface-subtle text-ink-muted" />
        <StatCard icon={Shield} label="Admins & Managers" value={privilegedCount} iconClass="bg-indigo-50 text-indigo-600" />
      </div>

      <Card>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative min-w-0 flex-1 sm:min-w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input
                className="pl-9"
                placeholder="Search by name or email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table or empty */}
          {pageRows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              description="Try adjusting your search, department, or role filter."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Role</TH>
                  <TH>Department</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {pageRows.map((u) => {
                  const d = departments.find((x) => x.id === u.departmentId);
                  return (
                    <TR
                      key={u.id}
                      className="cursor-pointer hover:bg-surface-subtle"
                      onClick={() => setDetails(u)}
                    >
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{u.name}</div>
                            <div className="truncate text-xs text-ink-muted">{u.email}</div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                          ROLE_BADGE[u.role] ?? ROLE_BADGE.employee,
                        )}>
                          {u.role}
                        </span>
                      </TD>
                      <TD>
                        {d ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                            <Briefcase className="h-3.5 w-3.5 text-ink-soft" />
                            {d.name}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </TD>
                      <TD>
                        {u.isActive
                          ? <Badge variant="success">Active</Badge>
                          : <Badge variant="muted">Inactive</Badge>}
                      </TD>
                      <TD>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetails(u); }}>
                              View details
                            </DropdownMenuItem>
                            {canManage && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(u); setOpen(true); }}>
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canManage && <DropdownMenuSeparator />}
                            {canManage && (
                              <DropdownMenuItem
                                danger
                                onClick={(e) => { e.stopPropagation(); setConfirm(u); }}
                              >
                                {u.isActive ? "Deactivate" : "Reactivate"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}

          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={rows.length}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p)}
          />
        </CardContent>
      </Card>

      <EmployeeFormModal open={open} onOpenChange={setOpen} editing={editing} />
      <EmployeeDetailsModal
        open={!!details}
        onOpenChange={(v) => !v && setDetails(null)}
        user={details}
        onEdit={canManage ? () => { if (details) { setEditing(details); setDetails(null); setOpen(true); } } : undefined}
      />
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

export default function EmployeesPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const canManage = usePermission("manage_employees");
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [details, setDetails] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const [page, setPage] = useState(1);

  const rows = useMemo(() =>
    users
      .filter((u) => (dept === "all" ? true : u.departmentId === dept))
      .filter((u) => (q ? (u.name + u.email).toLowerCase().includes(q.toLowerCase()) : true)),
    [users, q, dept]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q, dept]);

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage members of your office workspace."
        actions={canManage ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add employee</Button> : undefined}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full flex-1 min-w-0 sm:min-w-60">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <THead><TR><TH>Employee</TH><TH>Role</TH><TH>Department</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {pageRows.map((u) => {
                const d = departments.find((x) => x.id === u.departmentId);
                return (
                  <TR
                    key={u.id}
                    className="cursor-pointer hover:bg-surface-subtle"
                    onClick={() => setDetails(u)}
                  >
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
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetails(u); }}>View details</DropdownMenuItem>
                          {canManage && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(u); setOpen(true); }}>Edit</DropdownMenuItem>}
                          {canManage && <DropdownMenuSeparator />}
                          {canManage && (
                            <DropdownMenuItem danger onClick={(e) => { e.stopPropagation(); setConfirm(u); }}>
                              {u.isActive ? "Deactivate" : "Reactivate"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={rows.length}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p)}
          />
        </CardContent>
      </Card>
      <EmployeeFormModal open={open} onOpenChange={setOpen} editing={editing} />
      <EmployeeDetailsModal
        open={!!details}
        onOpenChange={(v) => !v && setDetails(null)}
        user={details}
        onEdit={canManage ? () => { if (details) { setEditing(details); setDetails(null); setOpen(true); } } : undefined}
      />
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
