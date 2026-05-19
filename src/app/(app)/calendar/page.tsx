"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Plus,
  CalendarDays, LayoutGrid, List, FileText, Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  format,
  addMonths, subMonths,
  addWeeks, subWeeks,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay,
  isAfter,
} from "date-fns";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { STATUS_META } from "@/lib/status";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";

// ─── constants ────────────────────────────────────────────────────────────────
type CalView = "month" | "week" | "list";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_DOT: Record<SubmissionStatus, string> = {
  pending: "bg-amber-400",
  submitted: "bg-emerald-500",
  late: "bg-orange-500",
  missing: "bg-rose-500",
  revision_requested: "bg-violet-500",
  revision_approved: "bg-emerald-400",
  revision_rejected: "bg-rose-400",
  locked: "bg-indigo-500",
  excused: "bg-slate-400",
};

const STATUS_CHIP: Record<SubmissionStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-rose-50 text-rose-700 border-rose-200",
  revision_requested: "bg-violet-50 text-violet-700 border-violet-200",
  revision_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  revision_rejected: "bg-rose-50 text-rose-700 border-rose-200",
  locked: "bg-indigo-50 text-indigo-700 border-indigo-200",
  excused: "bg-slate-50 text-slate-500 border-slate-200",
};

const LEGEND: SubmissionStatus[] = [
  "submitted", "pending", "late", "missing", "revision_requested",
];

const STATUS_FILTER_OPTIONS: { value: SubmissionStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "late", label: "Late" },
  { value: "missing", label: "Missing" },
  { value: "revision_requested", label: "Revision Requested" },
  { value: "revision_approved", label: "Revision Approved" },
  { value: "revision_rejected", label: "Revision Rejected" },
  { value: "excused", label: "Excused" },
  { value: "locked", label: "Locked" },
];

// ─── DayCell ─────────────────────────────────────────────────────────────────
function DayCell({
  d, sub, inMonth, isToday, isPicked, compact, onSelect,
}: {
  d: Date;
  sub?: Submission;
  inMonth: boolean;
  isToday: boolean;
  isPicked: boolean;
  compact?: boolean;
  onSelect: (d: Date, sub?: Submission) => void;
}) {
  return (
    <button
      onClick={() => onSelect(d, sub)}
      className={cn(
        "group relative flex flex-col rounded-xl border text-left transition-all",
        compact ? "min-h-[68px] p-2" : "min-h-[96px] p-3",
        inMonth
          ? isPicked
            ? "border-primary bg-primary-soft/30 shadow-sm"
            : "border-surface-border bg-white hover:border-primary/40 hover:shadow-sm"
          : "border-transparent bg-surface-subtle/60",
        isToday && !isPicked && "ring-2 ring-primary ring-offset-1"
      )}
    >
      {/* Day number */}
      <div className={cn(
        "flex items-center justify-center rounded-full font-semibold leading-none",
        compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm",
        isToday
          ? "bg-primary text-white"
          : isPicked
          ? "text-primary"
          : inMonth
          ? "text-ink"
          : "text-ink-soft"
      )}>
        {format(d, "d")}
      </div>

      {/* Status chip */}
      {sub && inMonth && (
        <div className={cn(
          "mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none",
          STATUS_CHIP[sub.status]
        )}>
          <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_DOT[sub.status])} />
          {compact
            ? STATUS_META[sub.status].label.split(" ")[0]
            : STATUS_META[sub.status].label}
        </div>
      )}

      {/* Summary preview (full cells only) */}
      {sub?.workSummary && !compact && inMonth && (
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-ink-muted">
          {sub.workSummary}
        </p>
      )}
    </button>
  );
}

