import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { Attachment, Submission } from "@/types";
import { nowISO, todayISO, isPastDeadline } from "@/lib/dates";
import { buildSubmissionPath, hashStub, pseudoIp, uid } from "@/lib/helpers";
import { logService } from "./log.service";
import { notificationService } from "./notification.service";
import { workSettingsService } from "./workSettings.service";
import { MAX_INLINE_DATA_URL_BYTES } from "@/lib/constants";

interface CreateInput {
  date: string;
  submissionTypeId: string;
  workSummary: string;
  tasksDetails?: string;
  files: File[];
}

async function fileToAttachment(f: File): Promise<Attachment> {
  let dataUrl: string | undefined;
  if (f.size <= MAX_INLINE_DATA_URL_BYTES) {
    dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(f);
    });
  }
  return {
    id: uid("att"),
    originalName: f.name,
    storedName: f.name.replace(/\s+/g, "_"),
    sizeBytes: f.size,
    mime: f.type || "application/octet-stream",
    hashStub: hashStub(f.name + f.size + f.lastModified),
    dataUrl,
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

    // validation
    for (const f of input.files) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!type.allowedFileTypes.includes(ext))
        throw new Error(`File type .${ext} is not allowed.`);
      if (f.size > type.maxFileSizeMB * 1024 * 1024)
        throw new Error(`File ${f.name} exceeds ${type.maxFileSizeMB} MB.`);
    }

    const existing = submissions.find(
      (s) => s.userId === me.id && s.date === input.date && s.submissionTypeId === input.submissionTypeId
    );
    if (existing && existing.locked) {
      throw new Error("Submission is locked. Request a revision to edit.");
    }

    const attachments = await Promise.all(input.files.map(fileToAttachment));
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
      filePath:
        attachments[0]
          ? buildSubmissionPath({
              username,
              date: input.date,
              fileName: attachments[0].originalName,
              submittedAt,
            })
          : "",
    };

    const next = existing
      ? submissions.map((s) => (s.id === existing.id ? sub : s))
      : [sub, ...submissions];
    setSubmissions(next);

    logService.append({
      userId: me.id,
      action: "submission.upload",
      targetType: "submission",
      targetId: sub.id,
    });

    // Notify admins
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
  unlock(id: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { submissions, setSubmissions } = useDataStore.getState();
    setSubmissions(
      submissions.map((s) =>
        s.id === id ? { ...s, locked: false, status: "revision_approved" } : s
      )
    );
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
    const { submissions, setSubmissions } = useDataStore.getState();
    setSubmissions(submissions.map((s) => (s.id === id ? { ...s, status } : s)));
  },
  todayStats(userId: string) {
    const today = todayISO();
    const subs = useDataStore.getState().submissions.filter((s) => s.userId === userId);
    const t = subs.find((s) => s.date === today);
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isOk = (s: Submission) => s.status === "submitted" || s.status === "revision_approved" || s.status === "late";
    const weekSubs = subs.filter((s) => new Date(s.date) >= startOfWeek && new Date(s.date) <= now);
    const monthSubs = subs.filter((s) => new Date(s.date) >= startOfMonth && new Date(s.date) <= now);
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
};
