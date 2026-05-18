// Revision service — Supabase-backed with optimistic local cache updates.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { RevisionRequest } from "@/types";
import { nowISO } from "@/lib/dates";
import { uid } from "@/lib/helpers";
import { supabase } from "@/lib/supabase/client";
import { mapRevision } from "@/lib/supabase/mappers";
import type { DbRevisionRow } from "@/lib/supabase/types";
import { logService } from "./log.service";
import { notificationService } from "./notification.service";

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[revisions:${label}]`, e);
}

export const revisionService = {
  list() {
    return useDataStore.getState().revisions;
  },

  async request(submissionId: string, reason: string) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Not authenticated");
    const { revisions, setRevisions, submissions, setSubmissions, users } =
      useDataStore.getState();
    const sub = submissions.find((s) => s.id === submissionId);
    if (!sub) throw new Error("Submission not found");

    const r: RevisionRequest = {
      id: uid("rev"),
      submissionId,
      userId: me.id,
      reason: reason.trim(),
      status: "pending",
      createdAt: nowISO(),
    };
    setRevisions([r, ...revisions]);
    setSubmissions(
      submissions.map((s) => (s.id === submissionId ? { ...s, status: "revision_requested" } : s))
    );

    const [insertResult, statusResult] = await Promise.all([
      supabase.from("revisions").insert({
        id: r.id,
        submission_id: r.submissionId,
        user_id: r.userId,
        reason: r.reason,
        status: "pending",
        created_at: r.createdAt,
      }),
      supabase.from("submissions").update({ status: "revision_requested" }).eq("id", submissionId),
    ]);
    if (insertResult.error) warn("request.insert", insertResult.error);
    if (statusResult.error) warn("request.status", statusResult.error);

    logService.append({
      userId: me.id,
      action: "revision.request",
      targetType: "revision",
      targetId: r.id,
    });
    users
      .filter((u) => u.role === "admin")
      .forEach((a) =>
        notificationService.push({
          userId: a.id,
          type: "warning",
          title: "Revision request",
          body: `${me.name} requested a revision for ${sub.date}.`,
          link: "/admin/revisions",
        })
      );
    return r;
  },

  async approve(revisionId: string, note?: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { revisions, setRevisions, submissions, setSubmissions } = useDataStore.getState();
    const r = revisions.find((x) => x.id === revisionId);
    if (!r) throw new Error("Not found");

    const decidedAt = nowISO();
    setRevisions(
      revisions.map((x) =>
        x.id === revisionId
          ? { ...x, status: "approved", adminId: me.id, adminNote: note, decidedAt }
          : x
      )
    );
    setSubmissions(
      submissions.map((s) =>
        s.id === r.submissionId ? { ...s, locked: false, status: "revision_approved" } : s
      )
    );

    const [revUpd, subUpd] = await Promise.all([
      supabase
        .from("revisions")
        .update({
          status: "approved",
          admin_id: me.id,
          admin_note: note ?? null,
          decided_at: decidedAt,
        })
        .eq("id", revisionId),
      supabase
        .from("submissions")
        .update({ locked: false, status: "revision_approved" })
        .eq("id", r.submissionId),
    ]);
    if (revUpd.error) warn("approve.rev", revUpd.error);
    if (subUpd.error) warn("approve.sub", subUpd.error);

    logService.append({
      userId: me.id,
      action: "revision.approve",
      targetType: "revision",
      targetId: revisionId,
    });
    notificationService.push({
      userId: r.userId,
      type: "success",
      title: "Revision approved",
      body: "You can re-upload your submission now.",
      link: "/my-submissions",
    });
  },

  async reject(revisionId: string, note: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { revisions, setRevisions, submissions, setSubmissions } = useDataStore.getState();
    const r = revisions.find((x) => x.id === revisionId);
    if (!r) throw new Error("Not found");

    const decidedAt = nowISO();
    setRevisions(
      revisions.map((x) =>
        x.id === revisionId
          ? { ...x, status: "rejected", adminId: me.id, adminNote: note, decidedAt }
          : x
      )
    );
    setSubmissions(
      submissions.map((s) =>
        s.id === r.submissionId ? { ...s, status: "revision_rejected" } : s
      )
    );

    const [revUpd, subUpd] = await Promise.all([
      supabase
        .from("revisions")
        .update({
          status: "rejected",
          admin_id: me.id,
          admin_note: note,
          decided_at: decidedAt,
        })
        .eq("id", revisionId),
      supabase.from("submissions").update({ status: "revision_rejected" }).eq("id", r.submissionId),
    ]);
    if (revUpd.error) warn("reject.rev", revUpd.error);
    if (subUpd.error) warn("reject.sub", subUpd.error);

    logService.append({
      userId: me.id,
      action: "revision.reject",
      targetType: "revision",
      targetId: revisionId,
    });
    notificationService.push({
      userId: r.userId,
      type: "danger",
      title: "Revision rejected",
      body: note || "Your revision request was rejected.",
      link: "/my-submissions",
    });
  },

  async refresh() {
    const { data, error } = await supabase
      .from("revisions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      warn("refresh", error);
      return;
    }
    const mapped = (data ?? []).map((r) => mapRevision(r as DbRevisionRow));
    useDataStore.getState().setRevisions(mapped);
  },
};
