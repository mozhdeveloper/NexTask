"use client";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, MoreVertical, Users, UserCheck, UserX,
  ShieldCheck, Eye, Pencil, Power, X,
} from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown";
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
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const PAGE_SIZE = 15;

const ROLE_CLS: Record<string, string> = {
  admin: "border-indigo-200 bg-indigo-50 text-indigo-700",
  manager: "border-primary/20 bg-primary-soft text-primary",
  employee: "border-surface-border bg-surface-subtle text-ink-muted",
};

function StatCard({
  icon: Icon, label, value, sub, cls,
}: { icon: LucideIcon; label: string; value: number; sub?: string; cls?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-surface-border bg-white px-3 py-3 shadow-card transition-shadow hover:shadow-pop sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft sm:text-[11px]">{label}</p>
          <p className="mt-1 text-2xl font-extrabold leading-none tabular-nums text-ink sm:mt-1.5 sm:text-3xl">{value}</p>
          {sub && <p className="mt-1 truncate text-[11px] text-ink-muted sm:text-xs">{sub}</p>}
        </div>
        <span className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl", cls)}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
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

  const rows = useMemo(
    () =>
      users
        .filter((u) => (dept === "all" ? true : u.departmentId === dept))
        .filter((u) => (role === "all" ? true : u.role === role))
        .filter((u) =>
          q ? (u.name + " " + u.email).toLowerCase().includes(q.toLowerCase()) : true,
        ),
    [users, q, dept, role],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isFiltered = q !== "" || dept !== "all" || role !== "all";

  useEffect(() => { setPage(1); }, [q, dept, role]);

  const clearFilters = () => { setQ(""); setDept("all"); setRole("all"); };

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your team members, roles, and workspace access."
        actions={
          canManage ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> Add employee
            </Button>
          ) : undefined
        }
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total"
          value={users.length}
          sub={`${users.length} member${users.length !== 1 ? "s" : ""}`}
          cls="bg-primary-soft text-primary"
        />
        <StatCard
          icon={UserCheck}
          label="Active"
          value={activeCount}
          sub={`${Math.round((activeCount / Math.max(users.length, 1)) * 100)}% of team`}
          cls="bg-success-soft text-success"
        />
        <StatCard
          icon={UserX}
          label="Inactive"
          value={inactiveCount}
          sub={inactiveCount === 0 ? "All members active" : `${inactiveCount} deactivated`}
          cls="bg-surface-subtle text-ink-muted"
        />
        <StatCard
          icon={ShieldCheck}
          label="Privileged"
          value={privilegedCount}
          sub="Admins & Managers"
          cls="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* ── Main card ── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {isFiltered
                  ? `${rows.length} of ${users.length} employees match your filters`
                  : `${users.length} employee${users.length !== 1 ? "s" : ""} in this workspace`}
              </CardDescription>
            </div>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-ink-muted hover:text-ink"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-0 pt-4">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative min-w-0 flex-1 sm:min-w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input
                className="pl-9"
                placeholder="Search by name or email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Divider */}
          <div className="-mx-5 mt-4 border-t border-surface-border" />

          {/* Content */}
          {pageRows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={isFiltered ? "No employees match your filters" : "No employees yet"}
              description={
                isFiltered
                  ? "Try adjusting your search, department, or role filter."
                  : "Add your first team member to get started."
              }
              action={
                !isFiltered && canManage ? (
                  <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
                    <Plus className="h-4 w-4" /> Add employee
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Role</TH>
                  <TH className="hidden md:table-cell">Department</TH>
                  <TH className="hidden lg:table-cell">Joined</TH>
                  <TH className="hidden sm:table-cell">Status</TH>
                  <TH className="w-10" />
                </TR>
              </THead>
              <TBody>
                {pageRows.map((u) => {
                  const d = departments.find((x) => x.id === u.departmentId);
                  return (
                    <TR
                      key={u.id}
                      className="group cursor-pointer"
                      onClick={() => setDetails(u)}
                    >
                      {/* Employee cell */}
                      <TD>
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback
                                className={cn(
                                  "text-xs font-semibold text-white",
                                  u.avatarColor || "bg-ink-soft",
                                )}
                              >
                                {initials(u.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                                u.isActive ? "bg-success" : "bg-ink-soft",
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-ink">{u.name}</div>
                            <div className="truncate text-xs text-ink-muted">
                              {u.jobTitle ?? u.email}
                            </div>
                          </div>
                        </div>
                      </TD>

                      {/* Role */}
                      <TD>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                            ROLE_CLS[u.role] ?? ROLE_CLS.employee,
                          )}
                        >
                          {u.role}
                        </span>
                      </TD>

                      {/* Department */}
                      <TD className="hidden md:table-cell">
                        {d ? (
                          <span className="text-sm text-ink">{d.name}</span>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </TD>

                      {/* Joined */}
                      <TD className="hidden lg:table-cell">
                        <span className="text-xs text-ink-muted">
                          {fmtDate(u.createdAt, "MMM d, yyyy")}
                        </span>
                      </TD>

                      {/* Status */}
                      <TD className="hidden sm:table-cell">
                        {u.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="muted">Inactive</Badge>
                        )}
                      </TD>

                      {/* Actions */}
                      <TD onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDetails(u)}
                            >
                              <Eye className="h-4 w-4" /> View profile
                            </DropdownMenuItem>
                            {canManage && (
                              <DropdownMenuItem
                                onClick={() => { setEditing(u); setOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            {canManage && <DropdownMenuSeparator />}
                            {canManage && (
                              <DropdownMenuItem
                                danger
                                onClick={() => setConfirm(u)}
                              >
                                <Power className="h-4 w-4" />
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

          {rows.length > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={rows.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeFormModal open={open} onOpenChange={setOpen} editing={editing} />
      <EmployeeDetailsModal
        open={!!details}
        onOpenChange={(v) => !v && setDetails(null)}
        user={details}
        onEdit={
          canManage
            ? () => {
                if (details) {
                  setEditing(details);
                  setDetails(null);
                  setOpen(true);
                }
              }
            : undefined
        }
      />
      <ConfirmModal
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.isActive ? "Deactivate employee?" : "Reactivate employee?"}
        description={
          confirm?.isActive
            ? `${confirm?.name ?? "This employee"} will lose access until you reactivate them.`
            : `${confirm?.name ?? "This employee"} will regain access to the workspace.`
        }
        confirmLabel={confirm?.isActive ? "Deactivate" : "Reactivate"}
        destructive={confirm?.isActive}
        onConfirm={() => {
          if (!confirm) return;
          userService.toggleActive(confirm.id);
          toast.success(
            confirm.isActive ? `${confirm.name} deactivated.` : `${confirm.name} reactivated.`,
          );
        }}
      />
    </div>
  );
}
