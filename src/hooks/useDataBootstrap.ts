"use client";
// Syncs revisions + submissions from Supabase into the Zustand store once per
// login session. This is the bridge between the real database and the in-memory
// seed/localStorage state: DB wins for any record that already exists in the
// store (by ID), and new DB records are appended. Records that only exist in
// seed (not yet in the DB) are kept as-is, so the mock-data demo still works.
//
// Result: approval / rejection decisions written to Supabase by any role
// (admin or manager) survive page refreshes and cross-device sessions.

import { useEffect, useRef } from "react";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { mapRevision, mapSubmission } from "@/lib/supabase/mappers";

export function useDataBootstrap() {
  const hydrated = useDataStore((s) => s.hydrated);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  // Track which userId we last synced for so re-login triggers a fresh sync.
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !authHydrated || !user) return;
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;

    async function sync() {
      const { revisions, setRevisions, submissions, setSubmissions } =
        useDataStore.getState();

      const [revRes, subRes] = await Promise.all([
        supabase.from("revisions").select("*"),
        supabase.from("submissions").select("*"),
      ]);

      // --- Revisions ---
      if (!revRes.error && revRes.data && revRes.data.length > 0) {
        const dbMap = new Map(revRes.data.map((r) => [r.id, mapRevision(r)]));
        // DB wins for existing records; keep seed-only records untouched
        const merged = revisions.map((r) => dbMap.get(r.id) ?? r);
        // Append any DB records not present in the store (created on another device)
        revRes.data.forEach((r) => {
          if (!revisions.some((x) => x.id === r.id)) merged.push(mapRevision(r));
        });
        setRevisions(merged);
      }

      // --- Submissions ---
      if (!subRes.error && subRes.data && subRes.data.length > 0) {
        const dbMap = new Map(
          subRes.data.map((r) => [r.id, mapSubmission(r, [])])
        );
        const merged = submissions.map((s) => dbMap.get(s.id) ?? s);
        subRes.data.forEach((r) => {
          if (!submissions.some((x) => x.id === r.id)) merged.push(mapSubmission(r, []));
        });
        setSubmissions(merged);
      }
    }

    sync().catch((e) =>
      // eslint-disable-next-line no-console
      console.warn("[useDataBootstrap] Supabase sync failed — using cached state:", e)
    );
  }, [hydrated, authHydrated, user]);
}
