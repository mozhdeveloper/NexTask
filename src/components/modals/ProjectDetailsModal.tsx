"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDataStore } from "@/store/dataStore";
import { initials } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import {
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  Users,
  Flag,
  Building2,
  Pencil,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

const STATUS_CONFIG: Record<
  Project["status"],
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  planning:    { label: "Planning",    dot: "bg-blue-500",    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  in_progress: { label: "In Progress", dot: "bg-amber-500",   bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  review:      { label: "In Review",   dot: "bg-violet-500",  bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  completed:   { label: "Completed",   dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  on_hold:     { label: "On Hold",     dot: "bg-slate-400",   bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200" },
};

const STRIPE_COLOR: Record<Project["status"], string> = {
  planning:    "bg-blue-500",
  in_progress: "bg-amber-500",
  review:      "bg-violet-500",
  completed:   "bg-emerald-500",
  on_hold:     "bg-slate-400",
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

  const sc = STATUS_CONFIG[project.status];
  const owner = users.find((u) => u.id === (project.ownerId ?? project.lead));
  const dept = departments.find((d) => d.id === project.departmentId);
  const members = (project.members ?? [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean) as typeof users;

  const daysLeft = project.dueDate
    ? Math.ceil((new Date(project.dueDate).getTime() - Date.now()) / 86400000)
    : null;

  const dueDateUrgency =
    daysLeft !== null
      ? daysLeft < 0
        ? "text-rose-600"
        : daysLeft < 7
        ? "text-amber-600"
        : "text-ink-muted"
      : "text-ink-muted";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full p-0 sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Status accent stripe */}
        <div className={cn("h-1.5 w-full rounded-t-lg flex-shrink-0", STRIPE_COLOR[project.status])} />

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 space-y-5">
          {/* Header */}
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl leading-snug">{project.name}</DialogTitle>
                {project.description && (
                  <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">{project.description}</p>
                )}
              </div>
              {onEdit && (
                <Button size="sm" variant="outline" onClick={onEdit} className="flex-shrink-0">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Status badge â€” prominent */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                sc.bg, sc.text, sc.border
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", sc.dot)} />
              {sc.label}
            </span>
            {dept && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Building2 className="h-3.5 w-3.5" />
                {dept.name}
              </span>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Owner */}
            <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-surface-border">
                <Flag className="h-4 w-4 text-ink-soft" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Owner</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {owner && (
                    <Avatar className="h-5 w-5 text-[9px]">
                      <AvatarFallback className={owner.avatarColor}>{initials(owner.name)}</AvatarFallback>
                    </Avatar>
                  )}
                  <span className="text-sm font-medium truncate">{owner?.name ?? "â€”"}</span>
                </div>
              </div>
            </div>

            {/* Start date */}
            <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-surface-border">
                <CalendarPlus className="h-4 w-4 text-ink-soft" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Start date</p>
                <p className="mt-0.5 text-sm font-medium">
                  {project.startDate ? fmtDate(project.startDate, "MMM dd, yyyy") : "â€”"}
                </p>
              </div>
            </div>

            {/* Due date */}
            <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-surface-border">
                <CalendarDays className="h-4 w-4 text-ink-soft" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Due date</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={cn("text-sm font-medium", dueDateUrgency)}>
                    {project.dueDate ? fmtDate(project.dueDate, "MMM dd, yyyy") : "â€”"}
                  </span>
                  {daysLeft !== null && project.dueDate && (
                    <span className={cn("text-xs", dueDateUrgency)}>
                      {daysLeft < 0
                        ? `Â· ${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                        ? "Â· Due today"
                        : `Â· ${daysLeft}d left`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Completion date */}
            <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-surface-border">
                <CalendarCheck className="h-4 w-4 text-ink-soft" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Completed</p>
                <p className="mt-0.5 text-sm font-medium">
                  {project.completedAt ? fmtDate(project.completedAt, "MMM dd, yyyy") : "â€”"}
                </p>
              </div>
            </div>

            {/* Created */}
            <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3 sm:col-span-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-surface-border">
                <Clock className="h-4 w-4 text-ink-soft" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Created</p>
                <p className="mt-0.5 text-sm font-medium">
                  {fmtDate(project.createdAt, "MMM dd, yyyy")}
                </p>
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
              <Users className="h-3.5 w-3.5" />
              Team Â· {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-ink-muted">No team members assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-2.5 py-1"
                  >
                    <Avatar className="h-5 w-5 text-[9px]">
                      <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium">{m.name}</span>
                    {m.jobTitle && (
                      <span className="text-[10px] text-ink-muted">{m.jobTitle}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-surface-border pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