// ─── Legend strip ─────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-surface-border pt-3 mt-4">
      {LEGEND.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter();
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);

  const [cursor, setCursor] = useState(new Date());
  const [picked, setPicked] = useState<Date | null>(new Date());
  const [modal, setModal] = useState<Submission | null>(null);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [view, setView] = useState<CalView>("month");
  const [filterStatus, setFilterStatus] = useState<SubmissionStatus | "all">("all");

  if (!user) return null;

  const canSelect = user.role === "admin" || user.role === "manager";
  const effectiveId = canSelect && viewUserId ? viewUserId : user.id;
  const effectiveUser = users.find((u) => u.id === effectiveId) ?? user;
  const isSelf = effectiveId === user.id;
  const today = new Date();

  // ── day map (filter-aware) ────────────────────────────────────────────────
  const dayMap = useMemo(() => {
    const m = new Map<string, Submission>();
    submissions
      .filter((s) => s.userId === effectiveId)
      .filter((s) => filterStatus === "all" || s.status === filterStatus)
      .forEach((s) => m.set(s.date, s));
    return m;
  }, [effectiveId, submissions, filterStatus]);

  const pickedSub = picked ? dayMap.get(format(picked, "yyyy-MM-dd")) : undefined;

  // ── navigation ────────────────────────────────────────────────────────────
  const goBack = () => view === "week" ? setCursor(subWeeks(cursor, 1)) : setCursor(subMonths(cursor, 1));
  const goFwd  = () => view === "week" ? setCursor(addWeeks(cursor, 1)) : setCursor(addMonths(cursor, 1));
  const goToday = () => { setCursor(new Date()); setPicked(new Date()); };

  // ── derived day lists ─────────────────────────────────────────────────────
  const monthDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  }), [cursor]);

  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(cursor),
    end: endOfWeek(cursor),
  }), [cursor]);

  const listItems = useMemo(() =>
    [...submissions]
      .filter((s) => s.userId === effectiveId)
      .filter((s) => filterStatus === "all" || s.status === filterStatus)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [submissions, effectiveId, filterStatus]
  );

  // ── period label ──────────────────────────────────────────────────────────
  const periodLabel = view === "week"
    ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}`
    : format(cursor, "MMMM yyyy");

  // ── cell handler ──────────────────────────────────────────────────────────
  const handleSelect = (d: Date, sub?: Submission) => {
    setPicked(d);
    if (view === "month") setCursor(d); // keep cursor in sync
    if (sub) setModal(sub); // single-click to view details when a submission exists
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description={
          isSelf
            ? "Track your submission history by day, week, or month."
            : `Viewing ${effectiveUser.name}'s calendar.`
        }
        actions={
          canSelect && (
            <Select
              value={viewUserId ?? user.id}
              onValueChange={(v) => setViewUserId(v === user.id ? null : v)}
            >
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={user.id}>My calendar</SelectItem>
                {users
                  .filter((u) => u.isActive && u.id !== user.id)
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        }
      />

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Period navigation */}
        {view !== "list" ? (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={goBack} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[170px] px-1 text-center text-sm font-semibold text-ink">
              {periodLabel}
            </span>
            <Button size="icon" variant="ghost" onClick={goFwd} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={goToday} className="ml-1 hidden sm:inline-flex">
              Today
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-ink">All Submissions</div>
            {filterStatus !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {STATUS_META[filterStatus]?.label}
                <button onClick={() => setFilterStatus("all")} className="ml-0.5 hover:text-primary/70">×</button>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-ink-muted" />
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as SubmissionStatus | "all")}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-surface-border bg-white p-1 gap-0.5">
            {([
              { key: "month", Icon: LayoutGrid,  label: "Month" },
              { key: "week",  Icon: CalendarDays, label: "Week"  },
              { key: "list",  Icon: List,          label: "List"  },
            ] as const).map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === key
                    ? "bg-primary text-white shadow-sm"
                    : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── MONTH VIEW ────────────────────────────────────────────────────── */}
      {view === "month" && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            {/* Weekday headers */}
            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                return (
                  <DayCell
                    key={iso}
                    d={d}
                    sub={dayMap.get(iso)}
                    inMonth={isSameMonth(d, cursor)}
                    isToday={isSameDay(d, today)}
                    isPicked={!!picked && isSameDay(d, picked)}
                    compact
                    onSelect={handleSelect}
                  />
                );
              })}
            </div>
            <Legend />
          </CardContent>
        </Card>
      )}

      {/* ── WEEK VIEW ─────────────────────────────────────────────────────── */}
      {view === "week" && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const isT = isSameDay(d, today);
                return (
                  <div key={iso} className="flex flex-col gap-1">
                    {/* Column header */}
                    <div className="flex flex-col items-center pb-2">
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        isT ? "text-primary" : "text-ink-muted"
                      )}>
                        {format(d, "EEE")}
                      </span>
                      <span className={cn(
                        "mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                        isT ? "bg-primary text-white" : "text-ink"
                      )}>
                        {format(d, "d")}
                      </span>
                    </div>
                    <DayCell
                      d={d}
                      sub={dayMap.get(iso)}
                      inMonth
                      isToday={false}
                      isPicked={!!picked && isSameDay(d, picked)}
                      compact={false}
                      onSelect={handleSelect}
                    />
                  </div>
                );
              })}
            </div>
            <Legend />
          </CardContent>
        </Card>
      )}

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {view === "list" && (
        <Card>
          {listItems.length === 0 ? (
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle">
                <FileText className="h-6 w-6 text-ink-soft" />
              </div>
              <p className="font-semibold text-ink">No submissions yet</p>
              <p className="mt-1 text-sm text-ink-muted">
                Your submitted work will appear here once you start submitting.
              </p>
            </CardContent>
          ) : (
            <ul className="divide-y divide-surface-border">
              {listItems.map((s) => {
                const isT = isSameDay(new Date(s.date), today);
                return (
                  <li
                    key={s.id}
                    className="flex items-start gap-4 px-4 py-4 transition-colors hover:bg-surface-subtle/60 sm:px-5"
                  >
                    {/* Date badge */}
                    <div className="w-12 flex-shrink-0 text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                        {format(new Date(s.date), "MMM")}
                      </div>
                      <div className={cn(
                        "mx-auto mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold",
                        isT ? "bg-primary text-white" : "bg-surface-subtle text-ink"
                      )}>
                        {format(new Date(s.date), "d")}
                      </div>
                      <div className="mt-0.5 text-[10px] text-ink-soft">
                        {format(new Date(s.date), "EEE")}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                          STATUS_CHIP[s.status]
                        )}>
                          <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_DOT[s.status])} />
                          {STATUS_META[s.status].label}
                        </span>
                        {s.submittedAt && (
                          <span className="text-xs text-ink-soft">
                            {format(new Date(s.submittedAt), "h:mm a")}
                          </span>
                        )}
                      </div>
                      {s.workSummary && (
                        <p className="mt-1.5 truncate text-sm font-medium text-ink">{s.workSummary}</p>
                      )}
                      {s.tasksDetails && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{s.tasksDetails}</p>
                      )}
                    </div>

                    {/* View button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-shrink-0 text-ink-muted hover:text-ink"
                      onClick={() => setModal(s)}
                    >
                      View
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* ── SELECTED DAY DETAIL (month + week) ────────────────────────────── */}
      {picked && view !== "list" && (
        <Card>
          <CardContent className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {format(picked, "EEEE")}
                </p>
                <h2 className="text-lg font-semibold text-ink">
                  {format(picked, "MMMM d, yyyy")}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pickedSub && <StatusPill status={pickedSub.status} />}
                {pickedSub ? (
                  <Button size="sm" variant="outline" onClick={() => setModal(pickedSub)}>
                    View details
                  </Button>
                ) : isSelf && !isAfter(picked, today) ? (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/my-work?date=${format(picked, "yyyy-MM-dd")}`)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Submit work
                  </Button>
                ) : null}
              </div>
            </div>

            {pickedSub ? (
              <div className="mt-3 space-y-2">
                {pickedSub.workSummary && (
                  <p className="text-sm font-medium text-ink">{pickedSub.workSummary}</p>
                )}
                {pickedSub.tasksDetails && (
                  <p className="whitespace-pre-wrap rounded-lg bg-surface-subtle px-3 py-2.5 text-sm leading-relaxed text-ink-muted">
                    {pickedSub.tasksDetails}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No submission recorded for this date.</p>
            )}
          </CardContent>
        </Card>
      )}

      <SubmissionDetailsModal
        open={!!modal}
        onOpenChange={(v) => !v && setModal(null)}
        submission={modal}
      />
    </div>
  );
}