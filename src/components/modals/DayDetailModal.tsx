"use client";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Users, Search, CheckCircle2, Clock3, AlertCircle } from "lucide-react";
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
import { StatusPill } from "@/components/ui/status-pill";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { initials } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Submission, User } from "@/types";

// Statuses that count as "submitted" for the progress bar.
const SUBMITTED_STATUSES = new Set([
  "submitted",
  "late",
  "locked",
  "revision_requested",
  "revision_approved",
  "revision_rejected",
]);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The date being displayed. */
  date: Date | null;
  /** All employees in scope for the viewer (role-scoped before passing in). */
  scopedEmployees: User[];
  /** All submissions from the store (unfiltered — we filter by date inside). */
  submissions: Submission[];
  /** Total active employees across the whole company (for the global count badge). */
  totalEmployees: number;
}

export function DayDetailModal({
  open,
  onOpenChange,
  date,
  scopedEmployees,
  submissions,
  totalEmployees,
}: Props) {
  const [q, setQ] = useState("");
  const [viewSub, setViewSub] = useState<Submission | null>(null);

  const iso = date ? format(date, "yyyy-MM-dd") : null;

  // Submissions for this date keyed by userId.
  const subByUser = useMemo(() => {
    if (!iso) return new Map<string, Submission>();
    const m = new Map<string, Submission>();
    submissions.filter((s) => s.date === iso).forEach((s) => m.set(s.userId, s));
    return m;
  }, [iso, submissions]);

  // Global submitted count (all employees, not just scoped).
  const globalSubmittedCount = useMemo(() => {
    if (!iso) return 0;
    return submissions.filter(
      (s) => s.date === iso && SUBMITTED_STATUSES.has(s.status)
    ).length;
  }, [iso, submissions]);

  // Rows: scoped employees enriched with their submission (or undefined).
  const rows = useMemo(() => {
    const lower = q.toLowerCase();
    return scopedEmployees
      .filter((u) => !lower || u.name.toLowerCase().includes(lower))
      .map((u) => ({ user: u, sub: subByUser.get(u.id) }))
      .sort((a, b) => {
        // submitted first, then pending/no-sub, then alphabetical within group
        const aScore = a.sub ? (SUBMITTED_STATUSES.has(a.sub.status) ? 0 : 1) : 2;
        const bScore = b.sub ? (SUBMITTED_STATUSES.has(b.sub.status) ? 0 : 1) : 2;
        if (aScore !== bScore) return aScore - bScore;
        return a.user.name.localeCompare(b.user.name);
      });
  }, [scopedEmployees, subByUser, q]);

  const submittedInScope = rows.filter((r) => r.sub && SUBMITTED_STATUSES.has(r.sub.status)).length;
  const totalInScope = scopedEmployees.length;
  const pct = totalInScope > 0 ? Math.round((submittedInScope / totalInScope) * 100) : 0;

  if (!date) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-surface-border">
            <DialogTitle className="flex items-center gap-2">
              <span>{format(date, "EEEE, MMMM d, yyyy")}</span>
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1">
                {/* Global progress summary */}
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
                  <span className={cn(
                    "font-semibold",
                    pct === 100
                      ? "text-emerald-600"
                      : pct >= 50
                        ? "text-amber-600"
                        : "text-rose-600"
                  )}>
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct === 100
                        ? "bg-emerald-500"
                        : pct >= 50
                          ? "bg-amber-400"
                          : "bg-rose-400"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          {scopedEmployees.length > 6 && (
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search employee…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Employee list */}
          <ul className="flex-1 overflow-y-auto divide-y divide-surface-border px-0">
            {rows.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-12 text-center text-ink-muted">
                <Users className="h-7 w-7 opacity-30" />
                <p className="text-sm">No employees found.</p>
              </li>
            )}
            {rows.map(({ user, sub }) => (
              <li
                key={user.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle/60 transition-colors"
              >
                {/* Avatar */}
                <Avatar className="h-8 w-8 flex-shrink-0 text-xs">
                  <AvatarFallback className={user.avatarColor}>{initials(user.name)}</AvatarFallback>
                </Avatar>

                {/* Name + status */}
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

                {/* Status icon shorthand + view */}
                <div className="flex flex-shrink-0 items-center gap-2">
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-ink-muted hover:text-ink"
                      onClick={() => setViewSub(sub)}
                    >
                      View
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Footer */}
          <div className="border-t border-surface-border px-5 py-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drill-down into individual submission */}
      <SubmissionDetailsModal
        open={!!viewSub}
        onOpenChange={(v) => !v && setViewSub(null)}
        submission={viewSub}
      />
    </>
  );
}
