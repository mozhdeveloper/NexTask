"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataStore } from "@/store/dataStore";
import { userService } from "@/services/user.service";
import type { Role } from "@/lib/constants";
import type { User } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  jobTitle: z.string().optional(),
  role: z.enum(["admin", "manager", "employee"]),
  departmentId: z.string().min(1),
});
type V = z.infer<typeof schema>;

export function EmployeeFormModal({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: User | null;
}) {
  const departments = useDataStore((s) => s.departments);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? { name: editing.name, email: editing.email, jobTitle: editing.jobTitle ?? "", role: editing.role, departmentId: editing.departmentId ?? (departments[0]?.id ?? "") }
      : { name: "", email: "", jobTitle: "", role: "employee", departmentId: departments[0]?.id ?? "" },
  });

  const submit = (v: V) => {
    setBusy(true);
    try {
      if (editing) {
        userService.update(editing.id, v);
        toast.success("Employee updated.");
      } else {
        userService.create(v);
        toast.success("Employee added.");
      }
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
          <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>Manage workspace members.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Name</Label><Input {...register("name")} />{errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}</div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...register("email")} />{errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}</div>
            <div className="space-y-1.5"><Label>Job title</Label><Input {...register("jobTitle")} /></div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={watch("role")} onValueChange={(v) => setValue("role", v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Department</Label>
              <Select value={watch("departmentId")} onValueChange={(v) => setValue("departmentId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
