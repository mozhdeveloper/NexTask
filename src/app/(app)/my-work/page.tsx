"use client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitWorkForm } from "@/components/forms/SubmitWorkForm";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth, useRequireRole } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { StatusPill } from "@/components/ui/status-pill";
import { useSearchParams } from "next/navigation";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import { submissionService } from "@/services/submission.service";
import { toast } from "sonner";
import { Play, CheckCircle2, Clock3 } from "lucide-react";
import type { Submission } from "@/types";

export default function MyWorkPage() {
  const { ready } = useRequireRole(["employee"]);
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const allTypes = useDataStore((s) => s.submissionTypes);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? undefined;

  const today = todayISO();
  const targetDate = dateParam ?? today;

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

  if (!ready || !user) return null;

  const todaySub =
    submissions.find((s) => s.userId === user.id && s.date === targetDate) ?? null;
  const recent = submissions
    .filter((s) => s.userId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const started = !!todaySub?.startedAt;
  const finished = !!todaySub?.submittedAt;

  const handleStart = async () => {
    const tid = typeId || availableTypes[0]?.id;
    if (!tid) return toast.error("No submission type available for your department.");
    if (!taskTitle.trim()) return toast.error("Tell us what you're working on today.");
    setStarting(true);
    try {
      await submissionService.startDay({ date: targetDate, submissionTypeId: tid, taskTitle });
      toast.success("Workday started — go get it done!");
      setTaskTitle("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const elapsed = todaySub?.startedAt
    ? formatElapsed(
        new Date(todaySub.startedAt),
        todaySub.submittedAt ? new Date(todaySub.submittedAt) : new Date(),
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work"
        description={`Track your task for ${fmtDate(targetDate)}.`}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>
                {finished ? "Today's task" : started ? "Task in progress" : "Start your workday"}
              </CardTitle>
              <CardDescription>
                {finished
                  ? "Completed — see your summary below."
                  : started
                    ? "When you finish, fill in the summary and submit your work."
                    : "Tell us what you're tackling, then click Start to begin tracking time."}
              </CardDescription>
            </div>
            {started && (
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  finished ? "bg-success-soft text-success" : "bg-amber-50 text-amber-700"
                }`}
              >
                {finished ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {finished ? "Finished" : "In progress"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!started ? (
            <div className="grid gap-4 md:grid-cols-[1fr_220px_140px]">
              <div className="space-y-1.5">
                <Label>What are you working on today?</Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Finalize Q4 report draft"
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                />
              </div>
              {availableTypes.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Submission type</Label>
                  <Select
                    value={typeId || availableTypes[0]?.id}
                    onValueChange={setTypeId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end">
                <Button
                  onClick={handleStart}
                  disabled={starting || availableTypes.length === 0}
                  className="w-full gap-2"
                >
                  <Play className="h-4 w-4" /> Start day
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-surface-border bg-surface-subtle px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Working on
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-ink">
                    {todaySub?.taskTitle ?? "Untitled task"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Started
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums text-ink">
                    {fmtTime(todaySub?.startedAt ?? null)}
                  </p>
                </div>
                {elapsed && (
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {finished ? "Total" : "Elapsed"}
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-ink">{elapsed}</p>
                  </div>
                )}
                {finished && todaySub?.submittedAt && (
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Finished
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-ink">
                      {fmtTime(todaySub.submittedAt)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              {finished ? "Update your submission" : started ? "Finish & submit" : "Submission form"}
            </CardTitle>
            <CardDescription>
              {started
                ? "Add a summary, attach any deliverables, then submit to mark today complete."
                : "Start your day first to unlock the submission form."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {started ? (
              <SubmitWorkForm defaultDate={targetDate} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-ink-muted">
                <Clock3 className="h-8 w-8 opacity-40" />
                <p className="text-sm">
                  Click <span className="font-semibold text-ink">Start day</span> above to begin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>At</TH>
                </TR>
              </THead>
              <TBody>
                {recent.map((s) => (
                  <TR
                    key={s.id}
                    className="cursor-pointer hover:bg-surface-subtle"
                    onClick={() => {
                      setSelected(s);
                      setOpen(true);
                    }}
                  >
                    <TD>{fmtDate(s.date, "MMM dd")}</TD>
                    <TD>
                      <StatusPill status={s.status} />
                    </TD>
                    <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />
    </div>
  );
}

function formatElapsed(start: Date, end: Date): string {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
