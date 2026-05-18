"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, X, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDataStore } from "@/store/dataStore";
import { projectService } from "@/services/project.service";
import { initials } from "@/lib/status";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

type ProjectStatus = Project["status"];

const STATUS_OPTIONS: { value: ProjectStatus; label: string; dot: string }[] = [
  { value: "planning",    label: "Planning",     dot: "bg-blue-500"   },
  { value: "in_progress", label: "In Progress",  dot: "bg-amber-500"  },
  { value: "review",      label: "In Review",    dot: "bg-violet-500" },
  { value: "completed",   label: "Completed",    dot: "bg-emerald-500"},
  { value: "on_hold",     label: "On Hold",      dot: "bg-slate-400"  },
];

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner is required"),
  departmentId: z.string().optional(),
  status: z.enum(["planning", "in_progress", "review", "completed", "on_hold"]),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completedAt: z.string().optional(),
});
type V = z.infer<typeof schema>;

export function ProjectFormModal({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Project | null;
}) {
  const users = useDataStore((s) => s.users);
  const departments = useDataStore((s) => s.departments);
  const activeUsers = users.filter((u) => u.isActive);
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      ownerId: activeUsers[0]?.id ?? "",
      departmentId: "",
      status: "planning",
      startDate: "",
      dueDate: "",
      completedAt: "",
    },
  });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        description: editing.description ?? "",
        ownerId: editing.ownerId ?? editing.lead ?? activeUsers[0]?.id ?? "",
        departmentId: editing.departmentId ?? "",
        status: editing.status,
        startDate: editing.startDate ?? "",
        dueDate: editing.dueDate ?? "",
        completedAt: editing.completedAt ?? "",
      });
      setMembers(editing.members ?? []);
    } else {
      reset({
        name: "",
        description: "",
        ownerId: activeUsers[0]?.id ?? "",
        departmentId: "",
        status: "planning",
        startDate: "",
        dueDate: "",
        completedAt: "",
      });
      setMembers([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  const status = watch("status");

  const toggleMember = (id: string) =>
    setMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const submit = async (v: V) => {
    setBusy(true);
    try {
      const payload: Omit<Project, "id" | "createdAt"> = {
        name: v.name,
        description: v.description || undefined,
        ownerId: v.ownerId,
        departmentId: v.departmentId || undefined,
        status: v.status,
        members,
        startDate: v.startDate || undefined,
        dueDate: v.dueDate || undefined,
        completedAt: v.completedAt || undefined,
      };
      if (editing) await projectService.update(editing.id, payload);
      else await projectService.create(payload);
      toast.success(editing ? "Project updated." : "Project created.");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update project details below." : "Create a new project to track work and milestones."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit(submit)}>
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Project name <span className="text-danger">*</span></Label>
            <Input {...register("name")} placeholder="e.g. Website Redesign" autoFocus />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-xs font-normal text-ink-muted">(optional)</span></Label>
            <Textarea rows={2} {...register("description")} placeholder="What is this project about?" />
          </div>

          {/* Status — prominent pill selector */}
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("status", opt.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    status === opt.value
                      ? "border-transparent bg-ink text-white"
                      : "border-surface-border bg-white text-ink-muted hover:border-ink/30 hover:text-ink"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", opt.dot)} />
                  {opt.label}
                  {status === opt.value && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Owner + Department */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Owner <span className="text-danger">*</span></Label>
              <Select value={watch("ownerId")} onValueChange={(v) => setValue("ownerId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.ownerId && <p className="text-xs text-danger">{errors.ownerId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Department <span className="text-xs font-normal text-ink-muted">(optional)</span></Label>
              <Select
                value={watch("departmentId") || "_none"}
                onValueChange={(v) => setValue("departmentId", v === "_none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start date <span className="text-xs font-normal text-ink-muted">(optional)</span></Label>
              <Input type="date" {...register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date <span className="text-xs font-normal text-ink-muted">(optional)</span></Label>
              <Input type="date" {...register("dueDate")} />
            </div>
          </div>

          {/* Completion date — only relevant for completed status */}
          <div className="space-y-1.5">
            <Label>
              Completion date{" "}
              <span className="text-xs font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input type="date" {...register("completedAt")} />
            <p className="text-xs text-ink-muted">
              Set this when the project is actually finished.
            </p>
          </div>

          {/* Team members */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team members
              <span className="text-xs font-normal text-ink-muted">(optional)</span>
            </Label>

            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((id) => {
                  const u = activeUsers.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1 rounded-full border border-surface-border bg-surface-subtle px-2 py-0.5 text-xs"
                    >
                      <Avatar className="h-4 w-4 text-[9px]">
                        <AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      {u.name}
                      <button
                        type="button"
                        onClick={() => toggleMember(id)}
                        className="ml-0.5 rounded-full text-ink-muted hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="max-h-36 overflow-y-auto rounded-lg border border-surface-border">
              {activeUsers
                .filter((u) => u.id !== watch("ownerId"))
                .map((u) => {
                  const on = members.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                        on ? "bg-primary/5" : "hover:bg-surface-subtle"
                      )}
                    >
                      <Avatar className="h-6 w-6 text-[10px]">
                        <AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-left">{u.name}</span>
                      <span className="text-xs text-ink-muted">{u.jobTitle ?? u.role}</span>
                      {on && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
