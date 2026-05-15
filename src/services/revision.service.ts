import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { RevisionRequest } from "@/types";
import { nowISO } from "@/lib/dates";
import { uid } from "@/lib/helpers";
import { logService } from "./log.service";
import { notificationService } from "./notification.service";

export const revisionService = {
  list() {
    return useDataStore.getState().revisions;
  },
  request(submissionId: string, reason: string) {
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
  approve(revisionId: string, note?: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { revisions, setRevisions, submissions, setSubmissions } = useDataStore.getState();
    const r = revisions.find((x) => x.id === revisionId);
    if (!r) throw new Error("Not found");
    setRevisions(
      revisions.map((x) =>
        x.id === revisionId
          ? {
              ...x,
              status: "approved",
              adminId: me.id,
              adminNote: note,
              decidedAt: nowISO(),
            }
          : x
      )
    );
    setSubmissions(
      submissions.map((s) =>
        s.id === r.submissionId
          ? { ...s, locked: false, status: "revision_approved" }
          : s
      )
    );
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
  reject(revisionId: string, note: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { revisions, setRevisions, submissions, setSubmissions } = useDataStore.getState();
    const r = revisions.find((x) => x.id === revisionId);
    if (!r) throw new Error("Not found");
    setRevisions(
      revisions.map((x) =>
        x.id === revisionId
          ? {
              ...x,
              status: "rejected",
              adminId: me.id,
              adminNote: note,
              decidedAt: nowISO(),
            }
          : x
      )
    );
    setSubmissions(
      submissions.map((s) =>
        s.id === r.submissionId ? { ...s, status: "revision_rejected" } : s
      )
    );
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
};
