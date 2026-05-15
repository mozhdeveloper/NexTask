"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataStore } from "@/store/dataStore";
import { projectService } from "@/services/project.service";
import type { Project } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  ownerId: z.string().min(1),
  status: z.enum(["planning", "in_progress", "review", "completed", "on_hold"]),
  dueDate: z.string().optional(),
  progress: z.number().min(0).max(100),
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
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          name: editing.name,
          description: editing.description ?? "",
          ownerId: editing.ownerId ?? editing.lead ?? users[0]?.id ?? "",
          status: editing.status,
          dueDate: editing.dueDate ?? "",
          progress: editing.progress ?? 0,
        }
      : {
          name: "",
          description: "",
          ownerId: users[0]?.id ?? "",
          status: "planning",
          dueDate: "",
          progress: 0,
        },
  });

  const submit = (v: V) => {
    setBusy(true);
    try {
      if (editing) projectService.update(editing.id, v);
      else projectService.create(v);
      toast.success(editing ? "Project updated." : "Project created.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Track work and milestones.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="space-y-1.5"><Label>Name</Label><Input {...register("name")} />{errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}</div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} {...register("description")} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={watch("ownerId")} onValueChange={(v) => setValue("ownerId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {users.filter((u) => u.isActive).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={watch("status")} onValueChange={(v) => setValue("status", v as V["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Due date</Label><Input type="date" {...register("dueDate")} /></div>
            <div className="space-y-1.5"><Label>Progress (%)</Label><Input type="number" min={0} max={100} {...register("progress", { valueAsNumber: true })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
