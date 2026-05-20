// Shared backup pipeline used by /api/backups/{run,send,auto}.
// Builds a ZIP containing:
//   - data.json    — JSON snapshot of every dynamic table (full DB backup)
//   - manifest.txt — human-readable summary
//   - employees/<userName>/<date>__<typeName>/description.json
//                          + every original file the employee uploaded (1:1, untouched)
// Uploads the ZIP to the `backups` storage bucket and returns the path + size.

import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BACKUP_BUCKET = process.env.BACKUP_STORAGE_BUCKET ?? "backups";
// Read directly from env — do NOT import from client.ts ("use client" module)
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "submissions";

const TABLES = [
  "users",
  "departments",
  "submission_types",
  "submissions",
  "attachments",
  "revisions",
  "projects",
  "holidays",
  "notifications",
  "activity_logs",
  "backup_logs",
  "work_settings",
] as const;

export interface BuiltBackup {
  fileName: string;
  storagePath: string;            // path inside the backups bucket
  sizeBytes: number;
  rowCounts: Record<string, number>;
  attachmentCount: number;
  attachmentBytes: number;
  generatedAt: string;            // ISO
}

export interface BuildOptions {
  /** Only include attachments uploaded on this date (YYYY-MM-DD). Omit for all. */
  attachmentsForDate?: string | null;
  /** Used in the manifest. */
  triggeredBy?: string;
  /** Override file name. Otherwise auto-stamped. */
  fileName?: string;
}

function stamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "untitled";
}

type DbUser       = { id: string; name: string; email: string; role: string; department_id: string | null; job_title: string | null };
type DbDept       = { id: string; name: string };
type DbType       = { id: string; name: string };
type DbSubmission = {
  id: string;
  user_id: string;
  submission_type_id: string;
  date: string;
  work_summary: string;
  tasks_details: string;
  status: string;
  locked: boolean;
  submitted_at: string | null;
  version_number: number;
};
type DbAttachment = {
  id: string;
  submission_id: string;
  storage_path: string | null;
  original_name: string;
  size_bytes: number;
  mime: string;
};

/**
 * Builds the backup zip, uploads it to the `backups` bucket, and returns metadata.
 * Throws on any unrecoverable error so callers can record `status: "failed"`.
 */
