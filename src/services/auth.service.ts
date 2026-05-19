// Auth service — Supabase Auth + fetch matching public.users row.
// The Zustand authStore stays the in-component source of truth so React can subscribe.

import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { supabase } from "@/lib/supabase/client";
import { mapUser } from "@/lib/supabase/mappers";
import type { DbUserRow } from "@/lib/supabase/types";
import { logService } from "./log.service";

async function fetchAppUserByAuthId(authId: string) {
  const linked = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authId)
    .maybeSingle();
  if (linked.data) return linked.data as DbUserRow;

  // fallback for the very first login of a fresh demo: look up by email
  const auth = await supabase.auth.getUser();
  const email = auth.data.user?.email;
  if (!email) return null;
  const byEmail = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (byEmail.data) {
    await supabase
      .from("users")
      .update({ auth_user_id: authId })
      .eq("id", (byEmail.data as DbUserRow).id);
    return byEmail.data as DbUserRow;
  }
  return null;
}

export const authService = {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Invalid email or password.");
    }
    const row = await fetchAppUserByAuthId(data.user.id);
    if (!row) {
      await supabase.auth.signOut();
      throw new Error("No NexTask profile is linked to this account.");
    }
    if (!row.is_active) {
      await supabase.auth.signOut();
      throw new Error("This account is disabled.");
    }
    const user = mapUser(row);
    useAuthStore.getState().setUser(user);
    logService.append({
      userId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: null,
    });
    return user;
  },

  async logout() {
    const u = useAuthStore.getState().user;
    if (u) {
      logService.append({
        userId: u.id,
        action: "auth.logout",
        targetType: "session",
        targetId: null,
      });
    }
    await supabase.auth.signOut();
    useAuthStore.getState().setUser(null);
    // Clear dynamic user data so a second user logging in on the same tab
    // does not briefly see the previous user's submissions / notifications.
    const ds = useDataStore.getState();
    ds.setUsers([]);
    ds.setSubmissions([]);
    ds.setRevisions([]);
    ds.setNotifications([]);
    ds.setLogs([]);
    ds.setBackups([]);
    ds.setProjects([]);
  },

  me() {
    return useAuthStore.getState().user;
  },

  /** Rehydrate the app user from the current Supabase session. */
  async syncFromSession() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      useAuthStore.getState().setUser(null);
      return null;
    }
    const row = await fetchAppUserByAuthId(data.user.id);
    if (!row) {
      useAuthStore.getState().setUser(null);
      return null;
    }
    const user = mapUser(row);
    useAuthStore.getState().setUser(user);
    return user;
  },
};
