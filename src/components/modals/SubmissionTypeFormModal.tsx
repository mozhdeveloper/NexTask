"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  departmentId: z.string(), // empty string = all departments
  requiredDaily: z.boolean(),
  deadlineTime: z.string().min(1, "Deadline time is required"),
  allowedFileTypes: z.string().min(1, "At least one file type required"),
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
      allowedFileTypes: "pdf,docx,xlsx,jpg,png",
      maxFileSizeMB: 10,
      isActive: true,
    },
  });

  // Populate form when editing prop changes
  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        departmentId: editing.departmentId ?? "",
        requiredDaily: editing.requiredDaily,
        deadlineTime: editing.deadlineTime,
        allowedFileTypes: editing.allowedFileTypes.join(", "),
        maxFileSizeMB: editing.maxFileSizeMB,
        isActive: editing.isActive,
      });
    } else {
      reset({
        name: "",
        departmentId: "",
        requiredDaily: true,
        deadlineTime: "18:00",
        allowedFileTypes: "pdf,docx,xlsx,jpg,png",
        maxFileSizeMB: 10,
        isActive: true,
      });
    }
  }, [editing, open, reset]);

  const onSubmit = async (v: V) => {
    const allowedFileTypes = v.allowedFileTypes
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      name: v.name,
      departmentId: v.departmentId || null,
      requiredDaily: v.requiredDaily,
      deadlineTime: v.deadlineTime,
      allowedFileTypes,
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
              <Input type="number" min={1} max={100} {...register("maxFileSizeMB", { valueAsNumber: true })} />
              {errors.maxFileSizeMB && (
                <p className="text-xs text-danger">{errors.maxFileSizeMB.message}</p>
              )}
            </div>
          </div>

          {/* Allowed File Types */}
          <div className="space-y-1.5">
            <Label>Allowed file types</Label>
            <Input
              {...register("allowedFileTypes")}
              placeholder="pdf, docx, xlsx, jpg, png"
            />
            <p className="text-xs text-ink-muted">Comma-separated extensions (without dot).</p>
            {errors.allowedFileTypes && (
              <p className="text-xs text-danger">{errors.allowedFileTypes.message}</p>
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