export async function buildBackupZip(opts: BuildOptions = {}): Promise<BuiltBackup> {
  const startedAt = new Date();
  const zip = new JSZip();

  // ── 1. Snapshot tables ─────────────────────────────────────────────────
  const snapshot: Record<string, unknown> = {
    _meta: {
      generatedAt: startedAt.toISOString(),
      triggeredBy: opts.triggeredBy ?? "manual",
      attachmentsForDate: opts.attachmentsForDate ?? null,
      project: "NexTask",
    },
  };
  const rowCounts: Record<string, number> = {};
  for (const t of TABLES) {
    const { data, error } = await supabaseAdmin.from(t).select("*");
    if (error) throw new Error(`Failed to read ${t}: ${error.message}`);
    snapshot[t] = data ?? [];
    rowCounts[t] = (data ?? []).length;
  }
  zip.file("data.json", JSON.stringify(snapshot, null, 2));

  // ── 2. Build lookup maps ───────────────────────────────────────────────
  const usersById = new Map<string, DbUser>();
  for (const u of snapshot.users as DbUser[]) usersById.set(u.id, u);

  const deptsById = new Map<string, DbDept>();
  for (const d of snapshot.departments as DbDept[]) deptsById.set(d.id, d);

  const typesById = new Map<string, DbType>();
  for (const t of snapshot.submission_types as DbType[]) typesById.set(t.id, t);

  const submissions = snapshot.submissions as DbSubmission[];
  const attachments = (snapshot.attachments as DbAttachment[]).filter((a) => a.storage_path);

  // Group attachments by submission_id
  const attBySubmission = new Map<string, DbAttachment[]>();
  for (const a of attachments) {
    const arr = attBySubmission.get(a.submission_id) ?? [];
    arr.push(a);
    attBySubmission.set(a.submission_id, arr);
  }

  // ── 3. Pick the submissions to include in /employees ──────────────────
  const targetSubs = opts.attachmentsForDate
    ? submissions.filter((s) => s.date === opts.attachmentsForDate)
    : submissions;

  // ── 4. Pre-flatten the file list so we can batch downloads ────────────
  type Entry = { sub: DbSubmission; att: DbAttachment; folder: string };
  const entries: Entry[] = [];
  for (const sub of targetSubs) {
    const user = usersById.get(sub.user_id);
    const type = typesById.get(sub.submission_type_id);
    const userFolder   = sanitize(user?.name ?? `user_${sub.user_id}`);
    const subFolder    = `${sub.date}__${sanitize(type?.name ?? "submission")}${sub.version_number > 1 ? `_v${sub.version_number}` : ""}`;
    const folder       = `employees/${userFolder}/${subFolder}`;

    // description.json — added immediately, no I/O required
    const description = {
      submissionId:    sub.id,
      date:            sub.date,
      employee: {
        id:            user?.id ?? sub.user_id,
        name:          user?.name ?? "(unknown)",
        email:         user?.email ?? "",
        role:          user?.role ?? "",
        jobTitle:      user?.job_title ?? null,
        department:    user?.department_id ? deptsById.get(user.department_id)?.name ?? null : null,
      },
      submissionType:  type?.name ?? "(unknown)",
      status:          sub.status,
      locked:          sub.locked,
      submittedAt:     sub.submitted_at,
      versionNumber:   sub.version_number,
      taskDescription: {
        workSummary:   sub.work_summary,
        tasksDetails:  sub.tasks_details,
      },
      files: (attBySubmission.get(sub.id) ?? []).map((a) => ({
        originalName: a.original_name,
        sizeBytes:    a.size_bytes,
        mime:         a.mime,
      })),
    };
    zip.file(`${folder}/description.json`, JSON.stringify(description, null, 2));

    // Queue the actual file downloads
    for (const att of attBySubmission.get(sub.id) ?? []) entries.push({ sub, att, folder });
  }

  // ── 5. Download attachments in batches (avoid memory blow-up) ─────────
  let attachmentCount = 0;
  let attachmentBytes = 0;
  let attachmentSkipped = 0;
  const BATCH = 6;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (e) => {
        try {
          const { data, error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .download(e.att.storage_path!);
          if (error || !data) return { e, ok: false as const, err: error?.message ?? "no data" };
          const buf = Buffer.from(await data.arrayBuffer());
          return { e, ok: true as const, buf };
        } catch (err) {
          return { e, ok: false as const, err: (err as Error).message };
        }
      }),
    );
    for (const r of results) {
      if (!r.ok) {
        attachmentSkipped++;
        continue;
      }
      // Files written 1:1 with their ORIGINAL filename. If two attachments
      // in the same submission share the same name, prefix with attachment id.
      const safeName = sanitize(r.e.att.original_name);
      const targetPath = `${r.e.folder}/${safeName}`;
      const finalPath = zip.file(targetPath)
        ? `${r.e.folder}/${r.e.att.id.slice(-6)}__${safeName}` // collision
        : targetPath;
      zip.file(finalPath, r.buf);
      attachmentCount++;
      attachmentBytes += r.buf.length;
    }
  }

  // ── 6. Manifest ────────────────────────────────────────────────────────
  const lines: string[] = [
    `NexTask Backup`,
    `===============`,
    `Generated:        ${startedAt.toISOString()}`,
    `Generated local:  ${startedAt.toLocaleString()}`,
    `Triggered by:     ${opts.triggeredBy ?? "manual"}`,
    `Attachments for:  ${opts.attachmentsForDate ?? "all dates"}`,
    ``,
    `Row counts:`,
    ...Object.entries(rowCounts).map(([t, n]) => `  ${t.padEnd(20)} ${n}`),
    ``,
    `Submissions in /employees: ${targetSubs.length}`,
    `Attachments included:      ${attachmentCount} files (${(attachmentBytes / 1024 / 1024).toFixed(2)} MB)`,
    `Attachments skipped:       ${attachmentSkipped} (download errors)`,
    ``,
    `Layout:`,
    `  data.json                                          full DB snapshot`,
    `  manifest.txt                                       this file`,
    `  employees/<name>/<date>__<type>/description.json   task description + metadata`,
    `  employees/<name>/<date>__<type>/<original_file>    employee's uploaded files (untouched)`,
  ];
  zip.file("manifest.txt", lines.join("\n"));

  // ── 6. Compress ────────────────────────────────────────────────────────
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // ── 7. Upload to Supabase Storage ──────────────────────────────────────
  const fileName = opts.fileName ?? `nextask_backup_${stamp(startedAt)}.zip`;
  const yearMonth = `${startedAt.getFullYear()}/${String(startedAt.getMonth() + 1).padStart(2, "0")}`;
  const storagePath = `${yearMonth}/${fileName}`;

  const up = await supabaseAdmin.storage
    .from(BACKUP_BUCKET)
    .upload(storagePath, buf, {
      contentType: "application/zip",
      upsert: true,
    });
  if (up.error) {
    // Bucket may not exist yet — be explicit so the admin knows what to create.
    throw new Error(
      `Failed to upload to "${BACKUP_BUCKET}" bucket: ${up.error.message}. ` +
        `Create a private storage bucket named "${BACKUP_BUCKET}" in your Supabase project.`,
    );
  }

  return {
    fileName,
    storagePath,
    sizeBytes: buf.length,
    rowCounts,
    attachmentCount,
    attachmentBytes,
    generatedAt: startedAt.toISOString(),
  };
}

/** Download an already-uploaded backup as a Buffer (used by email send + UI download). */
export async function downloadBackupZip(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from(BACKUP_BUCKET)
    .download(storagePath);
  if (error || !data) throw new Error(`Backup file not found: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Short-lived signed URL for direct browser download. */
export async function signedBackupUrl(storagePath: string, expiresIn = 60 * 60): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BACKUP_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to sign URL");
  return data.signedUrl;
}
