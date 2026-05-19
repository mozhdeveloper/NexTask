// Department service — admin-only create/update/delete with Supabase persistence
// and local store sync. Department ids stay text so they line up with the rest of
// the schema (where users.id is also text).

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { mapDepartment } from "@/lib/supabase/mappers";
import type { DbDepartmentRow } from "@/lib/supabase/types";
import { uid } from "@/lib/helpers";
import { logService } from "./log.service";
import type { Department } from "@/types";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[departments:${label}]`, e);
}

function requireAdmin() {
  const me = useAuthStore.getState().user;
  if (!me || me.role !== "admin") throw new Error("Forbidden");
  return me;
}

export const departmentService = {
  list() {
    return useDataStore.getState().departments;
  },

  async create(input: { name: string; description?: string; lead?: string }) {
    const me = requireAdmin();
    const name = input.name.trim();
    if (!name) throw new Error("Department name is required.");
    const existing = useDataStore.getState().departments;
    if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A department with that name already exists.");
    }
    const id = uid("dep");
    const row = {
      id,
      name,
      description: input.description?.trim() || null,
      lead: input.lead || null,
    };
    const { data, error } = await supabase
      .from("departments")
      .insert(row)
      .select("*")
      .single();
    if (error) {
      warn("create", error);
      throw new Error(error.message);
    }
    const dep = mapDepartment(data as DbDepartmentRow);
    useDataStore.setState({ departments: [...existing, dep] });
    logService.append({
      userId: me.id,
      action: "department.create",
      targetType: "department",
      targetId: dep.id,
    });
    return dep;
  },

  async update(id: string, patch: Partial<Pick<Department, "name" | "description" | "lead">>) {
    const me = requireAdmin();
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description?.trim() || null;
    if (patch.lead !== undefined) dbPatch.lead = patch.lead || null;
    const { error } = await supabase.from("departments").update(dbPatch).eq("id", id);
    if (error) {
      warn("update", error);
      throw new Error(error.message);
    }
    useDataStore.setState((s) => ({
      departments: s.departments.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
    logService.append({
      userId: me.id,
      action: "department.update",
      targetType: "department",
      targetId: id,
    });
  },

  async remove(id: string) {
    const me = requireAdmin();
    const inUse = useDataStore.getState().users.some((u) => u.departmentId === id);
    if (inUse) throw new Error("Reassign employees in this department before deleting it.");
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) {
      warn("remove", error);
      throw new Error(error.message);
    }
    useDataStore.setState((s) => ({
      departments: s.departments.filter((d) => d.id !== id),
    }));
    logService.append({
      userId: me.id,
      action: "department.delete",
      targetType: "department",
      targetId: id,
    });
  },

  async refresh() {
    const { data, error } = await supabase.from("departments").select("*").order("name");
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped = (data ?? []).map((r) => mapDepartment(r as DbDepartmentRow));
    useDataStore.setState({ departments: mapped });
  },
};
