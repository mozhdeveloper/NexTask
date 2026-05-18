// Project service — Supabase CRUD with optimistic cache updates.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { Project } from "@/types";
import { uid } from "@/lib/helpers";
import { nowISO } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
import type { DbProjectRow } from "@/lib/supabase/types";
import { logService } from "./log.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[projects:${label}]`, e);
}

export const projectService = {
  list() {
    return useDataStore.getState().projects;
  },

  async create(input: Omit<Project, "id" | "createdAt">) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Forbidden");
    const p: Project = { id: uid("p"), createdAt: nowISO(), ...input };

    const { projects, setProjects } = useDataStore.getState();
    setProjects([p, ...projects]);

    const { error } = await supabase.from("projects").insert({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      department_id: p.departmentId ?? null,
      lead: p.lead ?? null,
      owner_id: p.ownerId ?? null,
      status: p.status,
      members: p.members ?? [],
      due_date: p.dueDate ?? null,
      progress: p.progress ?? 0,
      created_at: p.createdAt,
    });
    if (error) warn("create", error);

    logService.append({
      userId: me.id,
      action: "project.create",
      targetType: "project",
      targetId: p.id,
    });
    return p;
  },

  update(id: string, patch: Partial<Project>) {
    const me = useAuthStore.getState().user;
    const { projects, setProjects } = useDataStore.getState();
    setProjects(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (me) {
      logService.append({
        userId: me.id,
        action: "project.update",
        targetType: "project",
        targetId: id,
      });
    }

    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId;
    if (patch.lead !== undefined) dbPatch.lead = patch.lead;
    if (patch.ownerId !== undefined) dbPatch.owner_id = patch.ownerId;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.members !== undefined) dbPatch.members = patch.members;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
    if (patch.progress !== undefined) dbPatch.progress = patch.progress;

    if (Object.keys(dbPatch).length === 0) return;
    supabase
      .from("projects")
      .update(dbPatch)
      .eq("id", id)
      .then(({ error }) => {
        if (error) warn("update", error);
      });
  },

  async refresh() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped = (data ?? []).map((r) => mapProject(r as DbProjectRow));
    useDataStore.getState().setProjects(mapped);
  },
};
