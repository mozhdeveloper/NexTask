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
    const status: Submission["status"] = isPastDeadline(type.deadlineTime, new Date(input.date))
      ? "late"
      : "submitted";

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

    users
      .filter((u) => u.role === "admin")
      .forEach((admin) =>
        notificationService.push({
          userId: admin.id,
          type: "info",
          title: "New submission received",
          body: `${me.name} submitted "${type.name}" for ${input.date}.`,
          link: "/admin/submissions",
        })
      );

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

  markStatus(id: string, status: Submission["status"]) {
    const me = useAuthStore.getState().user;
    const { submissions, setSubmissions } = useDataStore.getState();
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
