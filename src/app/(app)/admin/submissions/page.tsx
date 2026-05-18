"use client";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Input } from "@/components/ui/input";
import { Search, MoreVertical, Download, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { StatusPill } from "@/components/ui/status-pill";
import { fmtDate, fmtTime } from "@/lib/dates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { submissionService } from "@/services/submission.service";
import { workSettingsService } from "@/services/workSettings.service";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { useRequireRole } from "@/hooks/useAuth";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";
import { toast } from "sonner";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const STATUSES: SubmissionStatus[] = ["submitted", "late", "missing", "pending", "revision_requested", "revision_approved", "revision_rejected"];
const PAGE_SIZE = 20;

export default function AdminSubmissionsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const workSettings = useDataStore((s) => s.workSettings);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [dept, setDept] = useState("all");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  const [unlock, setUnlock] = useState<Submission | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<Submission | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<SubmissionStatus>("submitted");
  const [holidayDate, setHolidayDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    return submissions
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => (date ? s.date === date : true))
      .filter((s) => {
        if (dept === "all") return true;
        const u = users.find((x) => x.id === s.userId);
        return u?.departmentId === dept;
      })
      .filter((s) => {
        if (!q) return true;
        const u = users.find((x) => x.id === s.userId);
        return ((u?.name ?? "") + (u?.email ?? "") + s.workSummary).toLowerCase().includes(q.toLowerCase());
      })
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
  }, [submissions, users, status, dept, q, date]);

  // Reset to page 1 whenever filters change
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [status, dept, q, date]);

  const exportCsv = () => {
    const data = rows.map((r) => {
      const u = users.find((x) => x.id === r.userId);
      return { Date: r.date, Employee: u?.name, Email: u?.email, Status: r.status, Summary: r.workSummary, SubmittedAt: r.submittedAt };
    });
    downloadBlob("submissions.csv", toCsv(data), "text/csv");
    toast.success("Exported submissions.csv");
  };

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="All Submissions"
        description="Filter, review, and act on every submission across the office."
        actions={<Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full flex-1 min-w-0 sm:min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" placeholder="Search employee or summary…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input type="date" className="w-full sm:w-44" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus | "all")}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Holiday quick-mark banner when date filter is active */}
          {date && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-ink">
                <CalendarOff className="h-4 w-4 text-warning" />
                {workSettings.holidays.some((h) => h.date === date)
                  ? <><span className="font-medium">{date}</span> is marked as a holiday. Submissions on this day are excluded from compliance.</>
                  : <><span className="font-medium">{date}</span> — Mark this date as a non-working day (holiday) to exclude it from compliance.</>}
              </span>
              {workSettings.holidays.some((h) => h.date === date) ? (
                <Button size="sm" variant="outline" onClick={() => { workSettingsService.removeHoliday(date); toast.success("Holiday removed."); }}>
                  Remove holiday
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="border-warning text-warning hover:bg-warning/10"
                  onClick={() => setHolidayDate(date)}>
                  Mark as holiday
                </Button>
              )}
            </div>
          )}

          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Date</TH>
                <TH className="hidden sm:table-cell">Summary</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">At</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {pageRows.map((s) => {
                const u = users.find((x) => x.id === s.userId);
                const isHolidayRow = workSettings.holidays.some((h) => h.date === s.date);
                return (
                  <TR
                    key={s.id}
                    className={cn("cursor-pointer hover:bg-surface-subtle", isHolidayRow && "opacity-60")}
                    onClick={() => { setSelected(s); setOpen(true); }}
                  >
                    <TD>
                      <div className="flex items-center gap-2">
                        {u && <Avatar className="h-7 w-7"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>}
                        <span className="truncate max-w-[90px] sm:max-w-[120px]">{u?.name}</span>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{fmtDate(s.date)}</TD>
                    <TD className="hidden sm:table-cell max-w-[150px] lg:max-w-[200px] truncate">{s.workSummary}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <StatusPill status={s.status} />
                        {isHolidayRow && <span title="Holiday" className="text-[10px] bg-amber-100 text-amber-700 rounded px-1">holiday</span>}
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell text-ink-muted whitespace-nowrap">{fmtTime(s.submittedAt)}</TD>
                    <TD onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setSelected(s); setOpen(true); }}>View details</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setOverrideTarget(s); setOverrideStatus(s.status); }}>
                            Override status
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHolidayDate(s.date)}>
                            <CalendarOff className="h-4 w-4" />
                            Mark date as holiday
                          </DropdownMenuItem>
                          {s.locked && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem danger onClick={() => setUnlock(s)}>Unlock submission</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                );
              })}
              {rows.length === 0 && (
                <TR><TD colSpan={6} className="py-10 text-center text-ink-muted">No submissions match the current filters.</TD></TR>
              )}
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

      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />

      {/* Unlock confirmation */}
      <ConfirmModal
        open={!!unlock}
        onOpenChange={(v) => !v && setUnlock(null)}
        title="Unlock submission?"
        description="This will allow the employee to edit and re-upload."
        confirmLabel="Unlock"
        destructive
        onConfirm={() => {
          if (!unlock) return;
          submissionService.unlock(unlock.id);
          toast.success("Submission unlocked.");
        }}
      />

      {/* Mark holiday confirmation */}
      <ConfirmModal
        open={!!holidayDate}
        onOpenChange={(v) => !v && setHolidayDate(null)}
        title={`Mark ${holidayDate} as a holiday?`}
        description="Submissions on this date will be excluded from compliance reports and overdue calculations. You can remove it any time from Settings."
        confirmLabel="Mark as holiday"
        onConfirm={() => {
          if (!holidayDate) return;
          workSettingsService.addHoliday(holidayDate, "Holiday");
          toast.success(`${holidayDate} marked as a holiday.`);
          setHolidayDate(null);
        }}
      />

      {/* Override status modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 sm:p-6 shadow-pop space-y-4">
            <h2 className="text-base font-semibold text-ink">Override Submission Status</h2>
            <p className="text-sm text-ink-muted">
              Manually set the status for{" "}
              <span className="font-medium">{users.find((u) => u.id === overrideTarget.userId)?.name}</span>{" "}
              on {fmtDate(overrideTarget.date)}.
            </p>
            <div className="space-y-1.5">
              <Select value={overrideStatus} onValueChange={(v) => setOverrideStatus(v as SubmissionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOverrideTarget(null)}>Cancel</Button>
              <Button onClick={() => {
                submissionService.markStatus(overrideTarget.id, overrideStatus);
                toast.success("Status overridden.");
                setOverrideTarget(null);
              }}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
