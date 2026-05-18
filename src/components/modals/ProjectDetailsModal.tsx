"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDataStore } from "@/store/dataStore";
import { initials } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { CalendarDays, Users, Flag, FolderKanban, Pencil } from "lucide-react";
import type { Project } from "@/types";

const STATUS_VARIANTS: Record<Project["status"], "info" | "warning" | "success" | "muted" | "danger"> = {
  planning: "info",
  in_progress: "warning",
  review: "info",
  completed: "success",
  on_hold: "muted",
};

export function ProjectDetailsModal({
  open,
  onOpenChange,
  project,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null;
  onEdit?: () => void;
}) {
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  if (!project) return null;
  const owner = users.find((u) => u.id === (project.ownerId ?? project.lead));
  const dept = departments.find((d) => d.id === project.departmentId);
  const members = (project.members ?? []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
  const progress = project.progress ?? 0;
  const daysLeft = project.dueDate
    ? Math.ceil((new Date(project.dueDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
                <FolderKanban className="h-5 w-5 text-primary" />
              </span>
              <div>
                <DialogTitle>{project.name}</DialogTitle>
                <DialogDescription>
                  <Badge variant={STATUS_VARIANTS[project.status]} className="capitalize">
                    {project.status.replace("_", " ")}
                  </Badge>
                </DialogDescription>
              </div>
            </div>
            {onEdit && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        {project.description && (
          <p className="text-sm text-ink-muted">{project.description}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-surface-border bg-surface-subtle p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
              <Flag className="h-3 w-3" /> Owner
            </div>
            <div className="mt-1 flex items-center gap-2">
              {owner && (
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={owner.avatarColor}>{initials(owner.name)}</AvatarFallback>
                </Avatar>
              )}
              <span className="text-sm">{owner?.name ?? "—"}</span>
            </div>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-subtle p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
              <CalendarDays className="h-3 w-3" /> Due date
            </div>
            <div className="mt-1 text-sm">
              {project.dueDate ? (
                <>
                  {fmtDate(project.dueDate, "MMM dd, yyyy")}
                  {daysLeft !== null && (
                    <span className={`ml-2 text-xs ${daysLeft < 0 ? "text-rose-600" : daysLeft < 7 ? "text-amber-600" : "text-ink-muted"}`}>
                      ({daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`})
                    </span>
                  )}
                </>
              ) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 sm:col-span-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
              <Users className="h-3 w-3" /> Team ({members.length})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {members.length === 0 ? (
                <span className="text-sm text-ink-muted">No team members assigned.</span>
              ) : (
                members.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 rounded-full bg-white border border-surface-border px-2 py-1">
                    <Avatar className="h-5 w-5 text-[10px]">
                      <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{m.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          {dept && (
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 sm:col-span-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-muted">Department</div>
              <div className="mt-1 text-sm">{dept.name}</div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-surface-border bg-white p-3">
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>Progress</span>
            <span className="font-medium text-ink">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
