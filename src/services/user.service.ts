// User service. Most ops are direct Supabase queries.
// `create` needs an auth.users row → server route /api/users (service_role).

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { supabase } from "@/lib/supabase/client";
import { mapUser } from "@/lib/supabase/mappers";
import type { DbUserRow } from "@/lib/supabase/types";
import { logService } from "./log.service";
import { notificationService } from "./notification.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[users:${label}]`, e);
}

export const userService = {
  list() {
    return useDataStore.getState().users;
  },

  get(id: string) {
    return useDataStore.getState().users.find((u) => u.id === id) ?? null;
  },

  async create(
    input: Omit<User, "id" | "createdAt" | "avatarColor" | "isActive" | "passwordHash"> & {
      password?: string;
    }
  ) {
    const me = useAuthStore.getState().user;
    if (!me || (me.role !== "admin" && me.role !== "manager")) throw new Error("Forbidden");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? "Failed to create user");
    }
    const row = (await res.json()) as DbUserRow;
    const user = mapUser(row);

    const { users, setUsers } = useDataStore.getState();
    setUsers([user, ...users]);

    logService.append({
      userId: me.id,
      action: "user.create",
      targetType: "user",
      targetId: user.id,
    });

    // Notify all admins (excluding the creator themselves) that a new account was created.
    useDataStore.getState().users
      .filter((u) => u.role === "admin" && u.id !== me.id)
      .forEach((a) =>
        notificationService.push({
          userId: a.id,
          type: "info",
          title: "New employee added",
          body: `${user.name} (${user.role}) was added to the system.`,
          link: "/admin/employees",
        })
      );

    return user;
  },

  async update(id: string, patch: Partial<User>) {
    const me = useAuthStore.getState().user;
    if (!me || (me.role !== "admin" && me.role !== "manager")) throw new Error("Forbidden");

    // Managers may only modify users in their own department and cannot
    // change role or department assignment.
    if (me.role === "manager") {
      const target = useDataStore.getState().users.find((u) => u.id === id);
      if (!target || target.departmentId !== me.departmentId) throw new Error("Forbidden");
      if (patch.role !== undefined || patch.departmentId !== undefined)
        throw new Error("Managers cannot change role or department assignment.");
    }

    const { users, setUsers } = useDataStore.getState();
    setUsers(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));

    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.role !== undefined) dbPatch.role = patch.role;
    if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId;
    if (patch.jobTitle !== undefined) dbPatch.job_title = patch.jobTitle;
    if (patch.avatarColor !== undefined) dbPatch.avatar_color = patch.avatarColor;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("users").update(dbPatch).eq("id", id);
      if (error) warn("update", error);
    }

    logService.append({
      userId: me.id,
      action: "user.update",
      targetType: "user",
      targetId: id,
    });
  },

  async toggleActive(id: string) {
    const me = useAuthStore.getState().user;
    if (!me || (me.role !== "admin" && me.role !== "manager")) throw new Error("Forbidden");
    // Managers may only toggle users within their own department.
    if (me.role === "manager") {
      const tgt = useDataStore.getState().users.find((u) => u.id === id);
      if (!tgt || tgt.departmentId !== me.departmentId) throw new Error("Forbidden");
    }
    const { users, setUsers } = useDataStore.getState();
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const next = !target.isActive;
    setUsers(users.map((u) => (u.id === id ? { ...u, isActive: next } : u)));

    const { error } = await supabase.from("users").update({ is_active: next }).eq("id", id);
    if (error) warn("toggleActive", error);

    logService.append({
      userId: me.id,
      action: "user.toggle_active",
      targetType: "user",
      targetId: id,
    });
  },

  async refresh() {
    const { data, error } = await supabase.from("users").select("*").order("name");
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped = (data ?? []).map((r) => mapUser(r as DbUserRow));
    useDataStore.getState().setUsers(mapped);
  },
};
