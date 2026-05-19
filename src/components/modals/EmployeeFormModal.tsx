"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "@/hooks/useAuth";
import { userService } from "@/services/user.service";
import type { Role } from "@/lib/constants";
import type { User } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  jobTitle: z.string().optional(),
  role: z.enum(["admin", "manager", "employee"]),
  departmentId: z.string().min(1, "Department is required"),
  password: z.string().optional(),
});
type V = z.infer<typeof schema>;

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
  const me = useAuth();
  const isManager = me?.role === "manager";
  // When a manager is creating an employee, lock dept to their own department.
  const managerDeptId = isManager ? (me?.departmentId ?? departments[0]?.id ?? "") : null;
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    getValues,
  } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          name: editing.name,
          email: editing.email,
          jobTitle: editing.jobTitle ?? "",
          role: editing.role,
          departmentId: editing.departmentId ?? (departments[0]?.id ?? ""),
        }
      : {
          name: "",
          email: "",
          jobTitle: "",
          role: "employee",
          departmentId: managerDeptId ?? (departments[0]?.id ?? ""),
          password: "",
        },
  });

  const onGenerate = () => {
    const pwd = generatePassword();
    setValue("password", pwd, { shouldValidate: true, shouldDirty: true });
    setShowPwd(true);
    toast.success("Password generated.");
  };

  const onCopy = async () => {
    const pwd = getValues("password");
    if (!pwd) return toast.error("No password to copy yet.");
    if (await copyToClipboard(pwd)) toast.success("Copied to clipboard.");
    else toast.error("Could not copy.");
  };

  const submit = async (v: V) => {
    // Defensive: make sure the chosen department still exists in the store
    // (it could have been deleted in another tab between mount and submit).
    if (!departments.some((d) => d.id === v.departmentId)) {
      toast.error("Selected department no longer exists. Please pick another.");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await userService.update(editing.id, v);
        toast.success("User updated.");
      } else {
        const usedPassword = v.password?.trim() || "password123";
        await userService.create({ ...v, password: usedPassword });
        toast.success(
          `${v.role === "manager" ? "Manager" : v.role === "admin" ? "Admin" : "Employee"} created. Password: ${usedPassword}`,
          {
            duration: 15000,
            action: {
              label: "Copy password",
              onClick: () => {
                void copyToClipboard(usedPassword);
              },
            },
          },
        );
      }
      reset();
      setShowPwd(false);
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
          <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update member details." : "Create a new admin, manager, or employee account."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input {...register("name")} />
              {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Job title</Label>
              <Input {...register("jobTitle")} placeholder="e.g. Marketing Specialist" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={watch("role")} onValueChange={(v) => setValue("role", v as Role)} disabled={isManager && !editing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!isManager && <SelectItem value="admin">Admin</SelectItem>}
                  {!isManager && <SelectItem value="manager">Manager</SelectItem>}
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Department</Label>
              <Select
                value={watch("departmentId")}
                onValueChange={(v) => setValue("departmentId", v)}
                disabled={!!managerDeptId && !editing}
              >                <SelectTrigger>
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departmentId && <p className="text-xs text-danger">{errors.departmentId.message}</p>}
            </div>
            {!editing && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPwd ? "text" : "password"}
                      placeholder="Leave blank to use default (password123)"
                      {...register("password")}
                    />
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="rounded p-1 text-ink-muted hover:bg-surface-subtle"
                        aria-label={showPwd ? "Hide password" : "Show password"}
                      >
                        {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {watch("password") && (
                        <button
                          type="button"
                          onClick={onCopy}
                          className="rounded p-1 text-ink-muted hover:bg-surface-subtle"
                          aria-label="Copy password"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={onGenerate} className="flex-shrink-0 gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Generate
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  Minimum 8 characters. The password will be shown once after creation — copy it now.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
