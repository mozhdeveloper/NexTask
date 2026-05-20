// Submission service — uploads files to Supabase Storage, inserts/updates the
// submissions + attachments rows transactionally, and keeps the local cache in sync.

import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { Attachment, Submission } from "@/types";
import { nowISO, todayISO, isPastDeadline } from "@/lib/dates";
import { buildSubmissionPath, hashStub, pseudoIp, uid } from "@/lib/helpers";
import { logService } from "./log.service";
import { notificationService } from "./notification.service";
import { workSettingsService } from "./workSettings.service";
import { MAX_INLINE_DATA_URL_BYTES } from "@/lib/constants";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase/client";
import { mapSubmission } from "@/lib/supabase/mappers";
import type { DbAttachmentRow, DbSubmissionRow } from "@/lib/supabase/types";

interface CreateInput {
  date: string;
  submissionTypeId: string;
  taskTitle?: string;
  workSummary: string;
  tasksDetails?: string;
  files: File[];
}

interface UploadedAttachment {
  attachment: Attachment;
  storagePath: string | null;
}

function warn(label: string, e: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[submissions:${label}]`, e);
}

async function fileToInlineDataUrl(f: File): Promise<string | undefined> {
  if (f.size > MAX_INLINE_DATA_URL_BYTES) return undefined;
  return await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(f);
  });
}

async function uploadFile(userId: string, date: string, f: File): Promise<UploadedAttachment> {
  const storedName = f.name.replace(/\s+/g, "_");
  const path = `${userId}/${date}/${Date.now()}_${storedName}`;
  const dataUrl = await fileToInlineDataUrl(f);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, f, { upsert: false, contentType: f.type || "application/octet-stream" });
  const storagePath = error ? null : path;
  if (error) warn("storage.upload", error);

  return {
    storagePath,
    attachment: {
      id: uid("att"),
      originalName: f.name,
      storedName,
      sizeBytes: f.size,
      mime: f.type || "application/octet-stream",
      hashStub: hashStub(f.name + f.size + f.lastModified),
      dataUrl,
    },
  };
}

export const submissionService = {
  list(filter?: { userId?: string }) {
    const subs = useDataStore.getState().submissions;
    return filter?.userId ? subs.filter((s) => s.userId === filter.userId) : subs;
  },

  get(id: string) {
    return useDataStore.getState().submissions.find((s) => s.id === id) ?? null;
  },

  forUserOnDate(userId: string, date: string) {
    return (
      useDataStore
        .getState()
        .submissions.find((s) => s.userId === userId && s.date === date) ?? null
    );
  },

  async create(input: CreateInput) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Not authenticated");
    const { submissions, setSubmissions, submissionTypes, users } = useDataStore.getState();
    const type = submissionTypes.find((t) => t.id === input.submissionTypeId);
    if (!type) throw new Error("Submission type not found");

    if (input.files.length > type.maxFiles)
      throw new Error(`Too many files. Max ${type.maxFiles} file${type.maxFiles === 1 ? "" : "s"} per submission.`);
    for (const f of input.files) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!type.allowedFileTypes.includes(ext))
        throw new Error(`File type .${ext} is not allowed.`);
      if (f.size > type.maxFileSizeMB * 1024 * 1024)
        throw new Error(`File ${f.name} exceeds ${type.maxFileSizeMB} MB.`);
    }

    const existing = submissions.find(
      (s) =>
        s.userId === me.id &&
        s.date === input.date &&
        s.submissionTypeId === input.submissionTypeId
    );
    if (existing && existing.locked) {
      throw new Error("Submission is locked. Request a revision to edit.");
    }

    const uploads = await Promise.all(input.files.map((f) => uploadFile(me.id, input.date, f)));
    const attachments = uploads.map((u) => u.attachment);
    const submittedAt = nowISO();
    const username = me.name.split(" ")[0].toLowerCase();
    const pastDeadline = isPastDeadline(type.deadlineTime, new Date(input.date));
    const isToday = input.date === todayISO();
    // Past the workspace working-hours window for today → escalate to "late".
    const pastWorkHours = isToday && workSettingsService.isPastWorkEnd();
    const status: Submission["status"] = pastDeadline || pastWorkHours ? "late" : "submitted";

    const sub: Submission = {
      id: existing?.id ?? uid("sub"),
      userId: me.id,
      submissionTypeId: type.id,
      date: input.date,
      workSummary: input.workSummary.trim(),
      tasksDetails: (input.tasksDetails ?? "").trim(),
      attachments,
      status,
      locked: true,
      submittedAt,
      lockedAt: submittedAt,
      uploadedIp: pseudoIp(me.id + input.date),
      versionNumber: existing ? existing.versionNumber + 1 : 1,
      parentSubmissionId: existing?.id ?? null,
      startedAt: existing?.startedAt ?? null,
      taskTitle: input.taskTitle?.trim() || existing?.taskTitle || null,
      filePath: attachments[0]
        ? buildSubmissionPath({
            username,
            date: input.date,
            fileName: attachments[0].originalName,
            submittedAt,
          })
        : "",
    };

    // optimistic cache
    const next = existing
      ? submissions.map((s) => (s.id === existing.id ? sub : s))
      : [sub, ...submissions];
    setSubmissions(next);

    // DB: upsert submission row, then replace attachments
    const submissionRow = {
      id: sub.id,
      user_id: sub.userId,
      submission_type_id: sub.submissionTypeId,
      date: sub.date,
      work_summary: sub.workSummary,
      tasks_details: sub.tasksDetails,
      status: sub.status,
      locked: sub.locked,
      submitted_at: sub.submittedAt,
      locked_at: sub.lockedAt,
      uploaded_ip: sub.uploadedIp,
      version_number: sub.versionNumber,
      parent_submission_id: sub.parentSubmissionId,
      file_path: sub.filePath,
      started_at: sub.startedAt ?? null,
      task_title: sub.taskTitle ?? null,
    };

    const { error: subErr } = await supabase
      .from("submissions")
      .upsert(submissionRow, { onConflict: "id" });
    if (subErr) {
      warn("upsert", subErr);
      throw new Error("Failed to save submission to database.");
    }

    if (existing) {
      const { error: delErr } = await supabase
        .from("attachments")
        .delete()
        .eq("submission_id", sub.id);
      if (delErr) warn("att.delete", delErr);
    }

    if (uploads.length) {
      const attRows = uploads.map((u) => ({
        id: u.attachment.id,
        submission_id: sub.id,
        original_name: u.attachment.originalName,
        stored_name: u.attachment.storedName,
        size_bytes: u.attachment.sizeBytes,
        mime: u.attachment.mime,
        hash_stub: u.attachment.hashStub,
        storage_path: u.storagePath,
        data_url: u.attachment.dataUrl ?? null,
      }));
      const { error: attErr } = await supabase.from("attachments").insert(attRows);
      if (attErr) warn("att.insert", attErr);
    }

    logService.append({
      userId: me.id,
      action: "submission.upload",
      targetType: "submission",
      targetId: sub.id,
    });

    // ── Close the revision cycle if this is a revision re-upload ──────────
    // When the employee re-uploads after an approved revision, mark the
    // revision as "resubmitted" so admins know the cycle is complete.
    if (existing?.status === "revision_approved") {
      const { revisions, setRevisions } = useDataStore.getState();
      const resubmittedAt = nowISO();
      const approvedRev = revisions.find(
        (r) => r.submissionId === sub.id && r.status === "approved"
      );
      if (approvedRev) {
        setRevisions(
          revisions.map((r) =>
            r.id === approvedRev.id ? { ...r, status: "resubmitted", resubmittedAt } : r
          )
        );
        const { error: revErr } = await supabase
          .from("revisions")
          .update({ status: "resubmitted", decided_at: resubmittedAt })
          .eq("id", approvedRev.id);
        if (revErr) warn("revision.resubmit", revErr);

        logService.append({
          userId: me.id,
          action: "revision.resubmit",
          targetType: "revision",
          targetId: approvedRev.id,
        });
      }
    }

    // Notify admins and managers; use "warning" for late submissions.
    const isLate = status === "late";
    const isRevision = (existing?.versionNumber ?? 0) >= 1;
    users
      .filter((u) => u.role === "admin" || u.role === "manager")
      .forEach((recipient) => {
        const link = recipient.role === "admin" ? "/admin/submissions" : "/manager/submissions";
        notificationService.push({
          userId: recipient.id,
          type: isLate ? "warning" : "info",
          title: isLate
            ? "Late submission received"
            : isRevision
            ? "Revised submission received"
            : "New submission received",
          body: isLate
            ? `${me.name} submitted "${type.name}" for ${input.date} past the deadline.`
            : isRevision
            ? `${me.name} re-uploaded a revised submission for "${type.name}" on ${input.date}.`
            : `${me.name} submitted "${type.name}" for ${input.date}.`,
          link,
        });
      });

    return sub;
  },

  async unlock(id: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { submissions, setSubmissions } = useDataStore.getState();
    setSubmissions(
      submissions.map((s) =>
        s.id === id ? { ...s, locked: false, status: "revision_approved" } : s
      )
    );
    const { error } = await supabase
      .from("submissions")
      .update({ locked: false, status: "revision_approved" })
      .eq("id", id);
    if (error) warn("unlock", error);

    logService.append({
      userId: me.id,
      action: "submission.unlock",
      targetType: "submission",
      targetId: id,
    });
    const sub = submissions.find((s) => s.id === id);
    if (sub) {
      notificationService.push({
        userId: sub.userId,
        type: "success",
        title: "Submission unlocked",
        body: `Your submission for ${sub.date} can be edited again.`,
        link: "/my-submissions",
      });
    }
  },

  /**
   * Employee starts their workday: records `started_at` and an optional task title
   * on the (potentially new) submission row for today. Idempotent — re-calling
   * does NOT overwrite an existing startedAt.
   */
  async startDay(input: { date: string; submissionTypeId: string; taskTitle: string }) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Not authenticated");
    const { submissions, setSubmissions, submissionTypes } = useDataStore.getState();
    const type = submissionTypes.find((t) => t.id === input.submissionTypeId);
    if (!type) throw new Error("Submission type not found");

    const existing = submissions.find(
      (s) => s.userId === me.id && s.date === input.date && s.submissionTypeId === type.id
    );
    if (existing?.startedAt) return existing; // already started

    const startedAt = nowISO();
    const sub: Submission = existing
      ? { ...existing, startedAt, taskTitle: input.taskTitle.trim() || existing.taskTitle || null }
      : {
          id: uid("sub"),
          userId: me.id,
          submissionTypeId: type.id,
          date: input.date,
          workSummary: "",
          tasksDetails: "",
          attachments: [],
          status: "pending",
          locked: false,
          submittedAt: null,
          lockedAt: null,
          uploadedIp: pseudoIp(me.id + input.date),
          versionNumber: 1,
          parentSubmissionId: null,
          filePath: "",
          startedAt,
          taskTitle: input.taskTitle.trim() || null,
        };

    setSubmissions(existing ? submissions.map((s) => (s.id === sub.id ? sub : s)) : [sub, ...submissions]);

    const { error } = await supabase
      .from("submissions")
      .upsert(
        {
          id: sub.id,
          user_id: sub.userId,
          submission_type_id: sub.submissionTypeId,
          date: sub.date,
          work_summary: sub.workSummary,
          tasks_details: sub.tasksDetails,
          status: sub.status,
          locked: sub.locked,
          submitted_at: sub.submittedAt,
          locked_at: sub.lockedAt,
          uploaded_ip: sub.uploadedIp,
          version_number: sub.versionNumber,
          parent_submission_id: sub.parentSubmissionId,
          file_path: sub.filePath,
          started_at: sub.startedAt,
          task_title: sub.taskTitle,
        },
        { onConflict: "id" }
      );
    if (error) {
      warn("startDay", error);
      throw new Error("Failed to start day.");
    }

    logService.append({
      userId: me.id,
      action: "submission.start_day",
      targetType: "submission",
      targetId: sub.id,
    });
    return sub;
  },

  /**
   * Cancels an in-progress day: clears startedAt + taskTitle on a not-yet-submitted
   * row. If the row has no workSummary/attachments/submittedAt, the row is deleted
   * outright. No-op if the submission is already locked/submitted.
   */
  async resetDay(date: string) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Not authenticated");
    const { submissions, setSubmissions } = useDataStore.getState();
    const existing = submissions.find((s) => s.userId === me.id && s.date === date);
    if (!existing) return;
    if (existing.locked || existing.submittedAt) {
      throw new Error("This day is already submitted and locked. Request a revision instead.");
    }

    const hasContent =
      (existing.workSummary?.trim().length ?? 0) > 0 ||
      (existing.tasksDetails?.trim().length ?? 0) > 0 ||
      existing.attachments.length > 0;

    if (!hasContent) {
      setSubmissions(submissions.filter((s) => s.id !== existing.id));
      const { error } = await supabase.from("submissions").delete().eq("id", existing.id);
      if (error) warn("resetDay.delete", error);
    } else {
      const next = { ...existing, startedAt: null, taskTitle: null };
      setSubmissions(submissions.map((s) => (s.id === existing.id ? next : s)));
      const { error } = await supabase
        .from("submissions")
        .update({ started_at: null, task_title: null })
        .eq("id", existing.id);
      if (error) warn("resetDay.update", error);
    }

    logService.append({
      userId: me.id,
      action: "submission.reset_day",
      targetType: "submission",
      targetId: existing.id,
    });
  },

  /**
   * Force-reset the current user's submission for the given date — fully deletes
   * the row, its attachments, and storage files. Intended for self-service testing
   * and recovery. Allowed even when the submission is locked/submitted, because the
   * employee is wiping only their own data.
   */
  async forceResetDay(date: string) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Not authenticated");
    const { submissions, setSubmissions } = useDataStore.getState();
    const existing = submissions.find((s) => s.userId === me.id && s.date === date);
    if (!existing) return;

    // Optimistic remove from cache
    setSubmissions(submissions.filter((s) => s.id !== existing.id));

    // Remove storage objects (best-effort) before deleting attachment rows
    const storagePaths = existing.attachments
      .map((a) => a.storagePath)
      .filter((p): p is string => !!p);
    if (storagePaths.length > 0) {
      const { error: storErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths);
      if (storErr) warn("forceResetDay.storage", storErr);
    }

    // Delete attachments rows first (FK), then the submission row
    const { error: attErr } = await supabase
      .from("attachments")
      .delete()
      .eq("submission_id", existing.id);
    if (attErr) warn("forceResetDay.attachments", attErr);

    const { error: subErr } = await supabase
      .from("submissions")
      .delete()
      .eq("id", existing.id);
    if (subErr) {
      warn("forceResetDay.submission", subErr);
      throw new Error("Failed to reset submission in the database.");
    }

    logService.append({
      userId: me.id,
      action: "submission.force_reset",
      targetType: "submission",
      targetId: existing.id,
    });
  },

  markStatus(id: string, status: Submission["status"]) {
    const me = useAuthStore.getState().user;
    if (!me || (me.role !== "admin" && me.role !== "manager")) throw new Error("Forbidden");
    const { submissions, setSubmissions, users } = useDataStore.getState();
    const prev = submissions.find((s) => s.id === id);
    // Managers may only override submissions belonging to users in their own department.
    if (me.role === "manager" && prev) {
      const owner = users.find((u) => u.id === prev.userId);
      if (!owner || owner.departmentId !== me.departmentId) {
        throw new Error("Managers can only update submissions in their own department.");
      }
    }
    setSubmissions(submissions.map((s) => (s.id === id ? { ...s, status } : s)));
    supabase
      .from("submissions")
      .update({ status })
      .eq("id", id)
      .then(({ error }) => {
        if (error) warn("markStatus", error);
      });
    if (me) {
      logService.append({
        userId: me.id,
        action: "submission.mark_status",
        targetType: "submission",
        targetId: id,
      });
    }
    // Notify the submission owner (if status actually changed and isn't self-update).
    if (prev && prev.status !== status && prev.userId !== me.id) {
      const statusLabels: Record<string, string> = {
        submitted: "marked as submitted",
        late: "marked as late",
        missing: "marked as missing",
        excused: "excused (no submission required)",
        revision_requested: "sent back for revision",
        revision_approved: "revision approved",
        revision_rejected: "revision rejected",
        locked: "locked",
        pending: "reopened",
      };
      const action = statusLabels[status] ?? `updated to ${status}`;
      const tone: "success" | "warning" | "danger" | "info" =
        status === "submitted" || status === "revision_approved" || status === "excused"
          ? "success"
          : status === "revision_requested" || status === "late"
            ? "warning"
            : status === "missing" || status === "revision_rejected"
              ? "danger"
              : "info";
      // Notify the submission owner.
      notificationService.push({
        userId: prev.userId,
        type: tone,
        title: "Submission status updated",
        body: `Your submission for ${prev.date} was ${action} by ${me.name}.`,
        link: "/my-submissions",
      });

      // Fan-out to admins + managers for late / missing escalations.
      if (status === "late" || status === "missing") {
        const { users } = useDataStore.getState();
        const label = status === "late" ? "Late submission" : "Missing submission";
        const submissionOwner = users.find((u) => u.id === prev.userId);
        const ownerName = submissionOwner?.name ?? "An employee";
        users
          .filter((u) => (u.role === "admin" || u.role === "manager") && u.id !== me.id)
          .forEach((recipient) => {
            const link = recipient.role === "admin" ? "/admin/submissions" : "/manager/submissions";
            notificationService.push({
              userId: recipient.id,
              type: status === "late" ? "warning" : "danger",
              title: `${label} flagged`,
              body: `${ownerName}'s submission for ${prev.date} was marked ${status} by ${me.name}.`,
              link,
            });
          });
      }
    }
  },

  todayStats(userId: string) {
    const today = todayISO();
    const subs = useDataStore.getState().submissions.filter((s) => s.userId === userId);
    const t = subs.find((s) => s.date === today);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isOk = (s: Submission) =>
      s.status === "submitted" || s.status === "revision_approved" || s.status === "late";
    const weekSubs = subs.filter((s) => new Date(s.date) >= startOfWeek && new Date(s.date) <= now);
    const monthSubs = subs.filter(
      (s) => new Date(s.date) >= startOfMonth && new Date(s.date) <= now
    );
    return {
      todayStatus: t?.status ?? "pending",
      todaySubmission: t,
      week: {
        submitted: weekSubs.filter(isOk).length,
        expected: workSettingsService.countWorkingDays(startOfWeek, now),
      },
      month: {
        submitted: monthSubs.filter(isOk).length,
        expected: workSettingsService.countWorkingDays(startOfMonth, now),
      },
    };
  },

  /** Fetch all submissions (+ attachments) into cache. */
  async refresh() {
    const [subs, atts] = await Promise.all([
      supabase
        .from("submissions")
        .select("*")
        .order("date", { ascending: false }),
      supabase.from("attachments").select("*"),
    ]);
    if (subs.error) {
      warn("refresh.subs", subs.error);
      return;
    }
    if (atts.error) warn("refresh.atts", atts.error);

    const attByEntry = new Map<string, DbAttachmentRow[]>();
    for (const a of (atts.data ?? []) as DbAttachmentRow[]) {
      const list = attByEntry.get(a.submission_id) ?? [];
      list.push(a);
      attByEntry.set(a.submission_id, list);
    }
    const mapped = ((subs.data ?? []) as DbSubmissionRow[]).map((r) =>
      mapSubmission(r, attByEntry.get(r.id) ?? [])
    );
    useDataStore.getState().setSubmissions(mapped);
  },
};
