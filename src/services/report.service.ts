import { useDataStore } from "@/store/dataStore";
import { downloadBlob, toCsv } from "@/lib/helpers";
import { fmtDate } from "@/lib/dates";
import { logService } from "./log.service";
import { useAuthStore } from "@/store/authStore";

export type ReportType =
  | "daily"
  | "late"
  | "missing"
  | "employee_compliance"
  | "department_compliance"
  | "backup_history";

export type ExportFormat = "csv" | "xlsx" | "pdf";

function rowsFor(type: ReportType) {
  const { submissions, users, departments, backups } = useDataStore.getState();
  const userById = (id: string) => users.find((u) => u.id === id);
  const deptById = (id: string | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  switch (type) {
    case "daily":
      return submissions.map((s) => {
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
        .filter((s) => s.status === "late")
        .map((s) => {
          const u = userById(s.userId);
          return {
            Date: s.date,
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            SubmittedAt: s.submittedAt ?? "",
          };
        });
    case "missing":
      return submissions
        .filter((s) => s.status === "missing" || s.status === "pending")
        .map((s) => {
          const u = userById(s.userId);
          return {
            Date: s.date,
            Employee: u?.name ?? "—",
            Department: deptById(u?.departmentId ?? null),
            Status: s.status,
          };
        });
    case "employee_compliance": {
      const grouped = new Map<string, { total: number; ok: number }>();
      submissions.forEach((s) => {
        const cur = grouped.get(s.userId) ?? { total: 0, ok: 0 };
        cur.total += 1;
        if (s.status === "submitted" || s.status === "revision_approved") cur.ok += 1;
        grouped.set(s.userId, cur);
      });
      return Array.from(grouped.entries()).map(([uid, v]) => {
        const u = userById(uid);
        return {
          Employee: u?.name ?? "—",
          Department: deptById(u?.departmentId ?? null),
          Total: v.total,
          OnTime: v.ok,
          Compliance: `${((v.ok / v.total) * 100).toFixed(1)}%`,
        };
      });
    }
    case "department_compliance": {
      return departments.map((d) => {
        const subs = submissions.filter((s) => {
          const u = userById(s.userId);
          return u?.departmentId === d.id;
        });
        const ok = subs.filter(
          (s) => s.status === "submitted" || s.status === "revision_approved"
        ).length;
        return {
          Department: d.name,
          Total: subs.length,
          OnTime: ok,
          Compliance: subs.length ? `${((ok / subs.length) * 100).toFixed(1)}%` : "—",
        };
      });
    }
    case "backup_history":
      return backups.map((b) => ({
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

export const reportService = {
  preview(type: ReportType) {
    return rowsFor(type);
  },
  label(type: ReportType) {
    return REPORT_LABELS[type];
  },
  export(type: ReportType, format: ExportFormat) {
    const rows = rowsFor(type) ?? [];
    const base = `${type}_report_${fmtDate(new Date(), "yyyy-MM-dd")}`;
    if (format === "csv") {
      downloadBlob(`${base}.csv`, toCsv(rows), "text/csv");
    } else if (format === "xlsx") {
      // Stub: produce a TSV that Excel can open, with .xlsx extension is misleading;
      // for safe demo use .xls extension.
      const tsv = rows.length
        ? [Object.keys(rows[0]).join("\t"), ...rows.map((r) => Object.values(r).join("\t"))].join(
            "\n"
          )
        : "";
      downloadBlob(`${base}.xls`, tsv, "application/vnd.ms-excel");
    } else {
      const text = `${REPORT_LABELS[type]}\nGenerated: ${new Date().toString()}\n\n` +
        (rows.length
          ? rows.map((r, i) => `#${i + 1} ` + Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(" | ")).join("\n")
          : "No data");
      downloadBlob(`${base}.pdf.txt`, text, "text/plain");
    }
    const me = useAuthStore.getState().user;
    if (me) {
      logService.append({
        userId: me.id,
        action: `report.export.${format}`,
        targetType: "report",
        targetId: null,
      });
    }
  },
};
