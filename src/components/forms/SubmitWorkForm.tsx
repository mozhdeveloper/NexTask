"use client";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UploadCloud, X, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submissionService } from "@/services/submission.service";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "@/hooks/useAuth";
import { fmtBytes } from "@/lib/dates";
import { todayISO } from "@/lib/dates";

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
  const allTypes = useDataStore((s) => s.submissionTypes);

  // Filter to active types that match the user's department (or apply to all)
  const availableTypes = useMemo(
    () =>
      allTypes.filter(
        (t) =>
          t.isActive &&
          (t.departmentId === null || t.departmentId === (user?.departmentId ?? null))
      ),
    [allTypes, user?.departmentId]
  );

  const [selectedTypeId, setSelectedTypeId] = useState<string>(() => availableTypes[0]?.id ?? "");
  const selectedType = availableTypes.find((t) => t.id === selectedTypeId) ?? availableTypes[0] ?? null;

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

  // Client-side file validation using the selected type's rules
  const addFiles = (incoming: File[]) => {
    if (!selectedType) return;
    const allowed = selectedType.allowedFileTypes;
    const maxBytes = selectedType.maxFileSizeMB * 1024 * 1024;
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

    if (rejected.length > 0) {
      toast.error(
        <div>
          <p className="font-medium">Some files were rejected:</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      );
    }
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
  };

  const onSubmit = async (v: FormValues) => {
    if (!selectedType) {
      toast.error("Please select a submission type.");
      return;
    }
    setBusy(true);
    try {
      await submissionService.create({
        date: v.date,
        submissionTypeId: selectedType.id,
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

  if (availableTypes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-ink-muted">
        <AlertCircle className="h-8 w-8 opacity-40" />
        <p className="text-sm">No active submission types available for your department.</p>
      </div>
    );
  }

  const acceptAttr = selectedType
    ? selectedType.allowedFileTypes.map((e) => "." + e).join(",")
    : "*";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Submission Type */}
      {availableTypes.length > 1 && (
        <div className="space-y-1.5">
          <Label>Submission Type</Label>
          <Select
            value={selectedTypeId}
            onValueChange={(v) => {
              setSelectedTypeId(v);
              setFiles([]); // clear files when type changes since rules differ
            }}
            disabled={locked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
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
        <Label>
          Attachments{" "}
          {selectedType && (
            <span className="font-normal text-ink-muted">
              — {selectedType.name} (Optional)
            </span>
          )}
        </Label>
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
                accept={acceptAttr}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {selectedType && (
              <div className="text-right text-[11px] text-ink-muted leading-relaxed">
                <span className="font-medium">
                  {selectedType.allowedFileTypes.join(", ").toUpperCase()}
                </span>
                <br />
                Max {selectedType.maxFileSizeMB} MB · Deadline {selectedType.deadlineTime}
              </div>
            )}
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
        <Button type="submit" disabled={busy || locked || !selectedType}>
          {existing ? "Update Submission" : "Submit Work"}
        </Button>
      </div>
    </form>
  );
}
