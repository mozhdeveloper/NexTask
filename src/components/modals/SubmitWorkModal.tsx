"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  UploadCloud, X, FileText, AlertCircle, Clock3, CheckCircle2, Paperclip,
} from "lucide-react";
import {
  Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { submissionService } from "@/services/submission.service";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "@/hooks/useAuth";
import { fmtBytes, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const schema = z.object({
  workSummary: z.string().min(10, "Please add at least a 10-character summary of your work."),
  tasksDetails: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function fmtTime12(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(start: Date, end: Date): string {
  const ms = Math.max(0, end.getTime() - start.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SubmitWorkModal({
  open,
  onOpenChange,
  date,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date?: string;
  onSubmitted?: () => void;
}) {
  const user = useAuth();
  const allTypes = useDataStore((s) => s.submissionTypes);
  const today = date ?? todayISO();

  const availableTypes = useMemo(
    () =>
      allTypes.filter(
        (t) =>
          t.isActive &&
          (t.departmentId === null || t.departmentId === (user?.departmentId ?? null))
      ),
    [allTypes, user?.departmentId]
  );

  const existing = user ? submissionService.forUserOnDate(user.id, today) : null;
  const locked = !!existing?.locked;
  const typeLocked = locked || !!existing?.startedAt;

  const [selectedTypeId, setSelectedTypeId] = useState<string>(() => existing?.submissionTypeId ?? availableTypes[0]?.id ?? "");
  const selectedType = availableTypes.find((t) => t.id === selectedTypeId) ?? availableTypes[0] ?? null;

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync type when existing submission loads
  useEffect(() => {
    if (existing?.submissionTypeId && existing.submissionTypeId !== selectedTypeId) {
      setSelectedTypeId(existing.submissionTypeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.submissionTypeId]);

  const { register, handleSubmit, formState: { errors }, watch, reset: resetForm } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workSummary: existing?.workSummary ?? "",
      tasksDetails: existing?.tasksDetails ?? "",
    },
  });

  // Reset form values when modal opens (picks up latest existing data)
  useEffect(() => {
    if (open) {
      resetForm({
        workSummary: existing?.workSummary ?? "",
        tasksDetails: existing?.tasksDetails ?? "",
      });
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const summaryVal = watch("workSummary") ?? "";
  const detailsVal = watch("tasksDetails") ?? "";

  const acceptAttr = selectedType
    ? selectedType.allowedFileTypes.map((e) => "." + e).join(",")
    : "*";

  const addFiles = (incoming: File[]) => {
    if (!selectedType) return;
    const allowed = selectedType.allowedFileTypes;
    const maxBytes = selectedType.maxFileSizeMB * 1024 * 1024;
    const slotsLeft = selectedType.maxFiles - files.length;
    if (slotsLeft <= 0) {
      toast.error(`Max ${selectedType.maxFiles} file${selectedType.maxFiles === 1 ? "" : "s"} allowed per submission.`);
      return;
    }
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      const ext = (f.name.split(".").pop() ?? "").toLowerCase();
      if (!allowed.includes(ext)) {
        rejected.push(`${f.name} — .${ext} not allowed`);
      } else if (f.size > maxBytes) {
        rejected.push(`${f.name} — exceeds ${selectedType.maxFileSizeMB} MB`);
      } else {
        accepted.push(f);
      }
    }
    const capped = accepted.slice(0, slotsLeft);
    if (accepted.length > slotsLeft) {
      toast.error(`Only ${slotsLeft} more file${slotsLeft === 1 ? "" : "s"} can be added (max ${selectedType.maxFiles}).`);
    } else if (rejected.length > 0) {
      toast.error(`${rejected.length} file(s) rejected: ${rejected[0]}${rejected.length > 1 ? ` (+${rejected.length - 1} more)` : ""}`);
    }
    if (capped.length > 0) setFiles((prev) => [...prev, ...capped]);
  };

  const onSubmit = async (v: FormValues) => {
    if (!selectedType) return toast.error("Please select a submission type.");
    setBusy(true);
    try {
      await submissionService.create({
        date: today,
        submissionTypeId: selectedType.id,
        taskTitle: existing?.taskTitle ?? undefined,
        workSummary: v.workSummary.trim(),
        tasksDetails: v.tasksDetails?.trim() ?? "",
        files,
      });
      toast.success("Work submitted! Great job today. 🎉");
      onOpenChange(false);
      onSubmitted?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isRevisionReupload = !locked && existing?.status === "revision_approved";

  const elapsed =
    existing?.startedAt && !existing.submittedAt
      ? formatElapsed(new Date(existing.startedAt), new Date())
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0 border-b border-surface-border bg-surface-subtle px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-ink">
                {locked
                  ? "Submission locked"
                  : isRevisionReupload
                  ? "Re-upload revised submission"
                  : existing?.workSummary
                  ? "Update submission"
                  : "Submit daily work"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span>
                  {new Date(today).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </span>
                {selectedType && (
                  <>
                    <span className="text-ink-soft">·</span>
                    <span className="font-medium text-ink">{selectedType.name}</span>
                  </>
                )}
                {existing?.startedAt && (
                  <>
                    <span className="text-ink-soft">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      Started {fmtTime12(existing.startedAt)}
                    </span>
                  </>
                )}
                {elapsed && (
                  <>
                    <span className="text-ink-soft">·</span>
                    <span className="font-semibold text-primary">{elapsed} elapsed</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {existing?.taskTitle && (
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {existing.taskTitle}
              </span>
            )}
            <DialogClose asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* ── Scrollable form body ── */}
        <form
          id="submit-work-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto"
        >
          {locked ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-base font-semibold text-ink">Submission locked</p>
              <p className="max-w-sm text-sm text-ink-muted">
                Your work has been submitted and locked. To make changes, close this modal and
                request a revision from the main page.
              </p>
            </div>
          ) : availableTypes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-ink-muted">
              <AlertCircle className="h-10 w-10 opacity-40" />
              <p className="text-sm">No active submission types for your department.</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-surface-border">

              {/* ── Revision re-upload notice ── */}
              {isRevisionReupload && (
                <div className="border-b border-emerald-200 bg-emerald-50/60 px-6 py-3">
                  <p className="text-sm font-semibold text-emerald-700">Revision re-upload</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Your revision request was approved. Upload your corrected files and updated work summary below.
                    Once submitted, this entry will be locked again.
                  </p>
                </div>
              )}

              {/* Submission type — only shown if multiple types & not locked */}
              {availableTypes.length > 1 && (
                <div className="px-6 py-4">
                  <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Submission type
                  </Label>
                  <Select
                    value={selectedTypeId}
                    onValueChange={(v) => { setSelectedTypeId(v); setFiles([]); }}
                    disabled={typeLocked}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Work Summary */}
              <div className="px-6 py-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="workSummary" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Work description <span className="ml-0.5 text-danger">*</span>
                  </Label>
                  <span className={cn("text-xs tabular-nums", summaryVal.length < 10 ? "text-danger" : "text-ink-muted")}>
                    {summaryVal.length} / 2000
                  </span>
                </div>
                <Textarea
                  id="workSummary"
                  placeholder="Summarize what you accomplished today. What did you build, fix, or progress? Be specific enough for your manager to understand your output."
                  rows={5}
                  maxLength={2000}
                  disabled={locked}
                  className="resize-none"
                  {...register("workSummary")}
                />
                {errors.workSummary && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                    <AlertCircle className="h-3 w-3" />
                    {errors.workSummary.message}
                  </p>
                )}
              </div>

              {/* Tasks & Details */}
              <div className="px-6 py-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="tasksDetails" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Tasks & details{" "}
                    <span className="ml-1 font-normal normal-case tracking-normal text-ink-soft">(optional)</span>
                  </Label>
                  {detailsVal && (
                    <span className="text-xs tabular-nums text-ink-muted">{detailsVal.length} / 3000</span>
                  )}
                </div>
                <Textarea
                  id="tasksDetails"
                  placeholder={"• Task 1 — completed the login flow\n• Bug fix — resolved #482 payment timeout\n• Review — gave feedback on PR #29\n• Meeting — sprint planning with team"}
                  rows={5}
                  maxLength={3000}
                  disabled={locked}
                  className="resize-none font-mono text-sm"
                  {...register("tasksDetails")}
                />
              </div>

              {/* File Attachments */}
              <div className="px-6 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Attachments{" "}
                    <span className="ml-1 font-normal normal-case tracking-normal text-ink-soft">(optional)</span>
                  </Label>
                  {selectedType && (
                    <span className="text-[11px] text-ink-muted">
                      {selectedType.allowedFileTypes.map((e) => e.toUpperCase()).join(", ")} · max {selectedType.maxFileSizeMB} MB · up to {selectedType.maxFiles} file{selectedType.maxFiles === 1 ? "" : "s"} · deadline {selectedType.deadlineTime}
                    </span>
                  )}
                </div>

                {/* Drag-and-drop zone */}
                <div
                  className={cn(
                    "relative rounded-xl border-2 border-dashed transition-colors",
                    dragging
                      ? "border-primary bg-primary-soft/30"
                      : "border-surface-border bg-surface-subtle/50 hover:border-primary/40 hover:bg-primary-soft/10",
                    locked && "pointer-events-none opacity-50"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(Array.from(e.dataTransfer.files));
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept={acceptAttr}
                    disabled={locked}
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files ?? []));
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      dragging ? "bg-primary/20 text-primary" : "bg-surface-border/60 text-ink-muted"
                    )}>
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Click to upload
                      </button>
                      <span className="text-sm text-ink-muted"> or drag & drop files here</span>
                    </div>
                    <p className="text-xs text-ink-soft">
                      {selectedType
                        ? `Accepted: ${selectedType.allowedFileTypes.map((e) => e.toUpperCase()).join(", ")} · up to ${selectedType.maxFileSizeMB} MB each · max ${selectedType.maxFiles} file${selectedType.maxFiles === 1 ? "" : "s"}`
                        : "Any file type"}
                    </p>
                  </div>
                </div>

                {/* Attached file list */}
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <span className="truncate font-medium text-ink">{f.name}</span>
                          <span className="shrink-0 text-xs text-ink-muted">{fmtBytes(f.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-2 shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Previously uploaded attachments (from existing submission) */}
                {existing?.attachments && existing.attachments.length > 0 && files.length === 0 && (
                  <div className="mt-2">
                    <p className="mb-1.5 text-[11px] text-ink-muted">Previously uploaded:</p>
                    <ul className="space-y-1.5">
                      {existing.attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-subtle">
                            <Paperclip className="h-3.5 w-3.5 text-ink-muted" />
                          </div>
                          <span className="min-w-0 truncate text-ink">{a.originalName}</span>
                          <span className="shrink-0 text-xs text-ink-muted">{fmtBytes(a.sizeBytes)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        {/* ── Footer ── */}
        {!locked && availableTypes.length > 0 && (
          <DialogFooter className="shrink-0 border-t border-surface-border bg-white px-6 py-4">
            <div className="flex w-full items-center justify-between gap-4">
              <p className="text-xs text-ink-muted">
                Submitting for{" "}
                <span className="font-medium text-ink">
                  {new Date(today).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </span>
                {files.length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Paperclip className="h-2.5 w-2.5" />
                    {files.length} file{files.length !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="submit-work-form"
                  disabled={busy || !selectedType}
                  className="min-w-32 gap-2"
                >
                  {busy ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {existing?.workSummary ? "Update submission" : "Submit work"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
