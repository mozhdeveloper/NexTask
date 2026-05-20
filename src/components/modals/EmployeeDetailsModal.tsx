"use client";
import { useMemo, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useDataStore } from "@/store/dataStore";
import { initials } from "@/lib/status";
import { fmtDate, fmtTime } from "@/lib/dates";
import { Mail, Briefcase, Building2, CalendarDays, Pencil, X } from "lucide-react";
import type { User, Submission } from "@/types";
import { SubmissionDetailsModal } from "./SubmissionDetailsModal";

export function EmployeeDetailsModal({
  open,
  onOpenChange,
  user,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User | null;
  onEdit?: () => void;
}) {
  const departments = useDataStore((s) => s.departments);
  const submissions = useDataStore((s) => s.submissions);
  const [picked, setPicked] = useState<Submission | null>(null);
  const [pickedOpen, setPickedOpen] = useState(false);

  const dept = useMemo(
    () => (user ? departments.find((d) => d.id === user.departmentId) : null),
    [user, departments]
  );
  const mine = useMemo(
    () =>
      user
        ? submissions
            .filter((s) => s.userId === user.id)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [user, submissions]
  );
  const totalSubmitted = mine.filter((s) => s.locked).length;
  const last30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return mine.filter((s) => new Date(s.date) >= cutoff);
  }, [mine]);
  const submittedLast30 = last30.filter((s) => s.status !== "missing" && s.status !== "pending").length;
  const revisedLast30 = last30.filter((s) => s.status === "revised").length;
  const compliancePct = last30.length ? Math.round((submittedLast30 / last30.length) * 100) : 0;
  const recent = mine.slice(0, 6);

  if (!user) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideClose className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 text-base">
                  <AvatarFallback className={user.avatarColor}>{initials(user.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle>{user.name}</DialogTitle>
                  <DialogDescription className="capitalize">{user.role}</DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {user.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
                {onEdit && (
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                <DialogClose asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground" aria-label="Close">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                <Mail className="h-3 w-3" /> Email
              </div>
              <div className="mt-1 truncate">{user.email}</div>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                <Briefcase className="h-3 w-3" /> Job title
              </div>
              <div className="mt-1">{user.jobTitle ?? <span className="text-ink-muted">—</span>}</div>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                <Building2 className="h-3 w-3" /> Department
              </div>
              <div className="mt-1">{dept?.name ?? <span className="text-ink-muted">—</span>}</div>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                <CalendarDays className="h-3 w-3" /> Joined
              </div>
              <div className="mt-1">{fmtDate(user.createdAt)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-surface-border bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Last 30 days compliance</span>
              <span className="text-ink-muted">{submittedLast30}/{last30.length} · {compliancePct}%</span>
            </div>
            <Progress value={compliancePct} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-lg font-semibold">{totalSubmitted}</div>
                <div className="text-ink-muted">Total submitted</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{submittedLast30}</div>
                <div className="text-ink-muted">Submitted (30d)</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-sky-600">{revisedLast30}</div>
                <div className="text-ink-muted">Revised (30d)</div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-muted">Recent submissions</div>
            {recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-4 text-center text-sm text-ink-muted">
                No submissions yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR><TH>Date</TH><TH>Summary</TH><TH>Status</TH><TH className="hidden sm:table-cell">At</TH></TR>
                  </THead>
                  <TBody>
                    {recent.map((s) => (
                      <TR
                        key={s.id}
                        className="cursor-pointer hover:bg-surface-subtle"
                        onClick={() => { setPicked(s); setPickedOpen(true); }}
                      >
                        <TD className="whitespace-nowrap">{fmtDate(s.date)}</TD>
                        <TD className="max-w-[180px] truncate">{s.workSummary}</TD>
                        <TD><StatusPill status={s.status} /></TD>
                        <TD className="hidden sm:table-cell text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <SubmissionDetailsModal open={pickedOpen} onOpenChange={setPickedOpen} submission={picked} />
    </>
  );
}
