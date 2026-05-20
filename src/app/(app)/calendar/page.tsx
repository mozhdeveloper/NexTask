"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, List, FileText, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  format,
  addDays, subDays,
  addMonths, subMonths,
  addWeeks, subWeeks,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval,
  isSameMonth, isSameDay, isSameWeek,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { DayDetailModal } from "@/components/modals/DayDetailModal";
import { STATUS_META } from "@/lib/status";
import { workSettingsService } from "@/services/workSettings.service";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";

const SUBMITTED_STATUSES = new Set<SubmissionStatus>([
  "submitted", "late", "locked",
  "revision_requested", "revision_approved", "revision_rejected",
]);

type CalView = "month" | "week" | "list";
type ListPeriod = "day" | "week" | "month";

/** Sentinel value meaning "show all employees" in the user picker */
const ALL_USERS = "__all__";

/** Items shown per "load more" page in the list view */
const LIST_PAGE_SIZE = 50;

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

const FILTER_STATUSES: SubmissionStatus[] = [
  "submitted", "pending", "late", "missing",
  "revision_requested", "revision_approved", "revision_rejected",
  "excused", "locked",
];

// ─── DayCell ─────────────────────────────────────────────────────────────────
function DayCell({
  d, sub, inMonth, isToday, isPicked, compact, onSelect,
  submittedCount, totalCount,
}: {
  d: Date;
  sub?: Submission;
  inMonth: boolean;
  isToday: boolean;
  isPicked: boolean;
  compact?: boolean;
  onSelect: (d: Date, sub?: Submission) => void;
  submittedCount?: number;
  totalCount?: number;
}) {
  const iso = format(d, "yyyy-MM-dd");
  const holiday = workSettingsService.isHoliday(iso);
  const nonWorking = !workSettingsService.isWorkingDay(iso);
  return (
    <button
      onClick={() => onSelect(d, sub)}
      title={holiday ? "Holiday" : nonWorking ? "Non-working day" : undefined}
      className={cn(
        "group relative flex flex-col rounded-lg border text-left transition-all",
        compact ? "min-h-[44px] p-1.5 sm:min-h-[68px] sm:p-2" : "min-h-[96px] p-3",
        inMonth
          ? isPicked
            ? "border-primary bg-primary-soft/30 shadow-sm"
            : holiday
              ? "border-rose-200 bg-rose-50/60 hover:border-rose-300"
              : nonWorking
                ? "border-surface-border bg-surface-subtle/70 hover:border-ink/20"
                : "border-surface-border bg-white hover:border-primary/40 hover:shadow-sm"
          : "border-transparent bg-surface-subtle/60",
        isToday && !isPicked && "ring-2 ring-primary ring-offset-1"
      )}
    >
      {/* Day number */}
      <div className={cn(
        "flex items-center justify-center rounded-full font-semibold leading-none",
        compact ? "h-5 w-5 text-[10px] sm:h-6 sm:w-6 sm:text-xs" : "h-7 w-7 text-sm",
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

      {/* Status chip — hidden on compact mobile cells, visible on sm+ */}
      {sub && inMonth && (
        <div className={cn(
          "mt-1 hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none sm:inline-flex",
          STATUS_CHIP[sub.status]
        )}>
          <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_DOT[sub.status])} />
          {compact
            ? STATUS_META[sub.status].label.split(" ")[0]
            : STATUS_META[sub.status].label}
        </div>
      )}
      {/* Mobile: just a color dot */}
      {sub && inMonth && compact && (
        <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full sm:hidden", STATUS_DOT[sub.status])} />
      )}

      {/* Summary preview (full cells only) */}
      {sub?.workSummary && !compact && inMonth && (
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-ink-muted">
          {sub.workSummary}
        </p>
      )}

      {/* Submitted / total count badge — only when at least one submitted */}
      {inMonth && typeof submittedCount === "number" && typeof totalCount === "number" && submittedCount > 0 && (
        <span className={cn(
          "mt-auto inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold leading-none",
          compact ? "hidden sm:inline-flex" : "inline-flex",
          submittedCount === totalCount && totalCount > 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : submittedCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-surface-border bg-surface-subtle text-ink-soft"
        )}>
          {submittedCount}/{totalCount}
        </span>
      )}

      {/* Holiday / non-working badge (full cells, no submission) */}
      {!sub && inMonth && holiday && !compact && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
          Holiday
        </span>
      )}
      {!sub && inMonth && !holiday && nonWorking && !compact && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
          Off day
        </span>
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

// ─── SegmentedControl ─────────────────────────────────────────────────────────
function SegmentedControl<T extends string>({
  options, value, onChange, className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center rounded-lg border border-surface-border bg-white p-0.5 gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            value === o.value
              ? "bg-primary text-white shadow-sm"
              : "text-ink-muted hover:bg-surface-subtle hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);

  const canSelect = user?.role === "admin" || user?.role === "manager";

  // Default admin/manager to "all employees" view; employees see only themselves.
  const [viewUserId, setViewUserId] = useState<string>(canSelect ? ALL_USERS : (user?.id ?? ""));
  const [cursor, setCursor] = useState(new Date());
  const [picked, setPicked] = useState<Date | null>(new Date());
  const [modal, setModal] = useState<Submission | null>(null);
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [view, setView] = useState<CalView>("month");
  const [listPeriod, setListPeriod] = useState<ListPeriod>("month");
  const [listCursor, setListCursor] = useState(() => new Date());
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "all">("all");

  // Stable reference to today — doesn't change during a session
  const today = useRef(new Date()).current;

  // Reset render limit whenever the visible window changes
  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
  }, [listPeriod, listCursor, statusFilter, viewUserId]);

  // ── list navigation ───────────────────────────────────────────────────────
  const listGoBack = () => setListCursor((c) =>
    listPeriod === "day" ? subDays(c, 1) : listPeriod === "week" ? subWeeks(c, 1) : subMonths(c, 1)
  );
  const listGoFwd = () => setListCursor((c) =>
    listPeriod === "day" ? addDays(c, 1) : listPeriod === "week" ? addWeeks(c, 1) : addMonths(c, 1)
  );
  const listGoToday = () => setListCursor(new Date());

  // ── employee pools ────────────────────────────────────────────────────────
  const allActiveEmployees = useMemo(
    () => users.filter((u) => u.isActive && u.role === "employee"),
    [users]
  );

  const scopedEmployees = useMemo(() => {
    if (user?.role === "manager") {
      return allActiveEmployees.filter((u) => u.departmentId === user.departmentId);
    }
    return allActiveEmployees;
  }, [user?.role, user?.departmentId, allActiveEmployees]);

  const allEmployeeIds = useMemo(
    () => new Set(allActiveEmployees.map((u) => u.id)),
    [allActiveEmployees]
  );

  // ── resolved identity ─────────────────────────────────────────────────────
  const isAllMode = canSelect && viewUserId === ALL_USERS;
  const effectiveId = isAllMode ? "" : viewUserId;
  const effectiveUser = isAllMode ? null : (users.find((u) => u.id === effectiveId) ?? user);
  const isSelf = effectiveId === user?.id;

  // Users shown in the picker (scoped by manager's dept)
  const pickableUsers = useMemo(() => {
    if (!canSelect) return [];
    return users
      .filter((u) => u.isActive)
      .filter((u) => user?.role !== "manager" || u.departmentId === user.departmentId)
      .filter((u) => u.id !== user?.id) // exclude self — "My calendar" is the self option
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, user, canSelect]);

  // ── per-day submitted count (all employees) ───────────────────────────────
  const dayCountMap = useMemo(() => {
    const m = new Map<string, number>();
    submissions
      .filter((s) => allEmployeeIds.has(s.userId) && SUBMITTED_STATUSES.has(s.status))
      .forEach((s) => m.set(s.date, (m.get(s.date) ?? 0) + 1));
    return m;
  }, [submissions, allEmployeeIds]);

  // ── day map for month/week grid (individual mode only) ───────────────────
  const dayMap = useMemo(() => {
    if (isAllMode) return new Map<string, Submission>();
    const m = new Map<string, Submission>();
    submissions
      .filter((s) => s.userId === effectiveId)
      .forEach((s) => m.set(s.date, s));
    return m;
  }, [isAllMode, effectiveId, submissions]);

  // ── navigation ────────────────────────────────────────────────────────────
  const goBack   = () => view === "week" ? setCursor(subWeeks(cursor, 1))  : setCursor(subMonths(cursor, 1));
  const goFwd    = () => view === "week" ? setCursor(addWeeks(cursor, 1))   : setCursor(addMonths(cursor, 1));
  const goToday  = () => { setCursor(new Date()); setPicked(new Date()); };

  // ── derived day lists ─────────────────────────────────────────────────────
  const monthDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end:   endOfWeek(endOfMonth(cursor)),
  }), [cursor]);

  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(cursor),
    end:   endOfWeek(cursor),
  }), [cursor]);

  // ── list items (period + status + user filtered) ──────────────────────────
  const listItems = useMemo(() => {
    let intervalStart: Date;
    let intervalEnd: Date;
    if (listPeriod === "day") {
      intervalStart = new Date(listCursor); intervalStart.setHours(0, 0, 0, 0);
      intervalEnd   = new Date(listCursor); intervalEnd.setHours(23, 59, 59, 999);
    } else if (listPeriod === "week") {
      intervalStart = startOfWeek(listCursor);
      intervalEnd   = endOfWeek(listCursor);
    } else {
      intervalStart = startOfMonth(listCursor);
      intervalEnd   = endOfMonth(listCursor);
    }
    return [...submissions]
      .filter((s) => isAllMode ? allEmployeeIds.has(s.userId) : s.userId === effectiveId)
      .filter((s) => statusFilter === "all" || s.status === statusFilter)
      .filter((s) => isWithinInterval(parseISO(s.date), { start: intervalStart, end: intervalEnd }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.userId.localeCompare(b.userId));
  }, [submissions, isAllMode, allEmployeeIds, effectiveId, listPeriod, listCursor, statusFilter]);

  if (!user) return null;

  // ── period label ──────────────────────────────────────────────────────────
  const periodLabel = view === "week"
    ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}`
    : format(cursor, "MMMM yyyy");

  const isListToday =
    listPeriod === "day"   ? isSameDay(listCursor, today)
    : listPeriod === "week"  ? isSameWeek(listCursor, today)
    : isSameMonth(listCursor, today);

  const listPeriodLabel =
    listPeriod === "day"
      ? (isSameDay(listCursor, today) ? `Today — ${format(listCursor, "MMMM d, yyyy")}` : format(listCursor, "EEEE, MMMM d, yyyy"))
    : listPeriod === "week"
      ? `${format(startOfWeek(listCursor), "MMM d")} – ${format(endOfWeek(listCursor), "MMM d, yyyy")}`
    : format(listCursor, "MMMM yyyy");

  // ── cell click handler ────────────────────────────────────────────────────
  const handleSelect = (d: Date) => {
    setPicked(d);
    if (view === "month") setCursor(d);
    setDayModalDate(d);
    setDayModalOpen(true);
  };

  // ── list grouped by date ──────────────────────────────────────────────────
  const listGroups = useMemo(() => {
    const map = new Map<string, Submission[]>();
    listItems.forEach((s) => {
      const existing = map.get(s.date);
      if (existing) existing.push(s);
      else map.set(s.date, [s]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [listItems]);

  // ── paginated groups (cap at listLimit items total) ───────────────────────
  const { visibleGroups, hiddenCount } = useMemo(() => {
    let shown = 0;
    const visible: Array<[string, Submission[]]> = [];
    for (const [date, subs] of listGroups) {
      if (shown >= listLimit) break;
      const take = subs.slice(0, listLimit - shown);
      visible.push([date, take]);
      shown += take.length;
    }
    return { visibleGroups: visible, hiddenCount: listItems.length - shown };
  }, [listGroups, listLimit, listItems.length]);

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">Calendar</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {isAllMode
              ? "Team submission overview."
              : isSelf
              ? "Track your submission history by day, week, or month."
              : `Viewing ${effectiveUser?.name ?? ""}'s calendar.`}
          </p>
        </div>

        {/* Controls: user picker + view switcher */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {/* User picker — admins & managers only */}
          {canSelect && (
            <Select value={viewUserId} onValueChange={setViewUserId}>
              <SelectTrigger className="h-9 w-44 sm:w-52 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_USERS}>
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-ink-muted" />
                    All employees
                  </span>
                </SelectItem>
                <SelectItem value={user.id}>My calendar</SelectItem>
                {pickableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-surface-border bg-white p-0.5 gap-0.5">
            {([
              { key: "month" as CalView, Icon: LayoutGrid,  label: "Month" },
              { key: "week"  as CalView, Icon: CalendarDays, label: "Week"  },
              { key: "list"  as CalView, Icon: List,          label: "List"  },
            ]).map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
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

      {/* ── Toolbar: navigation / period / list controls ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {view !== "list" ? (
          /* Month / Week nav */
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goBack} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] px-1 text-center text-sm font-semibold text-ink">
              {periodLabel}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goFwd} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={goToday} className="ml-1 h-8 text-xs">
              Today
            </Button>
          </div>
        ) : (
          /* List view: period selector + navigation */
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<ListPeriod>
              value={listPeriod}
              onChange={(v) => { setListPeriod(v); setListCursor(new Date()); }}
              options={[
                { value: "day",   label: "Daily"   },
                { value: "week",  label: "Weekly"  },
                { value: "month", label: "Monthly" },
              ]}
            />
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={listGoBack} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[160px] px-1 text-center text-sm font-semibold text-ink">
                {listPeriodLabel}
              </span>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={listGoFwd} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isListToday && (
                <Button size="sm" variant="outline" onClick={listGoToday} className="ml-1 h-8 text-xs">
                  Today
                </Button>
              )}
            </div>
          </div>
        )}

        {/* List view: status filter (right side) */}
        {view === "list" && (
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SubmissionStatus | "all")}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {FILTER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", STATUS_DOT[s])} />
                    {STATUS_META[s].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── MONTH VIEW ───────────────────────────────────────────────────── */}
      {view === "month" && (
        <Card>
          <CardContent className="p-2 sm:p-4">
            {/* Weekday headers */}
            <div className="mb-1 grid grid-cols-7 gap-0.5 sm:gap-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-ink-muted sm:text-[11px]">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d.slice(0, 1)}</span>
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
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
                    submittedCount={isSameMonth(d, cursor) ? (dayCountMap.get(iso) ?? 0) : undefined}
                    totalCount={isSameMonth(d, cursor) ? allActiveEmployees.length : undefined}
                  />
                );
              })}
            </div>
            <Legend />
          </CardContent>
        </Card>
      )}

      {/* ── WEEK VIEW ────────────────────────────────────────────────────── */}
      {view === "week" && (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="grid min-w-[480px] grid-cols-7 gap-2">
                {weekDays.map((d) => {
                  const iso = format(d, "yyyy-MM-dd");
                  const isT = isSameDay(d, today);
                  return (
                    <div key={iso} className="flex flex-col gap-1">
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
                        submittedCount={dayCountMap.get(iso) ?? 0}
                        totalCount={allActiveEmployees.length}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <Legend />
          </CardContent>
        </Card>
      )}

      {/* ── LIST VIEW ────────────────────────────────────────────────────── */}
      {view === "list" && (
        <Card className="overflow-hidden">
          {listGroups.length === 0 ? (
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle">
                <FileText className="h-6 w-6 text-ink-soft" />
              </div>
              <p className="font-semibold text-ink">No submissions found</p>
              <p className="mt-1 text-sm text-ink-muted">
                {statusFilter !== "all"
                  ? `No ${STATUS_META[statusFilter as SubmissionStatus]?.label ?? statusFilter} submissions in this period.`
                  : isAllMode
                  ? "No submissions have been recorded in this period."
                  : isSelf
                  ? "Your submitted work will appear here once you start submitting."
                  : `No submissions found for ${effectiveUser?.name ?? "this employee"} in this period.`}
              </p>
            </CardContent>
          ) : (
            <div className="divide-y divide-surface-border">
              {/* Summary bar */}
              <div className="flex items-center justify-between gap-2 bg-surface-subtle/60 px-4 py-2.5 sm:px-5">
                <span className="text-xs font-medium text-ink-muted">
                  {listItems.length} submission{listItems.length !== 1 ? "s" : ""}
                  {statusFilter !== "all" && (
                    <> &mdash; <span className="font-semibold text-ink">{STATUS_META[statusFilter as SubmissionStatus]?.label}</span></>
                  )}
                </span>
                {statusFilter !== "all" && (
                  <button
                    onClick={() => setStatusFilter("all")}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {visibleGroups.map(([date, subs]) => {
                const parsedDate = parseISO(date);
                const isT = isSameDay(parsedDate, today);
                return (
                  <div key={date}>
                    {/* Date group header */}
                    <div className={cn(
                      "flex items-center gap-3 border-b border-surface-border px-4 py-2 sm:px-5",
                      isT ? "bg-primary/5" : "bg-surface-subtle/40"
                    )}>
                      <div className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                        isT ? "bg-primary text-white" : "bg-white border border-surface-border text-ink"
                      )}>
                        {format(parsedDate, "d")}
                      </div>
                      <div>
                        <p className={cn(
                          "text-xs font-semibold",
                          isT ? "text-primary" : "text-ink"
                        )}>
                          {format(parsedDate, "EEEE, MMMM d, yyyy")}
                          {isT && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Today</span>}
                        </p>
                        {isAllMode && (
                          <p className="mt-0.5 text-[10px] text-ink-muted">
                            {subs.length} submission{subs.length !== 1 ? "s" : ""} · {new Set(subs.map(s => s.userId)).size} employee{new Set(subs.map(s => s.userId)).size !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Submission rows */}
                    <ul className="divide-y divide-surface-border/60">
                      {subs.map((s) => {
                        const submitter = isAllMode ? users.find((u) => u.id === s.userId) : null;
                        return (
                          <li
                            key={s.id}
                            className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-subtle/50 sm:gap-4 sm:px-5"
                          >
                            {/* Left: employee avatar (all mode) or time */}
                            {isAllMode && submitter ? (
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface-subtle text-[11px] font-semibold text-ink-muted">
                                {submitter.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            ) : (
                              <div className="w-10 flex-shrink-0 pt-0.5 text-center">
                                {s.submittedAt && (
                                  <span className="text-[11px] tabular-nums text-ink-muted">
                                    {format(new Date(s.submittedAt), "h:mm a")}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              {isAllMode && submitter && (
                                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-semibold text-ink">{submitter.name}</span>
                                  {s.submittedAt && (
                                    <span className="text-[10px] text-ink-soft">
                                      {format(new Date(s.submittedAt), "h:mm a")}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                                  STATUS_CHIP[s.status]
                                )}>
                                  <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_DOT[s.status])} />
                                  {STATUS_META[s.status].label}
                                </span>
                                {s.versionNumber > 1 && (
                                  <span className="rounded border border-surface-border bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                                    v{s.versionNumber}
                                  </span>
                                )}
                              </div>
                              {s.workSummary && (
                                <p className="mt-1.5 line-clamp-2 text-sm text-ink">{s.workSummary}</p>
                              )}
                              {s.tasksDetails && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{s.tasksDetails}</p>
                              )}
                            </div>

                            {/* View button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 flex-shrink-0 px-2 text-xs text-ink-muted hover:text-ink"
                              onClick={() => setModal(s)}
                            >
                              View
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-surface-border px-4 py-3 sm:px-5">
                  <span className="text-xs text-ink-muted">
                    Showing {listItems.length - hiddenCount} of {listItems.length} submissions
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setListLimit((l) => l + LIST_PAGE_SIZE)}
                    className="h-8 text-xs"
                  >
                    Load {Math.min(hiddenCount, LIST_PAGE_SIZE)} more
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <SubmissionDetailsModal
        open={!!modal}
        onOpenChange={(v) => !v && setModal(null)}
        submission={modal}
      />

      <DayDetailModal
        open={dayModalOpen}
        onOpenChange={setDayModalOpen}
        date={dayModalDate}
        scopedEmployees={scopedEmployees}
        allEmployeeIds={allEmployeeIds}
        submissions={submissions}
        totalEmployees={allActiveEmployees.length}
        canOverride={canSelect}
        departments={departments}
      />
    </div>
  );
}
