// Submission Type service — admin-only CRUD against Supabase submission_types table.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { SubmissionType } from "@/types";
import { uid } from "@/lib/helpers";
import { supabase } from "@/lib/supabase/client";
import { logService } from "./log.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[submissionTypes:${label}]`, e);
}

function requireAdmin() {
  const me = useAuthStore.getState().user;
  if (!me || me.role !== "admin") throw new Error("Forbidden");
  return me;
}

export const submissionTypeService = {
  list() {
    return useDataStore.getState().submissionTypes;
  },

  async create(input: Omit<SubmissionType, "id">) {
    const me = requireAdmin();
    const t: SubmissionType = { id: uid("st"), ...input };

    const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
    setSubmissionTypes([t, ...submissionTypes]);

    const { error } = await supabase.from("submission_types").insert({
      id: t.id,
      name: t.name,
      department_id: t.departmentId ?? null,
      required_daily: t.requiredDaily,
      deadline_time: t.deadlineTime,
      allowed_file_types: t.allowedFileTypes,
      max_file_size_mb: t.maxFileSizeMB,
      is_active: t.isActive,
    });
    if (error) warn("create", error);

    logService.append({
      userId: me.id,
      action: "submissionType.create",
      targetType: "submission_type",
      targetId: t.id,
    });
    return t;
  },

  async update(id: string, patch: Partial<Omit<SubmissionType, "id">>) {
    const me = requireAdmin();

    const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
    setSubmissionTypes(submissionTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId ?? null;
    if (patch.requiredDaily !== undefined) dbPatch.required_daily = patch.requiredDaily;
    if (patch.deadlineTime !== undefined) dbPatch.deadline_time = patch.deadlineTime;
    if (patch.allowedFileTypes !== undefined) dbPatch.allowed_file_types = patch.allowedFileTypes;
    if (patch.maxFileSizeMB !== undefined) dbPatch.max_file_size_mb = patch.maxFileSizeMB;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("submission_types").update(dbPatch).eq("id", id);
      if (error) warn("update", error);
    }

    logService.append({
      userId: me.id,
      action: "submissionType.update",
      targetType: "submission_type",
      targetId: id,
    });
  },

  async toggleActive(id: string) {
    const { submissionTypes } = useDataStore.getState();
    const t = submissionTypes.find((s) => s.id === id);
    if (!t) return;
    await submissionTypeService.update(id, { isActive: !t.isActive });
  },

  async remove(id: string) {
    const me = requireAdmin();

    const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
    setSubmissionTypes(submissionTypes.filter((t) => t.id !== id));

    const { error } = await supabase.from("submission_types").delete().eq("id", id);
    if (error) warn("remove", error);

    logService.append({
      userId: me.id,
      action: "submissionType.delete",
      targetType: "submission_type",
      targetId: id,
    });
  },
};
