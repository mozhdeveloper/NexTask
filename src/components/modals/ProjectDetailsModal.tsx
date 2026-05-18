"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "@/hooks/useAuth";
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
  MessageSquarePlus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { projectService } from "@/services/project.service";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  Project["status"],
  { label: string; dot: string; bg: string; text: string; border: string; stripe: string; badgeVariant: string }
> = {
  planning:    { label: "Planning",    dot: "bg-blue-500",    bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",   stripe: "bg-blue-500",    badgeVariant: "info"    },
  in_progress: { label: "In Progress", dot: "bg-amber-500",   bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",  stripe: "bg-amber-500",   badgeVariant: "warning" },
  review:      { label: "In Review",   dot: "bg-violet-500",  bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200", stripe: "bg-violet-500",  badgeVariant: "info"    },
  completed:   { label: "Completed",   dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",stripe: "bg-emerald-500", badgeVariant: "success" },
  on_hold:     { label: "On Hold",     dot: "bg-slate-400",   bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",  stripe: "bg-slate-400",   badgeVariant: "muted"   },
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
  const currentUser = useAuth();
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [loading, setLoading] = useState(false);

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

  const dueDateColor =
    daysLeft !== null
      ? daysLeft < 0
        ? "text-rose-600"
        : daysLeft < 7
        ? "text-amber-600"
        : "text-foreground"
      : "text-foreground";

  function InfoCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border bg-background">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="mt-0.5">{children}</div>
        </div>
      </div>
    );
  }

  async function handleRequestRevision() {
    setLoading(true);
    try {
      await projectService.requestRevision(project!.id, revisionNote.trim() || undefined);
      toast.success("Revision request submitted.");
      setRevisionMode(false);
      setRevisionNote("");
    } catch {
      toast.error("Failed to submit revision request.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewRevision(verdict: "approved" | "rejected") {
    setLoading(true);
    try {
      await projectService.reviewRevision(project!.id, verdict);
      toast.success(`Revision ${verdict}.`);
    } catch {
      toast.error("Failed to update revision.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* Status colour stripe */}
        <div className={cn("h-1 w-full flex-shrink-0 rounded-t-lg", sc.stripe)} />

        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <DialogHeader className="flex-1 space-y-1">
              <DialogTitle className="text-xl font-semibold leading-snug">{project.name}</DialogTitle>
              {project.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
              )}
            </DialogHeader>
            {onEdit && (
              <Button size="sm" variant="outline" onClick={onEdit} className="flex-shrink-0 gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>

          {/* Status + department + revision badge */}
          <div className="mt-3 flex flex-wrap items-center gap-2 px-6">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                sc.bg, sc.text, sc.border
              )}
            >
              <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", sc.dot)} />
              {sc.label}
            </span>
            {dept && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {dept.name}
              </span>
            )}
            {project.revisionStatus === "pending" && (
              <Badge variant="warning" className="text-xs">Revision Requested</Badge>
            )}
            {project.revisionStatus === "approved" && (
              <Badge variant="success" className="text-xs">Revision Approved</Badge>
            )}
            {project.revisionStatus === "rejected" && (
              <Badge variant="muted" className="text-xs">Revision Rejected</Badge>
            )}
          </div>

          <div className="mt-4 border-t" />

          {/* Info grid */}
          <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
            <InfoCard icon={<Flag className="h-3.5 w-3.5 text-muted-foreground" />} label="Owner">
              {owner ? (
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5 text-[9px]">
                    <AvatarFallback className={owner.avatarColor}>{initials(owner.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{owner.name}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not assigned</span>
              )}
            </InfoCard>

            <InfoCard icon={<CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />} label="Start Date">
              <span className="text-sm font-medium">
                {project.startDate ? fmtDate(project.startDate, "MMM dd, yyyy") : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </span>
            </InfoCard>

            <InfoCard icon={<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />} label="Due Date">
              {project.dueDate ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("text-sm font-medium", dueDateColor)}>
                    {fmtDate(project.dueDate, "MMM dd, yyyy")}
                  </span>
                  {daysLeft !== null && (
                    <Badge
                      variant={daysLeft < 0 ? "danger" : daysLeft < 7 ? "warning" : "muted"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {daysLeft < 0
                        ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                        ? "Due today"
                        : `${daysLeft}d left`}
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </InfoCard>

            <InfoCard icon={<CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />} label="Completed">
              <span className="text-sm font-medium">
                {project.completedAt ? (
                  <span className="text-emerald-600">{fmtDate(project.completedAt, "MMM dd, yyyy")}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </span>
            </InfoCard>

            <InfoCard icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />} label="Created">
              <span className="text-sm font-medium">
                {fmtDate(project.createdAt, "MMM dd, yyyy")}
              </span>
            </InfoCard>
          </div>

          {/* Team members */}
          <div className="px-6 pb-6">
            <div className="mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Team ({members.length} {members.length === 1 ? "member" : "members"})
              </span>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 shadow-sm"
                  >
                    <Avatar className="h-5 w-5 text-[9px]">
                      <AvatarFallback className={m.avatarColor}>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium">{m.name}</span>
                    {m.jobTitle && (
                      <span className="text-[10px] text-muted-foreground">{m.jobTitle}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 flex-col gap-3 border-t bg-muted/20 px-6 py-4">
          {/* Employee: revision request form */}
          {currentUser?.role === "employee" && revisionMode && (
            <div className="flex flex-col gap-2">
              <textarea
                className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe why you're requesting a revision…"
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setRevisionMode(false); setRevisionNote(""); }}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!revisionNote.trim() || loading} onClick={handleRequestRevision}>
                  Submit Request
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Employee: request revision button */}
              {currentUser?.role === "employee" && !revisionMode && project.revisionStatus !== "pending" && (
                <Button variant="outline" size="sm" onClick={() => setRevisionMode(true)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Request Revision
                </Button>
              )}
              {/* Manager / Admin: approve or reject pending revision */}
              {(currentUser?.role === "manager" || currentUser?.role === "admin") && project.revisionStatus === "pending" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    disabled={loading}
                    onClick={() => handleReviewRevision("approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    disabled={loading}
                    onClick={() => handleReviewRevision("rejected")}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}