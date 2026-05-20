// Shared backup pipeline used by /api/backups/{run,send,auto}.
// Builds a ZIP containing:
//   - data.json    — JSON snapshot of every dynamic table
//   - manifest.txt — human-readable summary (date, row counts, file count)
//   - attachments/<userName>/<date>__<fileName> — actual files from Supabase Storage
//     filtered to TODAY's submissions only (auto/run) or all-in-range for export.
// Uploads the ZIP to the `backups` storage bucket and returns the path + size.

import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@/lib/supabase/client";

const BACKUP_BUCKET = process.env.BACKUP_STORAGE_BUCKET ?? "backups";

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
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

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

  // ── 2. Build a userId→name lookup for attachment folder names ─────────
  const usersById = new Map<string, { name: string }>();
  for (const u of snapshot.users as Array<{ id: string; name: string }>) {
    usersById.set(u.id, { name: u.name });
  }
  const subsById = new Map<string, { user_id: string; date: string }>();
  for (const s of snapshot.submissions as Array<{ id: string; user_id: string; date: string }>) {
    subsById.set(s.id, { user_id: s.user_id, date: s.date });
  }

  // ── 3. Collect attachments to include ──────────────────────────────────
  type Att = { storage_path: string | null; original_name: string; submission_id: string; size_bytes: number };
  const allAttachments = (snapshot.attachments as Att[]).filter((a) => a.storage_path);

  const want = opts.attachmentsForDate
    ? allAttachments.filter((a) => {
        const sub = subsById.get(a.submission_id);
        return sub && sub.date === opts.attachmentsForDate;
      })
    : allAttachments;

  // ── 4. Download attachments in batches (avoid memory blow-up) ─────────
  let attachmentCount = 0;
  let attachmentBytes = 0;
  const BATCH = 6;
  for (let i = 0; i < want.length; i += BATCH) {
    const slice = want.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (a) => {
        try {
          const { data, error } = await supabaseAdmin.storage
            .from(STORAGE_BUCKET)
            .download(a.storage_path!);
          if (error || !data) return { a, ok: false as const, err: error?.message ?? "no data" };
          const buf = Buffer.from(await data.arrayBuffer());
          return { a, ok: true as const, buf };
        } catch (e) {
          return { a, ok: false as const, err: (e as Error).message };
        }
      }),
    );
    for (const r of results) {
      if (!r.ok) continue;
      const sub = subsById.get(r.a.submission_id);
      const user = sub ? usersById.get(sub.user_id) : undefined;
      const folder = sanitize(user?.name ?? "unknown_user");
      const dateLabel = sub?.date ?? "no-date";
      const safeName = sanitize(r.a.original_name);
      zip.file(`attachments/${folder}/${dateLabel}__${safeName}`, r.buf);
      attachmentCount++;
      attachmentBytes += r.buf.length;
    }
  }

  // ── 5. Manifest ────────────────────────────────────────────────────────
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
    `Attachments included: ${attachmentCount} files (${(attachmentBytes / 1024 / 1024).toFixed(2)} MB)`,
    `Attachments skipped:  ${want.length - attachmentCount} (download errors)`,
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
