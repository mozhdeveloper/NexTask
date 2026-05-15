"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Input } from "@/components/ui/input";
import { Search, MoreVertical, Download } from "lucide-react";
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
import { downloadBlob, toCsv } from "@/lib/helpers";
import { useRequireRole } from "@/hooks/useAuth";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";
import { toast } from "sonner";

export default function AdminSubmissionsPage() {
  useRequireRole(["admin", "manager"]);
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [dept, setDept] = useState("all");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  const [unlock, setUnlock] = useState<Submission | null>(null);

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

  const exportCsv = () => {
    const data = rows.map((r) => {
      const u = users.find((x) => x.id === r.userId);
      return { Date: r.date, Employee: u?.name, Email: u?.email, Status: r.status, Summary: r.workSummary, SubmittedAt: r.submittedAt };
    });
    downloadBlob("submissions.csv", toCsv(data), "text/csv");
    toast.success("Exported submissions.csv");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Submissions"
        description="Filter, review, and act on every submission across the office."
        actions={<Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-60">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" placeholder="Search employee or summary…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus | "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="revision_requested">Revision requested</SelectItem>
                <SelectItem value="revision_approved">Revision approved</SelectItem>
                <SelectItem value="revision_rejected">Revision rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <THead><TR><TH>Employee</TH><TH>Date</TH><TH>Summary</TH><TH>Status</TH><TH>At</TH><TH /></TR></THead>
            <TBody>
              {rows.map((s) => {
                const u = users.find((x) => x.id === s.userId);
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        {u && <Avatar className="h-7 w-7"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>}
                        <span>{u?.name}</span>
                      </div>
                    </TD>
                    <TD>{fmtDate(s.date)}</TD>
                    <TD className="max-w-md truncate">{s.workSummary}</TD>
                    <TD><StatusPill status={s.status} /></TD>
                    <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setSelected(s); setOpen(true); }}>View details</DropdownMenuItem>
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
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />
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
    </div>
  );
}
