"use client";
import { useMemo, useState } from "react";
import { Plus, MoreVertical, Search, LayoutGrid, List, CalendarDays, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

const STATUS_VARIANTS: Record<Project["status"], "info" | "warning" | "success" | "muted" | "danger"> = {
  planning: "info",
  in_progress: "warning",
  review: "info",
  completed: "success",
  on_hold: "muted",
};

const STATUS_LABEL: Record<Project["status"], string> = {
  planning: "Planning",
  in_progress: "In progress",
  review: "Review",
  completed: "Completed",
  on_hold: "On hold",
};

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
        .filter((p) => (status === "all" ? true : p.status === status))
        .filter((p) => (owner === "all" ? true : (p.ownerId ?? p.lead) === owner))
        .filter((p) => (q ? (p.name + (p.description ?? "")).toLowerCase().includes(q.toLowerCase()) : true)),
    [projects, q, status, owner]
  );

  const stats = useMemo(() => {
    const byStatus: Record<Project["status"], number> = {
      planning: 0, in_progress: 0, review: 0, completed: 0, on_hold: 0,
    };
    projects.forEach((p) => byStatus[p.status]++);
    return byStatus;
  }, [projects]);

  if (!ready) return null;

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

      {/* Stats bar */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(STATUS_LABEL) as Project["status"][]).map((s) => (
          <Card key={s}>
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <div>
                <div className="text-xs text-ink-muted">{STATUS_LABEL[s]}</div>
                <div className="text-xl font-semibold">{stats[s]}</div>
              </div>
              <Badge variant={STATUS_VARIANTS[s]} className="capitalize">{s.replace("_", " ")}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap p-3">
          <div className="relative w-full flex-1 min-w-0 sm:min-w-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input className="pl-9" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as Project["status"][]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
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
          <div className="flex gap-1 rounded-md border border-surface-border p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", view === "grid" ? "bg-primary text-white" : "text-ink-muted")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", view === "list" ? "bg-primary text-white" : "text-ink-muted")}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState title="No projects" description="Adjust your filters or create a new project." />
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const ownerUser = users.find((u) => u.id === (p.ownerId ?? p.lead));
            const memberUsers = (p.members ?? []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
            const progress = p.progress ?? 0;
            const daysLeft = p.dueDate ? Math.ceil((new Date(p.dueDate).getTime() - Date.now()) / 86400000) : null;
            return (
              <Card
                key={p.id}
                className="flex h-full cursor-pointer flex-col transition hover:shadow-card"
                onClick={() => setDetails(p)}
              >
                <div className={cn(
                  "h-2 rounded-t-xl",
                  p.status === "completed" ? "bg-emerald-500" :
                  p.status === "in_progress" ? "bg-amber-500" :
                  p.status === "on_hold" ? "bg-ink-soft" :
                  "bg-primary"
                )} />
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{p.description}</p>
                    </div>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDetails(p); }}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(p); setOpen(true); }}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem danger onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[p.status]} className="capitalize">{STATUS_LABEL[p.status]}</Badge>
                    {p.dueDate && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs",
                        daysLeft !== null && daysLeft < 0 ? "text-rose-600" : daysLeft !== null && daysLeft < 7 ? "text-amber-600" : "text-ink-muted"
                      )}>
                        <CalendarDays className="h-3 w-3" />
                        {fmtDate(p.dueDate, "MMM dd")}
                        {daysLeft !== null && daysLeft < 0 && ` · ${Math.abs(daysLeft)}d overdue`}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-ink-muted">
                      <span>Progress</span><span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ownerUser && <Avatar className="h-7 w-7"><AvatarFallback className={ownerUser.avatarColor}>{initials(ownerUser.name)}</AvatarFallback></Avatar>}
                      <span className="text-sm truncate">{ownerUser?.name}</span>
                    </div>
                    {memberUsers.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-ink-muted">
                        <Users className="h-3 w-3" />
                        <div className="flex -space-x-1.5">
                          {memberUsers.slice(0, 3).map((m) => (
                            <Avatar key={m.id} className="h-5 w-5 text-[9px] ring-1 ring-white">
                              <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        {memberUsers.length > 3 && <span>+{memberUsers.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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
                  <TH className="hidden sm:table-cell">Owner</TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Due</TH>
                  <TH className="w-32">Progress</TH>
                  {canManage && <TH />}
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const ownerUser = users.find((u) => u.id === (p.ownerId ?? p.lead));
                  const progress = p.progress ?? 0;
                  return (
                    <TR
                      key={p.id}
                      className="cursor-pointer hover:bg-surface-subtle"
                      onClick={() => setDetails(p)}
                    >
                      <TD>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-ink-muted line-clamp-1">{p.description}</div>
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          {ownerUser && <Avatar className="h-6 w-6"><AvatarFallback className={ownerUser.avatarColor}>{initials(ownerUser.name)}</AvatarFallback></Avatar>}
                          <span className="text-sm">{ownerUser?.name}</span>
                        </div>
                      </TD>
                      <TD><Badge variant={STATUS_VARIANTS[p.status]} className="capitalize">{STATUS_LABEL[p.status]}</Badge></TD>
                      <TD className="hidden md:table-cell text-sm text-ink-muted">{p.dueDate ? fmtDate(p.dueDate, "MMM dd") : "—"}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="flex-1" />
                          <span className="text-xs tabular-nums text-ink-muted">{progress}%</span>
                        </div>
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
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(p); setOpen(true); }}>Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem danger onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}>Delete</DropdownMenuItem>
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
        onEdit={canManage ? () => { if (details) { setEditing(details); setDetails(null); setOpen(true); } } : undefined}
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
          }
        }}
      />
    </div>
  );
}
