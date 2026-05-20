"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth, useRequireRole } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtTime } from "@/lib/dates";
import { StatusPill } from "@/components/ui/status-pill";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MoreVertical, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { RevisionRequestModal } from "@/components/modals/RevisionRequestModal";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 20;

export default function MySubmissionsPage() {
  const { ready } = useRequireRole(["employee"]);
  const user = useAuth();
  const router = useRouter();
  const submissions = useDataStore((s) => s.submissions);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [revFor, setRevFor] = useState<string>("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    if (!user) return [];
    return submissions
      .filter((s) => s.userId === user.id)
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => (q ? (s.workSummary + " " + s.tasksDetails).toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [user, submissions, status, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q, status]);

  const exportCsv = () => {
    const data = rows.map((r) => ({
      Date: r.date,
      Summary: r.workSummary,
      Status: r.status,
      Submitted: r.submittedAt,
      Version: r.versionNumber,
      Locked: r.locked,
    }));
    downloadBlob("my_submissions.csv", toCsv(data), "text/csv");
  };

  if (!ready || !user) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Submissions"
        description="A historical view of every submission you’ve made."
        actions={<Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-60">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" placeholder="Search summary or details…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus | "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="revised">Revised</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="revision_requested">Revision requested</SelectItem>
                <SelectItem value="revision_approved">Revision approved</SelectItem>
                <SelectItem value="revision_rejected">Revision rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Nothing matches" description="Try adjusting your search or filter." />
          ) : (
            <Table>
              <THead><TR><TH>Date</TH><TH>Summary</TH><TH>Status</TH><TH>Submitted</TH><TH>v</TH><TH /></TR></THead>
              <TBody>
                {pageRows.map((s) => (
                  <TR key={s.id}>
                    <TD>{fmtDate(s.date)}</TD>
                    <TD className="max-w-md truncate">{s.workSummary}</TD>
                    <TD><StatusPill status={s.status} /></TD>
                    <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                    <TD className="text-ink-muted">v{s.versionNumber}</TD>
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setSelected(s); setOpen(true); }}>View details</DropdownMenuItem>
                          {s.status === "revision_approved" && !s.locked && (
                            <DropdownMenuItem onClick={() => router.push(`/my-work?date=${s.date}`)}>
                              Re-upload revised submission
                            </DropdownMenuItem>
                          )}
                          {s.locked && !["revision_requested","revision_rejected","revision_approved"].includes(s.status) && (
                            <DropdownMenuItem onClick={() => { setRevFor(s.id); setRevOpen(true); }}>Request revision</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
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
      <RevisionRequestModal open={revOpen} onOpenChange={setRevOpen} submissionId={revFor} />
    </div>
  );
}
