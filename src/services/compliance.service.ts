// Compliance service — virtual computation of pending/missing statuses for
// employees who haven't submitted (no row exists in DB). This avoids needing a
// cron job to backfill rows: dashboard and reports derive these on read.

import { useDataStore } from "@/store/dataStore";
import { todayISO } from "@/lib/dates";
import { workSettingsService } from "./workSettings.service";
import type { Submission, User } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";

export interface DayCell {
  user: User;
  submission: Submission | null;
  /**
   * Effective status taking into account "missing employees" with no row:
   *  - existing row → its own status
   *  - no row, date is a past working day → "missing"
   *  - no row, date is today, past work-end window → "missing"
   *  - no row, date is today, still within work hours → "pending"
   *  - no row, date is a future day or non-working day → null (not counted)
   */
  effectiveStatus: SubmissionStatus | null;
}

function activeWorkers(users: User[]): User[] {
  return users.filter((u) => u.isActive && (u.role === "employee" || u.role === "manager"));
}

/**
 * Returns one cell per active employee for a single date, including synthetic
 * "missing" / "pending" entries for employees without a submission row.
 */
export function dayOverview(date: string): DayCell[] {
  const { users, submissions } = useDataStore.getState();
  const workers = activeWorkers(users);
  const today = todayISO();
  const isWorking = workSettingsService.isWorkingDay(date);

  return workers.map((u) => {
    const sub = submissions.find((s) => s.userId === u.id && s.date === date) ?? null;
    if (sub) {
      return { user: u, submission: sub, effectiveStatus: sub.status };
    }
    if (!isWorking) return { user: u, submission: null, effectiveStatus: null };
    if (date < today) return { user: u, submission: null, effectiveStatus: "missing" };
    if (date > today) return { user: u, submission: null, effectiveStatus: null };
    // date === today
    return {
      user: u,
      submission: null,
      effectiveStatus: workSettingsService.isPastWorkEnd() ? "missing" : "pending",
    };
  });
}

/**
 * Aggregate counts for a given date using the same rules as dayOverview.
 */
export function dayCounts(date: string) {
  const cells = dayOverview(date);
  let submitted = 0;
  let pending = 0;
  let missing = 0;
  let late = 0;
  let expected = 0;
  for (const c of cells) {
    if (c.effectiveStatus === null) continue;
    expected++;
    switch (c.effectiveStatus) {
      case "submitted":
      case "revision_approved":
      case "excused":
        submitted++;
        break;
      case "pending":
        pending++;
        break;
      case "missing":
        missing++;
        break;
      case "late":
        late++;
        break;
      // revision_requested / revision_rejected / locked: do not affect headline counts
    }
  }
  return { submitted, pending, missing, late, expected };
}

/**
 * Returns one DayCell per active worker per working day in [start, end].
 * Used by reports to produce a complete compliance picture (including no-shows).
 */
export function rangeOverview(start: string, end: string): DayCell[] {
  const out: DayCell[] = [];
  const startD = new Date(start);
  const endD = new Date(end);
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!workSettingsService.isWorkingDay(iso)) continue;
    for (const cell of dayOverview(iso)) {
      if (cell.effectiveStatus !== null) out.push(cell);
    }
  }
  return out;
}

export const complianceService = {
  dayOverview,
  dayCounts,
  rangeOverview,
};
