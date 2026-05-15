"use client";
import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarDays, ClipboardCheck, ClipboardList, MoreVertical } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/StatCard";
import { SubmitWorkForm } from "@/components/forms/SubmitWorkForm";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { WeekStrip } from "@/components/charts/WeekStrip";
import { submissionService } from "@/services/submission.service";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { PageHeader } from "@/components/layouts/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import type { Submission } from "@/types";

export default function EmployeeDashboard() {
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => (user ? submissionService.todayStats(user.id) : null), [user, submissions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const mine = submissions.filter((s) => s.userId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const recent = mine.slice(0, 5);
  const todays = mine.find((s) => s.date === todayISO());
  const submittedDates = new Set(mine.map((s) => s.date));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]} 👋`}
        description="Here’s your daily snapshot. Submit your work and track your weekly compliance."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardCheck}
          label="Today's Status"
          value={todays ? (todays.locked ? "Submitted" : "Draft") : "Pending"}
          sublabel={todays ? fmtTime(todays.submittedAt) : "Not submitted yet"}
          tint={todays?.locked ? "teal" : "amber"}
        />
        <StatCard
          icon={CalendarDays}
          label="Current Date"
          value={fmtDate(new Date(), "MMM dd")}
          sublabel={fmtDate(new Date(), "EEEE")}
          tint="indigo"
        />
        <StatCard
          icon={ClipboardList}
          label="This Week"
          value={`${stats?.week.submitted ?? 0}/${stats?.week.expected ?? 0}`}
          sublabel="submissions"
          tint="violet"
        />
        <StatCard
          icon={CalendarCheck2}
          label="This Month"
          value={`${stats?.month.submitted ?? 0}/${stats?.month.expected ?? 0}`}
          sublabel="submissions"
          tint="mint"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Submit Daily Work</CardTitle>
          </CardHeader>
          <CardContent>
            <SubmitWorkForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Week Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekStrip submittedDates={submittedDates} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Submissions</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <a href="/my-submissions">View all</a>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="Submit your first daily work above to see it here."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Work Summary</TH>
                  <TH>Status</TH>
                  <TH>Submitted At</TH>
                  <TH className="w-10" />
                </TR>
              </THead>
              <TBody>
                {recent.map((s) => (
                  <TR key={s.id}>
                    <TD>{fmtDate(s.date)}</TD>
                    <TD className="max-w-md truncate">{s.workSummary}</TD>
                    <TD><StatusPill status={s.status} /></TD>
                    <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setSelected(s); setOpen(true); }}>View details</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />
    </div>
  );
}
