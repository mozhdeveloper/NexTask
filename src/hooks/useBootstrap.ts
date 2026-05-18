"use client";

// Hydrate the in-memory Zustand cache from Supabase once on app boot,
// re-sync the auth user when Supabase auth state changes,
// and maintain Supabase Realtime channel subscriptions for live updates.

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/auth.service";
import { userService } from "@/services/user.service";
import { projectService } from "@/services/project.service";
import { submissionService } from "@/services/submission.service";
import { revisionService } from "@/services/revision.service";
import { notificationService } from "@/services/notification.service";
import { backupService } from "@/services/backup.service";
import { workSettingsService } from "@/services/workSettings.service";
import { logService } from "@/services/log.service";
import {
  mapDepartment,
  mapSubmissionType,
  mapNotification,
  mapSubmission,
  mapRevision,
  mapProject,
  mapUser,
} from "@/lib/supabase/mappers";
import type {
  DbDepartmentRow,
  DbSubmissionTypeRow,
  DbNotificationRow,
  DbSubmissionRow,
  DbRevisionRow,
  DbProjectRow,
  DbUserRow,
} from "@/lib/supabase/types";

async function loadStaticTables() {
  const [deps, types] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("submission_types").select("*").order("name"),
  ]);
  if (deps.data) {
    useDataStore.setState({
      departments: (deps.data as DbDepartmentRow[]).map(mapDepartment),
    });
  }
  if (types.data) {
    useDataStore.setState({
      submissionTypes: (types.data as DbSubmissionTypeRow[]).map(mapSubmissionType),
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeChannel = ReturnType<typeof supabase.channel>;

export function useBootstrap() {
  const bootstrapped = useRef(false);
  const channels = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Track whether this effect instance is still live.
    // If cleanup fires (HMR, StrictMode unmount) before the async work
    // finishes, we skip channel setup to avoid "cannot add callbacks
    // after subscribe()" errors caused by stale channel registrations.
    let mounted = true;

    // 1. Sync any existing session into authStore.
    void authService.syncFromSession();

    // 2. Subscribe to auth state changes (login/logout/refresh from other tabs).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        useAuthStore.getState().setUser(null);
      } else {
        void authService.syncFromSession();
      }
    });

    // 3. Hydrate all caches from DB, then wire up Realtime channels.
    void (async () => {
      await Promise.all([
        loadStaticTables(),
        userService.refresh(),
        workSettingsService.refresh(),
        projectService.refresh(),
        submissionService.refresh(),
        revisionService.refresh(),
        backupService.refresh(),
        logService.refresh(),
      ]);

      // Bail out early if cleanup has already fired.
      if (!mounted) return;

      useDataStore.setState({ hydrated: true });

      const me = useAuthStore.getState().user;
      if (!me) return;

      await notificationService.refresh(me.id);

      // Bail out again — cleanup may have fired during the notification load.
      if (!mounted) return;

      // Tear down any stale channels from a previous mount before
      // re-subscribing.  This prevents "cannot add callbacks after
      // subscribe()" errors caused by the Supabase client returning a
      // cached, already-subscribed channel when the same name is reused.
      await supabase.removeAllChannels();
      channels.current = [];

      // ── Realtime: notifications (current user only) ──────────────────
      const notifChannel = supabase
        .channel("rt:notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          (payload) => {
            const item = mapNotification(payload.new as DbNotificationRow);
            const { notifications, setNotifications } = useDataStore.getState();
            setNotifications([item, ...notifications.filter((n) => n.id !== item.id)]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          (payload) => {
            const updated = mapNotification(payload.new as DbNotificationRow);
            const { notifications, setNotifications } = useDataStore.getState();
            setNotifications(notifications.map((n) => (n.id === updated.id ? updated : n)));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
          (payload) => {
            const { notifications, setNotifications } = useDataStore.getState();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setNotifications(notifications.filter((n) => n.id !== (payload.old as any).id));
          }
        )
        .subscribe();
      channels.current.push(notifChannel);

      // ── Realtime: submissions (admin / manager see new submissions live) ──
      if (me.role === "admin" || me.role === "manager") {
        const submissionsChannel = supabase
          .channel("rt:submissions")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "submissions" },
            (payload) => {
              const item = mapSubmission(payload.new as DbSubmissionRow, []);
              const { submissions, setSubmissions } = useDataStore.getState();
              setSubmissions([item, ...submissions.filter((s) => s.id !== item.id)]);
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "submissions" },
            (payload) => {
              const { submissions, setSubmissions } = useDataStore.getState();
              const existing = submissions.find((s) => s.id === (payload.new as DbSubmissionRow).id);
              const updated = mapSubmission(
                payload.new as DbSubmissionRow,
                // preserve existing attachments — they don't change on status updates
                // @ts-expect-error internal mapper accepts Attachment[] but DB rows also work
                existing?.attachments ?? []
              );
              setSubmissions(submissions.map((s) => (s.id === updated.id ? updated : s)));
            }
          )
          .subscribe();

        // ── Realtime: revisions ──────────────────────────────────────────
        const revisionsChannel = supabase
          .channel("rt:revisions")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "revisions" },
            (payload) => {
              const item = mapRevision(payload.new as DbRevisionRow);
              const { revisions, setRevisions } = useDataStore.getState();
              setRevisions([item, ...revisions.filter((r) => r.id !== item.id)]);
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "revisions" },
            (payload) => {
              const updated = mapRevision(payload.new as DbRevisionRow);
              const { revisions, setRevisions } = useDataStore.getState();
              setRevisions(revisions.map((r) => (r.id === updated.id ? updated : r)));
            }
          )
          .subscribe();

        // ── Realtime: projects ───────────────────────────────────────────
        const projectsChannel = supabase
          .channel("rt:projects")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "projects" },
            (payload) => {
              const item = mapProject(payload.new as DbProjectRow);
              const { projects, setProjects } = useDataStore.getState();
              setProjects([...projects.filter((p) => p.id !== item.id), item]);
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "projects" },
            (payload) => {
              const updated = mapProject(payload.new as DbProjectRow);
              const { projects, setProjects } = useDataStore.getState();
              setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
            }
          )
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "projects" },
            (payload) => {
              const { projects, setProjects } = useDataStore.getState();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setProjects(projects.filter((p) => p.id !== (payload.old as any).id));
            }
          )
          .subscribe();

        // ── Realtime: users (employee activation / role changes) ─────────
        const usersChannel = supabase
          .channel("rt:users")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "users" },
            (payload) => {
              const item = mapUser(payload.new as DbUserRow);
              const { users, setUsers } = useDataStore.getState();
              setUsers([...users.filter((u) => u.id !== item.id), item]);
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "users" },
            (payload) => {
              const updated = mapUser(payload.new as DbUserRow);
              const { users, setUsers } = useDataStore.getState();
              setUsers(users.map((u) => (u.id === updated.id ? updated : u)));
            }
          )
          .subscribe();

        channels.current.push(submissionsChannel, revisionsChannel, projectsChannel, usersChannel);
      }

      // ── Realtime: submission_types (all roles — employees need live updates) ──
      const submissionTypesChannel = supabase
        .channel("rt:submission_types")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "submission_types" },
          (payload) => {
            const item = mapSubmissionType(payload.new as DbSubmissionTypeRow);
            const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
            setSubmissionTypes([item, ...submissionTypes.filter((t) => t.id !== item.id)]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "submission_types" },
          (payload) => {
            const updated = mapSubmissionType(payload.new as DbSubmissionTypeRow);
            const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
            setSubmissionTypes(submissionTypes.map((t) => (t.id === updated.id ? updated : t)));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "submission_types" },
          (payload) => {
            const { submissionTypes, setSubmissionTypes } = useDataStore.getState();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setSubmissionTypes(submissionTypes.filter((t) => t.id !== (payload.old as any).id));
          }
        )
        .subscribe();
      channels.current.push(submissionTypesChannel);
    })();

    return () => {
      mounted = false;
      bootstrapped.current = false;
      sub.subscription.unsubscribe();
      channels.current.forEach((ch) => void supabase.removeChannel(ch));
      channels.current = [];
    };
  }, []);
}
