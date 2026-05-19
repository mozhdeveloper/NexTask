"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Clock, AlertTriangle, UserCheck, Building2, Database,
  Download, FileSpreadsheet, FileText, FileType2, Eye, Sparkles,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useRequireRole } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { reportService, type ReportType, type ExportFormat, type ScopeKind, type ReportScope } from "@/services/report.service";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ReportMeta = {
  type: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  tint: string;
};

const REPORTS: ReportMeta[] = [
  { type: "daily", title: "Daily Submissions", description: "Submissions with status, author, and timestamp.", icon: CalendarDays, tint: "bg-chip-teal text-teal-700" },
  { type: "late", title: "Late Submissions", description: "Submissions that came in after the deadline.", icon: Clock, tint: "bg-chip-amber text-amber-700" },
  { type: "missing", title: "Missing Submissions", description: "Employees who haven't submitted on working days.", icon: AlertTriangle, tint: "bg-chip-rose text-rose-700" },
  { type: "employee_compliance", title: "Employee Compliance", description: "Per-employee submission rate.", icon: UserCheck, tint: "bg-chip-violet text-violet-700" },
  { type: "department_compliance", title: "Department Compliance", description: "Roll-up by department.", icon: Building2, tint: "bg-chip-indigo text-indigo-700" },
  { type: "backup_history", title: "Backup History", description: "All backup runs with status and metadata.", icon: Database, tint: "bg-chip-mint text-emerald-700" },
];

const FORMATS: { value: ExportFormat; label: string; ext: string; icon: React.ElementType }[] = [
  { value: "csv",  label: "CSV",   ext: ".csv",   icon: FileText },
  { value: "xlsx", label: "Excel", ext: ".xlsx",  icon: FileSpreadsheet },
  { value: "pdf",  label: "PDF",   ext: ".pdf",   icon: FileType2 },
];

const SCOPE_OPTIONS: { value: ScopeKind; label: string }[] = [
  { value: "today",  label: "Today" },
  { value: "day",    label: "Specific date" },
  { value: "week",   label: "Week" },
  { value: "month",  label: "Month" },
  { value: "range",  label: "Custom range" },
];

const ITEMS_PER_PAGE = 15;

export default function ReportsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);

  // Subscribe to store slices so the preview and counts stay in sync
  // when underlying data changes (new submissions, backups, etc.).
  const submissions = useDataStore((s) => s.submissions);
  const users       = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const backups     = useDataStore((s) => s.backups);

  const [type, setType] = useState<ReportType>("daily");
  const [scopeKind, setScopeKind] = useState<ScopeKind>("today");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [rangeStart, setRangeStart] = useState<string>(todayISO());
  const [rangeEnd, setRangeEnd] = useState<string>(todayISO());
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const scope = useMemo<ReportScope>(() => {
    if (scopeKind === "today") return { kind: "today" };
    if (scopeKind === "range") return { kind: "range", start: rangeStart, end: rangeEnd };
    return { kind: scopeKind, date: anchor };
  }, [scopeKind, anchor, rangeStart, rangeEnd]);

  // Reactive preview — reruns when data or scope changes.
  const rows = useMemo(
    () => (ready ? reportService.preview(type, scope) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, type, scope, submissions, users, departments, backups],
  );

  // Reset to page 1 whenever the report type or scope changes.
  useEffect(() => { setPage(1); }, [type, scopeKind, anchor, rangeStart, rangeEnd]);

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  // Clamp in case rows shrink below current page.
  const safePage = Math.min(page, totalPages);
  const preview = rows.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const range = useMemo(() => reportService.resolveRange(scope), [scope]);
  const meta = REPORTS.find((r) => r.type === type)!;
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  const handleExport = async () => {
    setBusy(true);
    try {
      await reportService.export(type, scope, format);
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} as ${format.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Build, preview, and export compliance reports for any date range."
      />

      {/* ── Report type selector ────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => {
          const active = type === r.type;
          return (
            <button
              key={r.type}
              type="button"
              onClick={() => setType(r.type)}
              className={cn(
                "group relative rounded-xl border bg-surface p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "border-primary shadow-card ring-2 ring-primary/20"
                  : "border-surface-border hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", r.tint)}>
                  <r.icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{r.title}</div>
                    {active && rows.length > 0 && (
                      <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
                        {rows.length}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
                </div>
              </div>
              {active && (
                <span className="absolute right-3 top-3 inline-flex h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Config panel ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>{meta.title}</CardTitle>
              <CardDescription>Choose a date scope and format. Preview updates instantly.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Scope */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Date scope</Label>
              <Select value={scopeKind} onValueChange={(v) => setScopeKind(v as ScopeKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Anchor / range inputs */}
            {scopeKind === "today" && (
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Effective range</Label>
                <div className="rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink">
                  {range.label}
                </div>
              </div>
            )}
            {(scopeKind === "day" || scopeKind === "week" || scopeKind === "month") && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="anchor" className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
                    {scopeKind === "month" ? "Any date in month" : scopeKind === "week" ? "Any date in week" : "Date"}
                  </Label>
                  <Input
                    id="anchor"
                    type="date"
                    value={anchor}
                    onChange={(e) => setAnchor(e.target.value || todayISO())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Effective range</Label>
                  <div className="rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink">
                    {range.label}
                  </div>
                </div>
              </>
            )}
            {scopeKind === "range" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="rstart" className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Start</Label>
                  <Input id="rstart" type="date" value={rangeStart} max={rangeEnd}
                    onChange={(e) => setRangeStart(e.target.value || todayISO())} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rend" className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">End</Label>
                  <Input id="rend" type="date" value={rangeEnd} min={rangeStart}
                    onChange={(e) => setRangeEnd(e.target.value || todayISO())} />
                </div>
              </>
            )}
          </div>

          {/* Format chooser */}
          <div className="space-y-2">
            <Label className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">Export format</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => {
                const active = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "border-primary bg-primary-soft/60 text-primary"
                        : "border-surface-border bg-surface hover:border-primary/40 text-ink-muted",
                    )}
                  >
                    <f.icon className="h-4 w-4" />
                    {f.label} <span className="text-[11px] text-ink-soft">{f.ext}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
            <div className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">{rows.length}</span> row{rows.length === 1 ? "" : "s"} match
              <span className="mx-1.5 text-surface-border">·</span>
              <span>{range.label}</span>
            </div>
            <Button onClick={handleExport} disabled={busy || rows.length === 0}>
              <Download className="h-4 w-4" />
              {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-chip-teal text-teal-700">
              <Eye className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {rows.length === 0
                  ? "No data in the selected range."
                  : `Showing ${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, rows.length)} of ${rows.length} row${rows.length === 1 ? "" : "s"}.`
                }
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-surface-border py-12 text-center text-sm text-ink-muted">
              No data in the selected range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    {headers.map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {preview.map((r, i) => (
                    <TR key={i}>
                      {headers.map((h) => (
                        <TD key={h} className="whitespace-nowrap text-xs text-ink-muted">
                          {String(r[h] ?? "")}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-surface-border pt-3 mt-2">
                  <span className="text-xs text-ink-soft">
                    {rows.length} total rows &middot; {ITEMS_PER_PAGE} per page
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-[5rem] text-center text-xs text-ink-muted">
                      Page {safePage} / {totalPages}
                    </span>
                    <Button size="sm" variant="outline" disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
