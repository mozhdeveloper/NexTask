"use client";
import { useState } from "react";
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  UserCheck,
  Building2,
  Database,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { ExportReportModal } from "@/components/modals/ExportReportModal";
import type { ReportType } from "@/services/report.service";
import { useRequireRole } from "@/hooks/useAuth";

const reports: Array<{ type: ReportType; title: string; description: string; icon: React.ElementType; tint: string }> = [
  { type: "daily", title: "Daily Submissions", description: "Today’s submissions with status, author, and timestamp.", icon: CalendarDays, tint: "bg-chip-teal" },
  { type: "late", title: "Late Submissions", description: "Submissions that came in after the deadline.", icon: Clock, tint: "bg-chip-amber" },
  { type: "missing", title: "Missing Submissions", description: "Employees who haven’t submitted today.", icon: AlertTriangle, tint: "bg-chip-rose" },
  { type: "employee_compliance", title: "Employee Compliance", description: "Per-employee submission rate this month.", icon: UserCheck, tint: "bg-chip-violet" },
  { type: "department_compliance", title: "Department Compliance", description: "Roll-up by department.", icon: Building2, tint: "bg-chip-indigo" },
  { type: "backup_history", title: "Backup History", description: "All backup runs with status and metadata.", icon: Database, tint: "bg-chip-mint" },
];

export default function ReportsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const [picked, setPicked] = useState<ReportType | null>(null);
  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Generate and export compliance reports for the office." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.type} className="transition hover:shadow-card">
            <CardContent>
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${r.tint}`}>
                  <r.icon className="h-5 w-5 text-ink" />
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{r.title}</div>
                  <p className="mt-1 text-sm text-ink-muted">{r.description}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={() => setPicked(r.type)}>
                  <Download className="h-4 w-4" /> Export
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {picked && (
        <ExportReportModal open={!!picked} onOpenChange={(v) => !v && setPicked(null)} type={picked} />
      )}
    </div>
  );
}
