"use client";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Users, Search, CheckCircle2, Clock3, AlertCircle, ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { submissionService } from "@/services/submission.service";
import { initials } from "@/lib/status";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Submission, User, Department } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";

// --- constants -------------------------------------------------------------
const SUBMITTED_STATUSES = new Set<SubmissionStatus>([
  "submitted", "late", "locked",
  "revision_requested", "revision_approved", "revision_rejected",
]);

const ALL_STATUSES: SubmissionStatus[] = [
  "submitted", "late", "pending", "missing",
  "revision_requested", "revision_approved", "revision_rejected", "excused",
];

// Status filter options for the Select dropdown
const STATUS_FILTER_OPTIONS: Array<{ value: SubmissionStatus | "all" | "missing"; label: string }> = [
  { value: "all",                label: "All statuses" },
  { value: "submitted",          label: "Submitted" },
  { value: "late",               label: "Late" },
  { value: "pending",            label: "Pending" },
  { value: "missing",            label: "No submission" },
  { value: "revision_requested", label: "Revision Requested" },
];

// --- EmployeeRow -----------------------------------------------------------
function EmployeeRow({
  user, sub, canOverride, onView, onStatusChanged,
}: {
  user: User;
  sub: Submission | undefined;
  canOverride: boolean;
  onView: (s: Submission) => void;
  onStatusChanged: () => void;
}) {
  const [overriding, setOverriding] = useState(false);
  const [newStatus, setNewStatus] = useState<SubmissionStatus>(sub?.status ?? "submitted");

  const applyOverride = () => {
    if (!sub) return;
    try {
      submissionService.markStatus(sub.id, newStatus);
      toast.success(`Status updated to "${newStatus.replace(/_/g, " ")}".`);
      onStatusChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setOverriding(false);
  };

  return (
    <li className="flex flex-col gap-1.5 px-5 py-3 hover:bg-surface-subtle/50 transition-colors">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0 text-xs">
          <AvatarFallback className={user.avatarColor}>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          {sub ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <StatusPill status={sub.status} />
              {sub.submittedAt && (
                <span className="text-xs text-ink-soft">
                  {format(new Date(sub.submittedAt), "h:mm a")}
                </span>
              )}
            </div>
          ) : (
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-soft">
              <AlertCircle className="h-3 w-3 text-rose-400" />
              No submission
            </span>
          )}
          {sub?.workSummary && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">{sub.workSummary}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {sub ? (
            SUBMITTED_STATUSES.has(sub.status) ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Clock3 className="h-4 w-4 text-amber-400" />
            )
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          )}
          {sub && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-muted hover:text-ink"
              onClick={() => onView(sub)}>
              View
            </Button>
          )}
          {canOverride && sub && (
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0 text-ink-muted hover:text-ink"
              title="Change status"
              onClick={() => { setNewStatus(sub.status); setOverriding((v) => !v); }}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {overriding && canOverride && sub && (
        <div className="ml-11 flex items-center gap-2 rounded-lg border border-surface-border bg-surface-subtle/60 p-2">
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as SubmissionStatus)}>
            <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={applyOverride}>Apply</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOverriding(false)}>&#x2715;</Button>
        </div>
      )}
    </li>
  );
}

// --- DayDetailModal --------------------------------------------------------
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: Date | null;
  scopedEmployees: User[];
  submissions: Submission[];
  totalEmployees: number;
  canOverride: boolean;
  departments: Department[];
}

export function DayDetailModal({
  open, onOpenChange, date, scopedEmployees, submissions,
  totalEmployees, canOverride, departments,
}: Props) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "all" | "missing">("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [viewSub, setViewSub] = useState<Submission | null>(null);
  const [tick, setTick] = useState(0);

  const iso = date ? format(date, "yyyy-MM-dd") : null;

  const subByUser = useMemo(() => {
    if (!iso) return new Map<string, Submission>();
    const m = new Map<string, Submission>();
    submissions.filter((s) => s.date === iso).forEach((s) => m.set(s.userId, s));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, submissions, tick]);

  const globalSubmittedCount = useMemo(() => {
    if (!iso) return 0;
    return submissions.filter((s) => s.date === iso && SUBMITTED_STATUSES.has(s.status)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, submissions, tick]);

  const rows = useMemo(() => {
    const lower = q.toLowerCase();
    return scopedEmployees
      .filter((u) => !lower || u.name.toLowerCase().includes(lower))
      .filter((u) => deptFilter === "all" || u.departmentId === deptFilter)
      .map((u) => ({ user: u, sub: subByUser.get(u.id) }))
      .filter(({ sub }) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "missing") return !sub;
        return sub?.status === statusFilter;
      })
      .sort((a, b) => {
        const aS = a.sub ? (SUBMITTED_STATUSES.has(a.sub.status) ? 0 : 1) : 2;
        const bS = b.sub ? (SUBMITTED_STATUSES.has(b.sub.status) ? 0 : 1) : 2;
        if (aS !== bS) return aS - bS;
        return a.user.name.localeCompare(b.user.name);
      });
  }, [scopedEmployees, subByUser, q, statusFilter, deptFilter]);

  const submittedInScope = scopedEmployees.filter(
    (u) => { const s = subByUser.get(u.id); return s && SUBMITTED_STATUSES.has(s.status); }
  ).length;
  const pct = totalEmployees > 0 ? Math.round((globalSubmittedCount / totalEmployees) * 100) : 0;

  if (!date) return null;

  const handleClose = (v: boolean) => {
    if (!v) { setQ(""); setStatusFilter("all"); setDeptFilter("all"); }
    onOpenChange(v);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">

          {/* Header */}
          <DialogHeader className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-surface-border">
            <DialogTitle>{format(date, "EEEE, MMMM d, yyyy")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      <span className="font-semibold text-ink">{globalSubmittedCount}</span>
                      {" / "}
                      <span className="font-semibold text-ink">{totalEmployees}</span>
                      {" employees submitted"}
                    </span>
                  </span>
                  <span className={cn("font-semibold",
                    pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600")}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div className={cn("h-full rounded-full transition-all",
                    pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400")}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex-shrink-0 border-b border-surface-border px-4 py-2.5 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search employee..."
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter as string}
                onValueChange={(v) => setStatusFilter(v as SubmissionStatus | "all" | "missing")}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departments.length > 1 && (
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="All depts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All depts</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="text-[11px] text-ink-soft">
              {rows.length} of {scopedEmployees.length} shown
              {submittedInScope > 0 && (
                <> &middot; <span className="text-emerald-600 font-medium">{submittedInScope} submitted in scope</span></>
              )}
            </p>
          </div>

          {/* Employee list */}
          <ul className="flex-1 overflow-y-auto divide-y divide-surface-border">
            {rows.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-12 text-center text-ink-muted">
                <Users className="h-7 w-7 opacity-30" />
                <p className="text-sm">No employees match these filters.</p>
              </li>
            )}
            {rows.map(({ user, sub }) => (
              <EmployeeRow
                key={user.id}
                user={user}
                sub={sub}
                canOverride={canOverride}
                onView={setViewSub}
                onStatusChanged={() => setTick((t) => t + 1)}
              />
            ))}
          </ul>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-surface-border px-5 py-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <SubmissionDetailsModal
        open={!!viewSub}
        onOpenChange={(v) => !v && setViewSub(null)}
        submission={viewSub}
      />
    </>
  );
}
