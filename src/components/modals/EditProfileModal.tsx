"use client";
import { useState, useEffect } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { userService } from "@/services/user.service";
import { supabase } from "@/lib/supabase/client";
import { logService } from "@/services/log.service";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  "bg-indigo-500 text-white",
  "bg-teal-500 text-white",
  "bg-rose-500 text-white",
  "bg-amber-500 text-white",
  "bg-violet-500 text-white",
  "bg-emerald-500 text-white",
  "bg-sky-500 text-white",
  "bg-pink-500 text-white",
];

const schema = z
  .object({
    name: z.string().min(2, "Name is too short"),
    email: z.string().email("Valid email required"),
    jobTitle: z.string().optional(),
    avatarColor: z.string().min(1),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (v) =>
      !v.newPassword ||
      (v.newPassword.length >= 8 && v.newPassword === v.confirmPassword),
    { message: "Passwords must match and be at least 8 chars", path: ["confirmPassword"] }
  );
type V = z.infer<typeof schema>;

export function EditProfileModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const user = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      jobTitle: user?.jobTitle ?? "",
      avatarColor: user?.avatarColor ?? COLOR_OPTIONS[0],
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Reset to current user values every time the modal opens.
  useEffect(() => {
    if (open && user) {
      reset({
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle ?? "",
        avatarColor: user.avatarColor,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  if (!user) return null;

  const submit = async (v: V) => {
    setBusy(true);
    try {
      const userPatch: Record<string, unknown> = {};

      // Collect profile field changes
      if (v.name !== user.name) userPatch.name = v.name;
      if ((v.jobTitle ?? "") !== (user.jobTitle ?? "")) userPatch.jobTitle = v.jobTitle;
      if (v.avatarColor !== user.avatarColor) userPatch.avatarColor = v.avatarColor;

      // Email change — must update Supabase Auth first, then public.users
      const newEmail = v.email.trim();
      if (newEmail.toLowerCase() !== user.email.toLowerCase()) {
        const { error: authErr } = await supabase.auth.updateUser({ email: newEmail });
        if (authErr) throw new Error(authErr.message);
        userPatch.email = newEmail;
      }

      if (Object.keys(userPatch).length > 0) {
        await userService.update(user.id, userPatch as Partial<import("@/types").User>);
        setUser({ ...user, ...userPatch } as typeof user);
      }

      // Password change
      if (v.newPassword) {
        const { error } = await supabase.auth.updateUser({ password: v.newPassword });
        if (error) throw new Error(error.message);
        void logService.append({ userId: user.id, action: "auth.password_change", targetType: "user", targetId: user.id });
      }

      toast.success("Profile updated.");
      reset({ name: v.name, email: newEmail || v.email, jobTitle: v.jobTitle, avatarColor: v.avatarColor, currentPassword: "", newPassword: "", confirmPassword: "" });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const avatarColor = watch("avatarColor");
  const name = watch("name") || user.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your details and password.</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 text-base">
              <AvatarFallback className={avatarColor}>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Pick ${c}`}
                  onClick={() => setValue("avatarColor", c, { shouldDirty: true })}
                  className={cn("h-6 w-6 rounded-full ring-2 ring-offset-1", c.split(" ")[0], avatarColor === c ? "ring-primary" : "ring-transparent")}
                />
              ))}
            </div>
          </div>

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
            <Input {...register("jobTitle")} placeholder="e.g. Senior Engineer" />
          </div>

          <div className="rounded-md border border-surface-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Change password</div>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" placeholder="Min 8 characters" {...register("newPassword")} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm new password</Label>
                <Input type="password" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-danger">{errors.confirmPassword.message}</p>}
              </div>
              <p className="text-xs text-ink-muted">Leave blank to keep your current password.</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
