"use client";

// Hydrate the in-memory Zustand cache from Supabase once on app boot,
// and re-sync the auth user when Supabase auth state changes.

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
import { mapDepartment, mapSubmissionType } from "@/lib/supabase/mappers";
import type { DbDepartmentRow, DbSubmissionTypeRow } from "@/lib/supabase/types";

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

export function useBootstrap() {
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

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

    // 3. Hydrate all caches from DB.
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
      useDataStore.setState({ hydrated: true });

      // notifications depend on knowing who I am
      const me = useAuthStore.getState().user;
      if (me) await notificationService.refresh(me.id);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);
}
