"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Clock,
  Download,
  PlusCircle,
  Send,
  Users,
  ClipboardList,
} from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/StatCard";
import { LineChart } from "@/components/charts/LineChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layouts/PageHeader";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import type { Submission } from "@/types";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { reportService } from "@/services/report.service";
import { complianceService } from "@/services/compliance.service";

export default function AdminDashboard() {
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const submissions = useDataStore((s) => s.submissions);
  const [range, setRange] = useState("7d");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);

  const me = useAuth();
  const isManager = me?.role === "manager";
  const scopeDeptId = isManager ? (me?.departmentId ?? null) : null;

  const today = todayISO();
  const employees = users.filter(
    (u) =>
      u.isActive &&
      (u.role === "employee" || u.role === "manager") &&
      (!scopeDeptId || u.departmentId === scopeDeptId),
  );
  const employeeIds = new Set(employees.map((e) => e.id));
  const todays = submissions.filter((s) => s.date === today && employeeIds.has(s.userId));
  // Compliance counts include virtual "missing" rows; scoped to dept when manager.
  const counts = complianceService.dayCounts(today, scopeDeptId);
  const submittedToday = counts.submitted;
  const pendingToday = counts.pending;
  const missingToday = counts.missing;
  const lateToday = counts.late;
  const revisions = useDataStore((s) => s.revisions);
  const pendingRevisions = revisions.filter(
    (r) => r.status === "pending" && (!scopeDeptId || employeeIds.has(r.userId)),
  ).length;

  const days = range === "30d" ? 30 : range === "14d" ? 14 : 7;
  const lineData = useMemo(() => {
    const eIds = new Set(
      users
        .filter(
          (u) =>
            u.isActive &&
            (u.role === "employee" || u.role === "manager") &&
            (!scopeDeptId || u.departmentId === scopeDeptId),
        )
        .map((u) => u.id),
    );
    const out: { day: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const c = submissions.filter(
        (s) =>
          s.date === iso &&
          s.status !== "missing" &&
          s.status !== "pending" &&
          eIds.has(s.userId),
      ).length;
      out.push({ day: fmtDate(d, "MMM dd"), count: c });
    }
    return out;
  }, [submissions, days, scopeDeptId, users]);

  const donutData = [
    { name: "Submitted", value: submittedToday, color: "#66B2B2" },
    { name: "Pending", value: pendingToday, color: "#F59E0B" },
    { name: "Late", value: lateToday, color: "#F97316" },
    { name: "Missing", value: missingToday, color: "#EF4444" },
  ];
  const totalExpected = counts.expected || employees.length;

  const recent = [...submissions]
    .filter((s) => s.locked && employeeIds.has(s.userId))
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .slice(0, 6);

  const byDept = (scopeDeptId ? departments.filter((d) => d.id === scopeDeptId) : departments).map((d) => {
    const deptUsers = users.filter((u) => u.departmentId === d.id && u.isActive);
    const expected = deptUsers.length;
    const submitted = todays.filter(
      (s) => deptUsers.some((u) => u.id === s.userId) && s.status !== "missing" && s.status !== "pending"
    ).length;
    return { ...d, submitted, expected, pct: expected ? Math.round((submitted / expected) * 100) : 0 };
  });

  const overdueCells = complianceService
    .dayOverview(today, scopeDeptId)
    .filter((c) => c.effectiveStatus === "late" || c.effectiveStatus === "missing")
    .slice(0, 5);

  const sendReminders = () => toast.success(`Reminders sent to ${overdueCells.length} employee(s).`);
  const downloadReport = () => {
    reportService.export("daily", "csv");
    toast.success("Daily report downloaded.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isManager ? "Team Overview" : "Admin Overview"}
        description={isManager ? "Your team's compliance and today's submission status." : "Office-wide compliance, today's status, and quick actions."}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={sendReminders}><Send className="h-4 w-4" /> Send reminders</Button>
            <Button onClick={downloadReport}><Download className="h-4 w-4" /> Download report</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Total Employees" value={employees.length} sublabel="active" tint="indigo" />
        <StatCard icon={ClipboardList} label="Submitted Today" value={submittedToday} sublabel={`of ${totalExpected}`} tint="teal" />
        <StatCard icon={Clock} label="Pending" value={pendingToday} sublabel="on-track" tint="amber" />
        <StatCard icon={AlertTriangle} label="Late" value={lateToday} sublabel="past deadline" tint="rose" />
        <StatCard icon={AlertTriangle} label="Missing" value={missingToday} sublabel="no submission" tint="rose" />
        <StatCard icon={Bell} label="Revision Requests" value={pendingRevisions} sublabel="pending" tint="amber" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Submission Overview</CardTitle>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <LineChart data={lineData} xKey="day" yKey="count" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Today’s Status</CardTitle></CardHeader>
          <CardContent>
            <DonutChart data={donutData} total={totalExpected} totalLabel="Total Expected" />
            <div className="mt-3 space-y-1.5 text-sm">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Recent Submissions</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/admin/submissions">View all</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-2 px-2">
            <Table>
              <THead><TR><TH>Employee</TH><TH>Date</TH><TH>Status</TH><TH>At</TH></TR></THead>
              <TBody>
                {recent.map((s) => {
                  const u = users.find((x) => x.id === s.userId);
                  return (
                    <TR key={s.id} onClick={() => { setSelected(s); setOpen(true); }} className="cursor-pointer hover:bg-surface-subtle">
                      <TD>
                        <div className="flex items-center gap-2">
                          {u && <Avatar className="h-7 w-7"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>}
                          <span className="font-medium">{u?.name}</span>
                        </div>
                      </TD>
                      <TD>{fmtDate(s.date)}</TD>
                      <TD><StatusPill status={s.status} /></TD>
                      <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Submissions by Department</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {byDept.map((d) => (
                <li key={d.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-ink-muted">{d.submitted}/{d.expected} · {d.pct}%</span>
                  </div>
                  <Progress value={d.pct} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Overdue Submissions</CardTitle>
          <Button size="sm" onClick={sendReminders}><Bell className="h-4 w-4" /> Send reminders</Button>
        </CardHeader>
        <CardContent>
          {overdueCells.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-muted">No overdue submissions today 🎉</div>
          ) : (            <div className="overflow-x-auto -mx-2 px-2">            <Table>
              <THead><TR><TH>Employee</TH><TH>Department</TH><TH>Due</TH><TH>Status</TH></TR></THead>
              <TBody>
                {overdueCells.map((c) => {
                  const u = c.user;
                  const dept = departments.find((x) => x.id === u.departmentId);
                  const status = c.effectiveStatus!;
                  return (
                    <TR key={u.id + today}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>
                          <span>{u.name}</span>
                        </div>
                      </TD>
                      <TD>{dept?.name}</TD>
                      <TD>{fmtDate(today)}</TD>
                      <TD><StatusPill status={status} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickAction icon={Send} label="Send Reminders" tint="bg-chip-amber" onClick={sendReminders} />
            <QuickAction icon={Download} label="Download Report" tint="bg-chip-teal" onClick={downloadReport} />
            <QuickAction icon={CalendarDays} label="View Calendar" tint="bg-chip-violet" href="/calendar" />
            <QuickAction icon={isManager ? Users : PlusCircle} label={isManager ? "My Team" : "Add Employee"} tint="bg-chip-mint" href={isManager ? "/manager/employees" : "/admin/employees"} />
          </div>
        </CardContent>
      </Card>

      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />
    </div>
  );
}

function QuickAction({
  icon: Icon, label, tint, onClick, href,
}: { icon: React.ElementType; label: string; tint: string; onClick?: () => void; href?: string }) {
  const inner = (
    <div className="group flex items-center gap-3 rounded-xl border border-surface-border bg-white p-4 transition hover:border-primary hover:shadow-card">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-5 w-5 text-ink" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return <button type="button" onClick={onClick} className="text-left">{inner}</button>;
}
