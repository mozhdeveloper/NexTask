// Reports service — pure data + export pipeline.
// Supports date scoping (today | day | week | month | range) and three real
// export formats (CSV, XLSX via SheetJS, PDF via jsPDF + autotable).

import { useDataStore } from "@/store/dataStore";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { fmtDate, todayISO } from "@/lib/dates";
import { logService } from "./log.service";
import { useAuthStore } from "@/store/authStore";
import { workSettingsService } from "./workSettings.service";

export type ReportType =
  | "daily"
  | "late"
  | "missing"
  | "employee_compliance"
  | "department_compliance"
  | "backup_history";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ScopeKind = "today" | "day" | "week" | "month" | "range";

export interface ReportScope {
  kind: ScopeKind;
  /** yyyy-MM-dd — anchor date for `day`, `week`, or `month` scopes. */
  date?: string;
  /** yyyy-MM-dd — start of custom range (inclusive). */
  start?: string;
  /** yyyy-MM-dd — end of custom range (inclusive). */
  end?: string;
}

// ─── Scope helpers ───────────────────────────────────────────────────────────
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function startOfWeekISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  // ISO week starts on Monday
  const day = d.getDay(); // 0 (Sun) – 6 (Sat)
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function startOfMonthISO(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}

export function resolveRange(scope: ReportScope): { start: string; end: string; label: string } {
  const anchor = scope.date ?? todayISO();
  switch (scope.kind) {
    case "today": {
      const t = todayISO();
      return { start: t, end: t, label: `Today (${fmtDate(t)})` };
    }
    case "day":
      return { start: anchor, end: anchor, label: fmtDate(anchor) };
    case "week": {
      const s = startOfWeekISO(anchor);
      const e = addDays(s, 6);
      return { start: s, end: e, label: `Week of ${fmtDate(s)}` };
    }
    case "month": {
      const s = startOfMonthISO(anchor);
      const e = endOfMonthISO(anchor);
      return { start: s, end: e, label: fmtDate(s, "MMMM yyyy") };
    }
    case "range": {
      const s = scope.start ?? anchor;
      const e = scope.end ?? anchor;
      return { start: s, end: e, label: `${fmtDate(s)} → ${fmtDate(e)}` };
    }
  }
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

// ─── Row builders ────────────────────────────────────────────────────────────
function rowsFor(type: ReportType, scope: ReportScope): Array<Record<string, unknown>> {
  const { submissions, users, departments, backups, workSettings } = useDataStore.getState();

  // O(1) lookup maps — built once per call, not per-row.
  const userMap = new Map(users.map((u) => [u.id, u]));
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const userById = (id: string) => userMap.get(id);
  const deptById = (id: string | null) => (id && deptMap.get(id)) || "—";

  const { start, end } = resolveRange(scope);

  switch (type) {
    case "daily":
      return submissions
        .filter((s) => inRange(s.date, start, end))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => {
          const u = userById(s.userId);
          return {
            Date: s.date,
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            Status: s.status,
            SubmittedAt: s.submittedAt ?? "",
            Summary: s.workSummary,
          };
        });

    case "late":
      return submissions
        .filter((s) => s.status === "late" && inRange(s.date, start, end))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => {
          const u = userById(s.userId);
          return {
            Date: s.date,
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            SubmittedAt: s.submittedAt ?? "",
          };
        });

    case "missing": {
      const realRows = submissions
        .filter((s) => s.status === "missing" && inRange(s.date, start, end))
        .map((s) => {
          const u = userById(s.userId);
          return {
            Date: s.date,
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            Status: "missing" as const,
          };
        });

      const virtual: { Date: string; Employee: string; Department: string; Status: string }[] = [];
      const activeWorkers = users.filter(
        (u) => u.isActive && (u.role === "employee" || u.role === "manager"),
      );
      // Pre-built Set for O(1) lookup — avoids O(submissions) scan per worker-day.
      const submittedSet = new Set(submissions.map((s) => `${s.userId}|${s.date}`));
      const today = todayISO();
      const cap = end < today ? end : today;
      for (let d = start; d <= cap; d = addDays(d, 1)) {
        // Inline working-day check — uses already-cached workSettings, no getState() per iteration.
        const dt = new Date(d + "T12:00:00");
        if (!workSettings.workingDays.includes(dt.getDay())) continue;
        if (workSettings.holidays.some((h) => h.date === d)) continue;
        for (const u of activeWorkers) {
          if (submittedSet.has(`${u.id}|${d}`)) continue;
          if (d === today && !workSettingsService.isPastWorkEnd()) continue;
          virtual.push({
            Date: d,
            Employee: u.name,
            Department: deptById(u.departmentId ?? null),
            Status: "missing (no submission)",
          });
        }
      }
      return [...realRows, ...virtual].sort((a, b) => b.Date.localeCompare(a.Date));
    }

    case "employee_compliance": {
      const scoped = submissions.filter((s) => inRange(s.date, start, end));
      const grouped = new Map<string, { total: number; ok: number }>();
      scoped.forEach((s) => {
        const cur = grouped.get(s.userId) ?? { total: 0, ok: 0 };
        cur.total += 1;
        if (s.status === "submitted" || s.status === "revision_approved") cur.ok += 1;
        grouped.set(s.userId, cur);
      });
      return Array.from(grouped.entries())
        .map(([uid, v]) => {
          const u = userById(uid);
          return {
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            Total: v.total,
            OnTime: v.ok,
            Compliance: v.total ? `${((v.ok / v.total) * 100).toFixed(1)}%` : "—",
          };
        })
        .sort((a, b) => String(a.Employee).localeCompare(String(b.Employee)));
    }

    case "department_compliance":
      return departments.map((d) => {
        const subs = submissions.filter((s) => {
          const u = userById(s.userId);
          return u?.departmentId === d.id && inRange(s.date, start, end);
        });
        const ok = subs.filter(
          (s) => s.status === "submitted" || s.status === "revision_approved",
        ).length;
        return {
          Department: d.name,
          Total: subs.length,
          OnTime: ok,
          Compliance: subs.length ? `${((ok / subs.length) * 100).toFixed(1)}%` : "—",
        };
      });

    case "backup_history":
      return backups
        .filter((b) => inRange(b.createdAt.slice(0, 10), start, end))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((b) => ({
          File: b.fileName,
          Path: b.filePath,
          Started: b.startedAt,
          Completed: b.completedAt ?? "",
          Status: b.status,
          SizeBytes: b.sizeBytes,
        }));
  }
}

