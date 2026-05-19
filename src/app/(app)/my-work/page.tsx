"use client";
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth, useRequireRole } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { StatusPill } from "@/components/ui/status-pill";
import { useSearchParams } from "next/navigation";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { SubmitWorkModal } from "@/components/modals/SubmitWorkModal";
import { submissionService } from "@/services/submission.service";
import { toast } from "sonner";
import {
  Play, CheckCircle2, Clock3, RotateCcw, Lock, Pencil, AlertCircle,
  CalendarDays, FileCheck2, ArrowUpRight, Timer, FileText, UploadCloud,
} from "lucide-react";
import { workSettingsService } from "@/services/workSettings.service";
import { RevisionRequestModal } from "@/components/modals/RevisionRequestModal";
import { cn } from "@/lib/utils";
import type { Submission } from "@/types";

export default function MyWorkPage() {
  const { ready } = useRequireRole(["employee"]);
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const allTypes = useDataStore((s) => s.submissionTypes);
  const [detailSub, setDetailSub] = useState<Submission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? undefined;

  const today = todayISO();
  const targetDate = dateParam ?? today;
  const isToday = targetDate === today;

  const availableTypes = useMemo(
    () =>
      allTypes.filter(
        (t) =>
          t.isActive &&
          (t.departmentId === null || t.departmentId === (user?.departmentId ?? null)),
      ),
    [allTypes, user?.departmentId],
  );

  const [taskTitle, setTaskTitle] = useState("");
  const [typeId, setTypeId] = useState("");
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tick, setTick] = useState(0);

  // Live clock for elapsed timer
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!ready || !user) return null;

  const todaySub =
    submissions.find((s) => s.userId === user.id && s.date === targetDate) ?? null;
  const recent = submissions
    .filter((s) => s.userId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const started = !!todaySub?.startedAt;
  const finished = !!todaySub?.submittedAt;
  const locked = !!todaySub?.locked;

  const isMissingToday =
    isToday &&
    !todaySub &&
    workSettingsService.isWorkingDay(today) &&
    !workSettingsService.isHoliday(today) &&
    workSettingsService.isPastWorkEnd();

  const elapsed =
    todaySub?.startedAt
      ? formatElapsed(
          new Date(todaySub.startedAt),
          todaySub.submittedAt ? new Date(todaySub.submittedAt) : new Date(),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          tick,
        )
      : null;

  const handleStart = async () => {
    const tid = typeId || availableTypes[0]?.id;
    if (!tid) return toast.error("No submission type available for your department.");
    if (!taskTitle.trim()) return toast.error("Enter what you're working on today.");
    setStarting(true);
    try {
      await submissionService.startDay({ date: targetDate, submissionTypeId: tid, taskTitle });
      toast.success("Workday started — go get it done!");
      setTaskTitle("");
      setSubmitOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleReset = async () => {
    const isLocked = !!todaySub?.locked;
    const msg = isLocked
      ? "This will permanently delete your submitted work for this day (including attachments). Continue?"
      : "Reset today's workday? This clears your started time and task title.";
    if (!confirm(msg)) return;
    setResetting(true);
    try {
      if (isLocked) await submissionService.forceResetDay(targetDate);
      else await submissionService.resetDay(targetDate);
      toast.success("Day reset — you can start over.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  // ── Status styling helpers ──────────────────────────────────────────────
  const statusMeta = (() => {
    if (finished && locked) {
      const s = todaySub.status;
      if (s === "revision_requested")
        return { label: "Awaiting review", color: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" };
      if (s === "revision_approved" || s === "submitted")
        return { label: "Approved", color: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" };
      if (s === "late")
        return { label: "Late submission", color: "bg-orange-50 border-orange-200 text-orange-700", dot: "bg-orange-500" };
      if (s === "revision_rejected")
        return { label: "Revision rejected", color: "bg-rose-50 border-rose-200 text-rose-700", dot: "bg-rose-500" };
      return { label: "Submitted", color: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" };
    }
    if (started)
      return { label: "In progress", color: "bg-primary-soft/60 border-primary/20 text-primary", dot: "bg-primary animate-pulse" };
    if (isMissingToday)
      return { label: "Missing", color: "bg-rose-50 border-rose-200 text-rose-700", dot: "bg-rose-500" };
    return null;
  })();

  const dateLabel = new Date(targetDate).toLocaleDateString([], {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work"
        description={`Track your task for ${fmtDate(targetDate)}.`}
      />

      {/* ── Hero status card ─────────────────────────────────────────── */}
      <Card className={cn(
        "overflow-hidden",
        finished && locked && "border-emerald-200",
        started && !finished && "border-primary/30",
        isMissingToday && "border-rose-200",
      )}>
        <CardContent className="p-0">
          {/* Top accent strip */}
          <div className={cn(
            "h-1 w-full",
            finished && locked ? "bg-emerald-400" : started ? "bg-primary" : isMissingToday ? "bg-rose-400" : "bg-surface-border",
          )} />

          <div className="px-6 py-5">
            {/* Header row */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-ink-muted" />
                  <span className="text-sm font-medium text-ink">{dateLabel}</span>
                  {!isToday && (
                    <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] text-ink-muted">Past date</span>
                  )}
                </div>
                {statusMeta && (
                  <div className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                    statusMeta.color,
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                    {statusMeta.label}
                  </div>
                )}
              </div>

              {/* Timer / elapsed display */}
              {(started || finished) && elapsed && (
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                    {finished ? "Total time" : "Time elapsed"}
                  </p>
                  <p className={cn(
                    "mt-0.5 font-mono text-3xl font-bold tabular-nums",
                    finished ? "text-emerald-600" : "text-primary",
                  )}>
                    {elapsed}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {fmtTime(todaySub?.startedAt ?? null)} → {finished ? fmtTime(todaySub?.submittedAt ?? null) : "now"}
                  </p>
                </div>
              )}
            </div>

            {/* ── STATE: Not started ── */}
            {!started && !finished && !isMissingToday && (
              <div className="mt-5">
                <p className="mb-3 text-sm text-ink-muted">
                  Tell us what you&apos;re working on today, then click <strong className="text-ink">Start day</strong> to begin tracking.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] md:grid-cols-[1fr_220px_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-ink-muted">What are you working on today?</Label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g. Finalize Q4 report, fix login bug, etc."
                      onKeyDown={(e) => e.key === "Enter" && handleStart()}
                      className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {availableTypes.length > 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-ink-muted">Submission type</Label>
                      <Select value={typeId || availableTypes[0]?.id} onValueChange={setTypeId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTypes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-end">
                    <Button
                      onClick={handleStart}
                      disabled={starting || availableTypes.length === 0}
                      className="h-10 w-full gap-2 sm:w-auto"
                    >
                      {starting ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Start day
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STATE: Missing ── */}
            {isMissingToday && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-semibold text-rose-700">Marked as missing</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    You didn&apos;t submit today&apos;s work before the end of the working day. This date appears as missing on your record.
                  </p>
                </div>
              </div>
            )}

            {/* ── STATE: Started (in progress) ── */}
            {started && !finished && (
              <div className="mt-5 space-y-4">
                {/* Task info row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-subtle px-3 py-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Working on</p>
                      <p className="text-sm font-medium text-ink">{todaySub?.taskTitle ?? "Untitled task"}</p>
                    </div>
                  </div>
                  {todaySub && allTypes.find((t) => t.id === todaySub.submissionTypeId) && (
                    <div className="rounded-full border border-primary/20 bg-primary-soft/40 px-3 py-1 text-xs font-medium text-primary">
                      {allTypes.find((t) => t.id === todaySub.submissionTypeId)?.name}
                    </div>
                  )}
                </div>

                {/* What's needed callout */}
                <div className="rounded-xl border border-primary/20 bg-primary-soft/20 p-4">
                  <p className="mb-2 text-sm font-semibold text-ink">Ready to wrap up? Submit your work:</p>
                  <div className="grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span><strong className="text-ink">Work description</strong> — what you accomplished today</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span><strong className="text-ink">Task breakdown</strong> — specific tasks completed</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <UploadCloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span><strong className="text-ink">Attachments</strong> — reports, screenshots (optional)</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => setSubmitOpen(true)}
                      className="gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Open submission form
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting} className="gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" /> Reset day
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STATE: Submitted & locked ── */}
            {finished && locked && todaySub && (
              <div className="mt-5 space-y-4">
                {/* Summary preview */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-emerald-700">
                          Work submitted at {fmtTime(todaySub.submittedAt)}
                        </p>
                        <StatusPill status={todaySub.status} />
                      </div>
                      {todaySub.taskTitle && (
                        <p className="mt-1 text-xs font-medium text-ink">{todaySub.taskTitle}</p>
                      )}
                      {todaySub.workSummary && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">{todaySub.workSummary}</p>
                      )}
                      {todaySub.attachments.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-muted">
                          {todaySub.attachments.length} attachment{todaySub.attachments.length !== 1 ? "s" : ""} included
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setDetailSub(todaySub); setDetailOpen(true); }}
                    className="gap-1.5"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    View full details
                  </Button>
                  {!["revision_requested", "revision_rejected"].includes(todaySub.status) && (
                    <Button size="sm" onClick={() => setRevOpen(true)} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      Request revision
                    </Button>
                  )}
                  {todaySub.status === "revision_requested" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      <Clock3 className="h-3 w-3" />
                      Awaiting admin/manager approval
                    </span>
                  )}
                  {todaySub.status === "revision_rejected" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                      <AlertCircle className="h-3 w-3" />
                      Revision rejected
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={resetting}
                    className="ml-auto gap-1.5 text-ink-muted hover:text-danger"
                    title="Wipe today's submission"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Bottom row: This Week + Recent ──────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

        {/* This Week */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">This week</CardTitle>
            <CardDescription>Your submission status for each day this week.</CardDescription>
          </CardHeader>
          <CardContent>
            <WeekRow userId={user.id} submissions={submissions} targetDate={targetDate} />
          </CardContent>
        </Card>

        {/* Recent submissions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Recent submissions</CardTitle>
              <span className="text-xs text-ink-muted">{recent.length} records</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-ink-muted">
                <CalendarDays className="h-7 w-7 opacity-30" />
                <p className="text-sm">No submissions yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-surface-border">
                {recent.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-subtle"
                      onClick={() => { setDetailSub(s); setDetailOpen(true); }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{fmtDate(s.date)}</p>
                        {s.taskTitle && (
                          <p className="mt-0.5 truncate text-xs text-ink-muted">{s.taskTitle}</p>
                        )}
                      </div>
                      <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                        <StatusPill status={s.status} />
                        <span className="text-[11px] tabular-nums text-ink-soft">{fmtTime(s.submittedAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Modals ── */}
      <SubmitWorkModal
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        date={targetDate}
      />
      <SubmissionDetailsModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        submission={detailSub}
      />
      {todaySub && (
        <RevisionRequestModal
          open={revOpen}
          onOpenChange={setRevOpen}
          submissionId={todaySub.id}
        />
      )}
    </div>
  );
}

// ── Week overview row ────────────────────────────────────────────────────────
function WeekRow({
  userId,
  submissions,
  targetDate,
}: {
  userId: string;
  submissions: Submission[];
  targetDate: string;
}) {
  const today = todayISO();
  // Build Mon–Sun for the week containing targetDate
  const anchor = new Date(targetDate + "T12:00:00");
  const dow = anchor.getDay(); // 0=Sun
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + monOffset + i);
    return d.toISOString().slice(0, 10);
  });

  const statusColors: Record<string, string> = {
    submitted: "border-emerald-300 bg-emerald-50 text-emerald-700",
    late: "border-orange-300 bg-orange-50 text-orange-700",
    missing: "border-rose-300 bg-rose-50 text-rose-700",
    revision_requested: "border-amber-300 bg-amber-50 text-amber-700",
    revision_approved: "border-emerald-300 bg-emerald-50 text-emerald-700",
    revision_rejected: "border-rose-300 bg-rose-50 text-rose-700",
    locked: "border-emerald-300 bg-emerald-50 text-emerald-700",
    excused: "border-sky-300 bg-sky-50 text-sky-700",
    pending: "border-surface-border bg-surface-subtle text-ink-muted",
  };

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((iso) => {
        const sub = submissions.find((s) => s.userId === userId && s.date === iso);
        const isToday = iso === today;
        const isTarget = iso === targetDate;
        const dayName = new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: "short" });
        const dayNum = new Date(iso + "T12:00:00").getDate();
        const colorClass = sub ? (statusColors[sub.status] ?? statusColors.pending) : statusColors.pending;

        return (
          <div
            key={iso}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center",
              colorClass,
              isToday && !sub && "border-primary/40 bg-primary-soft/30 text-primary",
              isTarget && "ring-2 ring-primary/30 ring-offset-1",
            )}
          >
            <span className="text-[10px] font-semibold uppercase opacity-70">{dayName}</span>
            <span className="text-sm font-bold tabular-nums">{dayNum}</span>
            {sub ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : isToday ? (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-30" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatElapsed(start: Date, end: Date, _tick?: number): string {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
