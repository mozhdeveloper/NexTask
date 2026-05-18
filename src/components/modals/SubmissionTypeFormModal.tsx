"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataStore } from "@/store/dataStore";
import { submissionTypeService } from "@/services/submissionType.service";
import type { SubmissionType } from "@/types";

// All supported file types grouped by category
const FILE_TYPE_GROUPS = [
  {
    label: "Documents",
    types: ["pdf", "doc", "docx"],
  },
  {
    label: "Spreadsheets",
    types: ["xls", "xlsx", "csv"],
  },
  {
    label: "Images",
    types: ["jpg", "jpeg", "png"],
  },
] as const;

const ALL_FILE_TYPES = FILE_TYPE_GROUPS.flatMap((g) => g.types) as string[];

const DEFAULT_FILE_TYPES = ["pdf", "docx", "xlsx", "jpg", "png"];

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  departmentId: z.string(),
  requiredDaily: z.boolean(),
  deadlineTime: z.string().min(1, "Deadline time is required"),
  maxFileSizeMB: z.number().min(1).max(100),
  isActive: z.boolean(),
});
type V = z.infer<typeof schema>;

export function SubmissionTypeFormModal({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: SubmissionType | null;
}) {
  const departments = useDataStore((s) => s.departments);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(DEFAULT_FILE_TYPES);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      departmentId: "",
      requiredDaily: true,
      deadlineTime: "18:00",
      maxFileSizeMB: 10,
      isActive: true,
    },
  });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        departmentId: editing.departmentId ?? "",
        requiredDaily: editing.requiredDaily,
        deadlineTime: editing.deadlineTime,
        maxFileSizeMB: editing.maxFileSizeMB,
        isActive: editing.isActive,
      });
      setSelectedTypes(editing.allowedFileTypes);
    } else {
      reset({
        name: "",
        departmentId: "",
        requiredDaily: true,
        deadlineTime: "18:00",
        maxFileSizeMB: 10,
        isActive: true,
      });
      setSelectedTypes(DEFAULT_FILE_TYPES);
    }
    setFileTypeError(null);
  }, [editing, open, reset]);

  const toggleType = (ext: string) => {
    setSelectedTypes((prev) =>
      prev.includes(ext) ? prev.filter((t) => t !== ext) : [...prev, ext]
    );
    setFileTypeError(null);
  };

  const toggleGroup = (types: readonly string[]) => {
    const allOn = types.every((t) => selectedTypes.includes(t));
    if (allOn) {
      setSelectedTypes((prev) => prev.filter((t) => !types.includes(t)));
    } else {
      setSelectedTypes((prev) => Array.from(new Set([...prev, ...types])));
    }
    setFileTypeError(null);
  };

  const onSubmit = async (v: V) => {
    if (selectedTypes.length === 0) {
      setFileTypeError("Select at least one file type.");
      return;
    }

    const payload = {
      name: v.name,
      departmentId: v.departmentId || null,
      requiredDaily: v.requiredDaily,
      deadlineTime: v.deadlineTime,
      allowedFileTypes: selectedTypes,
      maxFileSizeMB: v.maxFileSizeMB,
      isActive: v.isActive,
    };

    try {
      if (editing) {
        await submissionTypeService.update(editing.id, payload);
        toast.success("Submission type updated.");
      } else {
        await submissionTypeService.create(payload);
        toast.success("Submission type created.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const requiredDaily = watch("requiredDaily");
  const isActive = watch("isActive");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit submission type" : "New submission type"}</DialogTitle>
          <DialogDescription>
            Configure what employees submit daily and what files are accepted.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...register("name")} placeholder="e.g. Daily Work Report" />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          {/* Department */}
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={watch("departmentId")}
              onValueChange={(v) => setValue("departmentId", v === "_all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Deadline Time */}
            <div className="space-y-1.5">
              <Label>Deadline time</Label>
              <Input type="time" {...register("deadlineTime")} />
              {errors.deadlineTime && (
                <p className="text-xs text-danger">{errors.deadlineTime.message}</p>
              )}
            </div>

            {/* Max file size */}
            <div className="space-y-1.5">
              <Label>Max file size (MB)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                {...register("maxFileSizeMB", { valueAsNumber: true })}
              />
              {errors.maxFileSizeMB && (
                <p className="text-xs text-danger">{errors.maxFileSizeMB.message}</p>
              )}
            </div>
          </div>

          {/* Allowed File Types — toggle buttons grouped by category */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Allowed file types</Label>
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() =>
                  setSelectedTypes(
                    selectedTypes.length === ALL_FILE_TYPES.length ? [] : [...ALL_FILE_TYPES]
                  )
                }
              >
                {selectedTypes.length === ALL_FILE_TYPES.length ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-surface-border p-3">
              {FILE_TYPE_GROUPS.map((group) => {
                const allOn = group.types.every((t) => selectedTypes.includes(t));
                const someOn = group.types.some((t) => selectedTypes.includes(t));
                return (
                  <div key={group.label}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.types)}
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold transition-colors ${
                          allOn
                            ? "border-primary bg-primary text-white"
                            : someOn
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-surface-border bg-white"
                        }`}
                      >
                        {allOn && <Check className="h-2.5 w-2.5" />}
                        {someOn && !allOn && <span>–</span>}
                      </button>
                      <span className="text-xs font-medium text-ink-muted">{group.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {group.types.map((ext) => {
                        const on = selectedTypes.includes(ext);
                        return (
                          <button
                            key={ext}
                            type="button"
                            onClick={() => toggleType(ext)}
                            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-surface-border bg-white text-ink-muted hover:border-primary/40 hover:text-ink"
                            }`}
                          >
                            {ext}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {fileTypeError && <p className="text-xs text-danger">{fileTypeError}</p>}

            {selectedTypes.length > 0 && (
              <p className="text-[11px] text-ink-muted">
                {selectedTypes.length} type{selectedTypes.length !== 1 ? "s" : ""} selected:{" "}
                <span className="font-medium">{selectedTypes.join(", ").toUpperCase()}</span>
              </p>
            )}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                type="button"
                role="switch"
                aria-checked={requiredDaily}
                onClick={() => setValue("requiredDaily", !requiredDaily)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  requiredDaily ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                    requiredDaily ? "translate-x-[18px]" : ""
                  }`}
                />
              </button>
              Required daily
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setValue("isActive", !isActive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isActive ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-[18px]" : ""
                  }`}
                />
              </button>
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