const REPORT_LABELS: Record<ReportType, string> = {
  daily: "Daily Submission Report",
  late: "Late Submission Report",
  missing: "Missing Submission Report",
  employee_compliance: "Employee Compliance Report",
  department_compliance: "Department Compliance Report",
  backup_history: "Backup History Report",
};

// ─── Public API ──────────────────────────────────────────────────────────────
export const reportService = {
  label(type: ReportType) {
    return REPORT_LABELS[type];
  },

  resolveRange,

  preview(type: ReportType, scope: ReportScope) {
    return rowsFor(type, scope);
  },

  async export(type: ReportType, scope: ReportScope, format: ExportFormat) {
    const rows = rowsFor(type, scope) ?? [];
    const range = resolveRange(scope);
    const label = REPORT_LABELS[type];
    const base = `${type}_${range.start}_to_${range.end}`;

    if (format === "csv") {
      downloadBlob(`${base}.csv`, toCsv(rows), "text/csv");
    } else if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      if (rows.length) {
        const headers = Object.keys(rows[0]);
        ws["!cols"] = headers.map((h) => {
          const max = Math.max(
            h.length,
            ...rows.map((r) => String(r[h] ?? "").length),
          );
          return { wch: Math.min(48, Math.max(10, max + 2)) };
        });
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 28));
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(`${base}.xlsx`, blob);
    } else {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(label, 40, 36);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Range: ${range.label}    Generated: ${new Date().toLocaleString()}`, 40, 52);
      doc.text(`${rows.length} row${rows.length === 1 ? "" : "s"}`, 40, 66);
      if (rows.length) {
        const head = [Object.keys(rows[0])];
        const body = rows.map((r) => head[0].map((h) => String(r[h] ?? "")));
        autoTable(doc, {
          startY: 80,
          head,
          body,
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 40, right: 40 },
        });
      } else {
        doc.setTextColor(120);
        doc.text("No data in selected range.", 40, 100);
      }
      doc.save(`${base}.pdf`);
    }

    const me = useAuthStore.getState().user;
    if (me) {
      logService.append({
        userId: me.id,
        action: "report.export",
        targetType: "report",
        targetId: `${type}:${format}`,
      });
    }
  },
};
