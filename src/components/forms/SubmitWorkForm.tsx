"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UploadCloud, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { submissionService } from "@/services/submission.service";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "@/hooks/useAuth";
import { fmtBytes } from "@/lib/dates";
import { todayISO } from "@/lib/dates";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_MB } from "@/lib/constants";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  workSummary: z.string().min(3, "Add a brief summary"),
  tasksDetails: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function SubmitWorkForm({
  onSubmitted,
  defaultDate,
}: {
  onSubmitted?: () => void;
  defaultDate?: string;
}) {
  const user = useAuth();
  const submissionTypes = useDataStore((s) => s.submissionTypes);
  const dailyType = submissionTypes.find((t) => t.id === "st_daily");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const today = defaultDate ?? todayISO();
  const existing = user
    ? submissionService.forUserOnDate(user.id, today)
    : null;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: today,
      workSummary: existing?.workSummary ?? "",
      tasksDetails: existing?.tasksDetails ?? "",
    },
  });

  const locked = !!existing?.locked;

  const onSubmit = async (v: FormValues) => {
    if (!dailyType) {
      toast.error("Submission type not loaded. Please refresh the page.");
      return;
    }
    setBusy(true);
    try {
      await submissionService.create({
        date: v.date,
        submissionTypeId: dailyType.id,
        workSummary: v.workSummary,
        tasksDetails: v.tasksDetails ?? "",
        files,
      });
      toast.success("Work submitted successfully.");
      setFiles([]);
      reset({ date: v.date, workSummary: v.workSummary, tasksDetails: v.tasksDetails });
      onSubmitted?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" {...register("date")} disabled={locked} />
        {errors.date && <p className="text-xs text-danger">{errors.date.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workSummary">Work Summary</Label>
        <Textarea
          id="workSummary"
          placeholder="What have you worked on today?"
          rows={3}
          disabled={locked}
          {...register("workSummary")}
        />
        {errors.workSummary && (
          <p className="text-xs text-danger">{errors.workSummary.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tasksDetails">Tasks / Details</Label>
        <Textarea
          id="tasksDetails"
          placeholder="Describe your tasks, progress, and key updates…"
          rows={4}
          disabled={locked}
          {...register("tasksDetails")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Attachments <span className="font-normal text-ink-muted">(Optional)</span></Label>
        <div className="rounded-lg border border-dashed border-surface-border p-3">
          <div className="flex items-center justify-between gap-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-surface-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-subtle ${
                locked ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <UploadCloud className="h-4 w-4" />
              Upload Files
              <input
                type="file"
                multiple
                hidden
                disabled={locked}
                accept={ALLOWED_FILE_TYPES.map((e) => "." + e).join(",")}
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  setFiles((prev) => [...prev, ...list]);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <div className="text-[11px] text-ink-muted">
              {ALLOWED_FILE_TYPES.join(", ").toUpperCase()} (Max {MAX_FILE_SIZE_MB}MB)
            </div>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-md bg-surface-subtle px-2 py-1 text-xs"
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-ink-muted">({fmtBytes(f.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded p-0.5 text-ink-muted hover:bg-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        {locked ? (
          <p className="text-xs text-ink-muted">
            Submission is locked. Request a revision to edit.
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy || locked}>
          {existing ? "Update Submission" : "Submit Work"}
        </Button>
      </div>
    </form>
  );
}
