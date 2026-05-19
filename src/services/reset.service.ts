// Reset service — bulk-wipe Supabase tables for admin "Danger Zone" actions.
// All deletes use `gte("created_at", "2000-01-01")` which safely matches every row
// (all data predates 2020+) while satisfying PostgREST's mandatory filter requirement.

import { supabase, STORAGE_BUCKET } from "@/lib/supabase/client";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";

function guard() {
  const me = useAuthStore.getState().user;
  if (!me || me.role !== "admin") throw new Error("Forbidden — admin only.");
  return me;
}

async function deleteStorageForAllAttachments() {
  const { data, error } = await supabase
    .from("attachments")
    .select("storage_path")
    .not("storage_path", "is", null);
  if (error) {
    console.warn("[reset] failed to list attachment paths", error);
    return;
  }
  const paths = (data ?? [])
    .map((r: { storage_path: string | null }) => r.storage_path)
    .filter((p): p is string => !!p);

  if (paths.length === 0) return;
  // Supabase Storage remove() is limited to 1 000 items per call
  for (let i = 0; i < paths.length; i += 500) {
    await supabase.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + 500));
  }
}

/**
 * Wipe all dynamic data rows from Supabase but keep users, departments, and
 * submission types intact. Used by "Reset demo data".
 */
async function wipeDynamic() {
  // 1. Gather + delete storage files referenced by attachments
  await deleteStorageForAllAttachments();

  // 2. Delete in FK-safe order (attachments → revisions → submissions → rest)
  const EPOCH = "2000-01-01";
  const tables = [
    "attachments",
    "revisions",
    "submissions",
    "projects",
    "notifications",
    "activity_logs",
    "backup_logs",
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().gte("created_at", EPOCH);
    if (error) console.warn(`[reset] delete ${table}`, error);
  }

  // 3. Sync Zustand
  const ds = useDataStore.getState();
  ds.setSubmissions([]);
  ds.setRevisions([]);
  ds.setProjects([]);
  ds.setLogs([]);
  ds.setNotifications([]);
  ds.setBackups([]);
}

export const resetService = {
  /**
   * Clear all submissions / revisions / projects / logs / notifications from
   * Supabase + Zustand. Users, departments, and submission types are kept.
   * Sign out is handled by the caller.
   */
  async resetDemoData() {
    guard();
    await wipeDynamic();
  },

  /**
   * Delete everything — including all non-admin users — from Supabase and
   * Zustand. The signed-in admin account is preserved. Sign out is handled by
   * the caller.
   */
  async deleteAllData() {
    const me = guard();
    await wipeDynamic();

    // Delete all public.users rows except the current admin
    const { error } = await supabase.from("users").delete().neq("id", me.id);
    if (error) console.warn("[reset] delete users", error);

    // Zustand: keep only the admin profile
    const myUser = useAuthStore.getState().user;
    if (myUser) useDataStore.getState().setUsers([myUser]);
    else useDataStore.getState().setUsers([]);
  },
};
