"use client";
import { useMemo, useState } from "react";
import {
  Plus, MoreVertical, Search, LayoutGrid, List,
  CalendarDays, Users, CalendarPlus, CalendarCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { initials } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ProjectFormModal } from "@/components/modals/ProjectFormModal";
import { ProjectDetailsModal } from "@/components/modals/ProjectDetailsModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { useRequireRole } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { projectService } from "@/services/project.service";
import type { Project } from "@/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  Project["status"],
  { label: string; dot: string; bg: string; text: string; border: string; stripe: string }
> = {
  planning:    { label: "Planning",    dot: "bg-blue-500",    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",  stripe: "bg-blue-500"    },
  in_progress: { label: "In Progress", dot: "bg-amber-500",   bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200", stripe: "bg-amber-500"   },
  review:      { label: "In Review",   dot: "bg-violet-500",  bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",stripe: "bg-violet-500"  },
  completed:   { label: "Completed",   dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",stripe: "bg-emerald-500" },
  on_hold:     { label: "On Hold",     dot: "bg-slate-400",   bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200", stripe: "bg-slate-400"   },
};

function StatusBadge({ status }: { status: Project["status"] }) {
  const sc = STATUS_CONFIG[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
      sc.bg, sc.text, sc.border
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", sc.dot)} />
      {sc.label}
    </span>
  );
}

export default function ProjectsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const canManage = usePermission("manage_projects");
  const projects = useDataStore((s) => s.projects);
  const users = useDataStore((s) => s.users);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [details, setDetails] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Project["status"] | "all">("all");
  const [owner, setOwner] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(
    () =>
      projects
        .filter((p) => status === "all" || p.status === status)
        .filter((p) => owner === "all" || (p.ownerId ?? p.lead) === owner)
        .filter((p) => !q || (p.name + (p.description ?? "")).toLowerCase().includes(q.toLowerCase())),
    [projects, q, status, owner]
  );

  const stats = useMemo(() => {
    const byStatus = {} as Record<Project["status"], number>;
    (Object.keys(STATUS_CONFIG) as Project["status"][]).forEach((k) => (byStatus[k] = 0));
    projects.forEach((p) => byStatus[p.status]++);
    return byStatus;
  }, [projects]);

  if (!ready) return null;

  const openEdit = (p: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(p);
    setDetails(null);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Track ongoing initiatives across the office."
        actions={
          canManage && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          )
        }
      />

      {/* Status stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(STATUS_CONFIG) as Project["status"][]).map((s) => {
          const sc = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setStatus(status === s ? "all" : s)}
              className={cn(
                "group rounded-xl border p-3 text-left transition-all",
                status === s
                  ? cn("border-transparent shadow-sm", sc.bg, sc.border)
                  : "border-surface-border bg-white hover:bg-surface-subtle"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("h-2 w-2 rounded-full flex-shrink-0", sc.dot)} />
                <span className={cn(
                  "ml-auto text-2xl font-bold tabular-nums",
                  status === s ? sc.text : "text-ink"
                )}>
                  {stats[s]}
                </span>
              </div>
              <div className={cn(
                "mt-1 truncate text-xs font-medium",
                status === s ? sc.text : "text-ink-muted"
              )}>
                {sc.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <Input className="pl-9" placeholder="Search projectsâ€¦" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as Project["status"][]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {users.filter((u) => u.isActive).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 self-start rounded-lg border border-surface-border p-0.5">
          <button
            onClick={() => setView("grid")}
            className={cn("flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors", view === "grid" ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors", view === "list" ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="No projects found"
              description={q || status !== "all" || owner !== "all" ? "Try clearing your filters." : "Create your first project to get started."}
            />
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const sc = STATUS_CONFIG[p.status];
            const ownerUser = users.find((u) => u.id === (p.ownerId ?? p.lead));
            const memberUsers = (p.members ?? []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
            const daysLeft = p.dueDate ? Math.ceil((new Date(p.dueDate).getTime() - Date.now()) / 86400000) : null;
            return (
              <div
                key={p.id}
                className="group relative flex cursor-pointer flex-col rounded-xl border border-surface-border bg-white transition-all hover:shadow-md hover:-translate-y-0.5"
                onClick={() => setDetails(p)}
              >
                {/* Status stripe */}
                <div className={cn("h-1 w-full rounded-t-xl", sc.stripe)} />

                <div className="flex flex-1 flex-col gap-3 p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-snug truncate">{p.name}</h3>
                      {p.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-muted leading-relaxed">
                          {p.description}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetails(p); }}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => openEdit(p, e)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Status */}
                  <StatusBadge status={p.status} />

                  {/* Dates */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {p.startDate && (
                      <span className="flex items-center gap-1 text-xs text-ink-muted">
                        <CalendarPlus className="h-3 w-3" />
                        {fmtDate(p.startDate, "MMM dd")}
                      </span>
                    )}
                    {p.dueDate && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        daysLeft !== null && daysLeft < 0 ? "text-rose-600 font-medium" :
                        daysLeft !== null && daysLeft < 7 ? "text-amber-600" : "text-ink-muted"
                      )}>
                        <CalendarDays className="h-3 w-3" />
                        {fmtDate(p.dueDate, "MMM dd")}
                        {daysLeft !== null && daysLeft < 0 && ` Â· ${Math.abs(daysLeft)}d overdue`}
                        {daysLeft !== null && daysLeft === 0 && " Â· Today"}
                      </span>
                    )}
                    {p.completedAt && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CalendarCheck className="h-3 w-3" />
                        {fmtDate(p.completedAt, "MMM dd")}
                      </span>
                    )}
                  </div>

                  {/* Owner + members */}
                  <div className="mt-auto flex items-center justify-between pt-1 border-t border-surface-border">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {ownerUser && (
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          <AvatarFallback className={ownerUser.avatarColor}>{initials(ownerUser.name)}</AvatarFallback>
                        </Avatar>
                      )}
                      <span className="truncate text-xs text-ink-muted">{ownerUser?.name}</span>
                    </div>
                    {memberUsers.length > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="flex -space-x-1.5">
                          {memberUsers.slice(0, 4).map((m) => (
                            <Avatar key={m.id} className="h-5 w-5 text-[9px] ring-1 ring-white">
                              <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {memberUsers.length > 4 && (
                          <span className="text-[10px] text-ink-muted">+{memberUsers.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH>Status</TH>
                  <TH className="hidden sm:table-cell">Owner</TH>
                  <TH className="hidden md:table-cell">Start</TH>
                  <TH className="hidden md:table-cell">Due</TH>
                  <TH className="hidden lg:table-cell">Completed</TH>
                  <TH className="hidden sm:table-cell">
                    <Users className="h-3.5 w-3.5" />
                  </TH>
                  {canManage && <TH />}
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const ownerUser = users.find((u) => u.id === (p.ownerId ?? p.lead));
                  const memberUsers = (p.members ?? []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
                  const daysLeft = p.dueDate ? Math.ceil((new Date(p.dueDate).getTime() - Date.now()) / 86400000) : null;
                  const sc = STATUS_CONFIG[p.status];
                  return (
                    <TR
                      key={p.id}
                      className="cursor-pointer hover:bg-surface-subtle"
                      onClick={() => setDetails(p)}
                    >
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-full w-0.5 self-stretch rounded-full", sc.stripe)} />
                          <div>
                            <div className="font-medium">{p.name}</div>
                            {p.description && (
                              <div className="text-xs text-ink-muted line-clamp-1 max-w-xs">{p.description}</div>
                            )}
                          </div>
                        </div>
                      </TD>
                      <TD><StatusBadge status={p.status} /></TD>
                      <TD className="hidden sm:table-cell">
                        {ownerUser && (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className={ownerUser.avatarColor}>{initials(ownerUser.name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{ownerUser.name}</span>
                          </div>
                        )}
                      </TD>
                      <TD className="hidden md:table-cell text-sm text-ink-muted">
                        {p.startDate ? (
                          <span className="flex items-center gap-1">
                            <CalendarPlus className="h-3.5 w-3.5" />
                            {fmtDate(p.startDate, "MMM dd, yyyy")}
                          </span>
                        ) : "â€”"}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {p.dueDate ? (
                          <span className={cn(
                            "flex items-center gap-1 text-sm",
                            daysLeft !== null && daysLeft < 0 ? "text-rose-600" :
                            daysLeft !== null && daysLeft < 7 ? "text-amber-600" : "text-ink-muted"
                          )}>
                            <CalendarDays className="h-3.5 w-3.5" />
                            {fmtDate(p.dueDate, "MMM dd, yyyy")}
                          </span>
                        ) : "â€”"}
                      </TD>
                      <TD className="hidden lg:table-cell text-sm text-ink-muted">
                        {p.completedAt ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CalendarCheck className="h-3.5 w-3.5" />
                            {fmtDate(p.completedAt, "MMM dd, yyyy")}
                          </span>
                        ) : "â€”"}
                      </TD>
                      <TD className="hidden sm:table-cell">
                        {memberUsers.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {memberUsers.slice(0, 3).map((m) => (
                              <Avatar key={m.id} className="h-6 w-6 text-[10px] ring-1 ring-white">
                                <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                              </Avatar>
                            ))}
                            {memberUsers.length > 3 && (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-subtle ring-1 ring-white text-[10px] text-ink-muted">
                                +{memberUsers.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </TD>
                      {canManage && (
                        <TD>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={(e) => openEdit(p, e)}>Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem danger onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ProjectFormModal open={open} onOpenChange={setOpen} editing={editing} />
      <ProjectDetailsModal
        open={!!details}
        onOpenChange={(v) => !v && setDetails(null)}
        project={details}
        onEdit={canManage ? () => { if (details) openEdit(details); } : undefined}
      />
      <ConfirmModal
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete project?"
        description="This will permanently remove the project. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await projectService.remove(confirmDelete.id);
            toast.success("Project deleted.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}
