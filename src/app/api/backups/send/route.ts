// POST /api/backups/send — admin-only.
// Body: { email: string, backupId?: string }
//
// Two modes:
//   1. backupId provided AND that backup has a real storage_path → download
//      the existing ZIP and email it.
//   2. No backupId (or storage_path missing) → build a fresh ZIP (with TODAY's
//      attachments), upload it, log it, and email it.
//
// Email cap: Resend allows ~40 MB total. We skip the attachment if the ZIP
// exceeds 20 MB and include a signed download link instead (24 h expiry).

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "node:crypto";
import { buildBackupZip, downloadBackupZip, signedBackupUrl } from "@/lib/backup/build";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

// Manual "Email backup" deliveries are permanently locked to this address.
// This matches the Resend account owner (the only recipient Resend will accept
// while the custom sending domain is unverified) and gives admins a single,
// auditable destination for ad-hoc backup emails.
export const MANUAL_BACKUP_RECIPIENT = "premium.global.official@gmail.com";

// Resend always allows this FROM without a verified domain. Using it for
// manual sends guarantees deliverability regardless of RESEND_FROM env state.
const MANUAL_BACKUP_FROM = "NexTask Backups <onboarding@resend.dev>";

export async function POST(req: Request) {
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: caller } = await sb
    .from("users")
    .select("id,role,name,email")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!caller || (caller as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: unknown; backupId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Manual backup sends are permanently locked to MANUAL_BACKUP_RECIPIENT.
  // We ignore any client-supplied email to avoid Resend rejecting the send
  // (the sending domain is currently unverified, so Resend only accepts the
  // account-owner address). We still accept the field for API back-compat.
  void body.email;
  const email = MANUAL_BACKUP_RECIPIENT;
  const backupId = typeof body.backupId === "string" ? body.backupId : null;

  const apiKey = process.env.RESEND_API_KEY;
  // Use onboarding@resend.dev for manual sends — always allowed by Resend even
  // without a verified domain, so deliverability does not depend on env config.
  const fromAddr = MANUAL_BACKUP_FROM;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured on the server" },
      { status: 500 },
    );
  }

  const callerName = (caller as { name: string }).name;
  const adminPublicId = (caller as { id: string }).id;

  // ── Resolve the backup: download existing or build fresh ──────────────────
  let fileName: string;
  let storagePath: string;
  let zipBuffer: Buffer;
  let attachmentCount = 0;
  let rowCounts: Record<string, number> = {};

  if (backupId) {
    const { data: row, error } = await supabaseAdmin
      .from("backup_logs")
      .select("file_name,file_path,size_bytes,status")
      .eq("id", backupId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    const r = row as { file_name: string; file_path: string; status: string };
    if (r.status !== "completed" || !r.file_path || r.file_path === "(pending)") {
      return NextResponse.json({ error: "Backup is not ready" }, { status: 409 });
    }
    try {
      zipBuffer = await downloadBackupZip(r.file_path);
      fileName = r.file_name;
      storagePath = r.file_path;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  } else {
    const id = `bk_${crypto.randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    const today = startedAt.slice(0, 10);
    await supabaseAdmin.from("backup_logs").insert({
      id,
      admin_id: adminPublicId,
      file_name: "(pending)",
      file_path: "(pending)",
      size_bytes: 0,
      started_at: startedAt,
      completed_at: null,
      status: "running",
    });
    try {
      const built = await buildBackupZip({
        triggeredBy: `email:${callerName}`,
        attachmentsForDate: today,
      });
      zipBuffer = await downloadBackupZip(built.storagePath);
      fileName = built.fileName;
      storagePath = built.storagePath;
      attachmentCount = built.attachmentCount;
      rowCounts = built.rowCounts;
      await supabaseAdmin
        .from("backup_logs")
        .update({
          file_name: built.fileName,
          file_path: built.storagePath,
          size_bytes: built.sizeBytes,
          completed_at: new Date().toISOString(),
          status: "completed",
        })
        .eq("id", id);
    } catch (e) {
      await supabaseAdmin
        .from("backup_logs")
        .update({
          completed_at: new Date().toISOString(),
          status: "failed",
          file_name: `(failed) ${(e as Error).message.slice(0, 80)}`,
        })
        .eq("id", id);
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Compose email ─────────────────────────────────────────────────────────
  const now = new Date();
  const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
  const tooBig = zipBuffer.length > MAX_ATTACHMENT_BYTES;
  let signedUrl: string | null = null;
  if (tooBig) {
    try {
      signedUrl = await signedBackupUrl(storagePath, 24 * 60 * 60);
    } catch {
      signedUrl = null;
    }
  }

  const downloadBlock = tooBig
    ? `<p style="margin:0 0 12px;font-size:14px;color:#b45309"><strong>Note:</strong> File is ${sizeMB} MB, too large to attach. Use this download link (expires in 24 h):</p>
       ${signedUrl ? `<p><a href="${signedUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Download backup</a></p>` : `<p style="color:#dc2626">Sign-link failed — open the Backups page to download directly.</p>`}`
    : "";

  const countsHtml = Object.keys(rowCounts).length
    ? `<table style="border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px;overflow:hidden;font-size:13px;margin-top:12px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600">Table</th>
          <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600">Rows</th>
        </tr></thead>
        <tbody>${Object.entries(rowCounts)
          .map(([t, n]) => `<tr><td style="padding:4px 12px;color:#475569">${t}</td><td style="padding:4px 12px;text-align:right;font-weight:600;color:#0f172a">${n}</td></tr>`)
          .join("")}</tbody>
       </table>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="padding:24px 0;border-bottom:1px solid #e2e8f0">
        <h1 style="margin:0;font-size:20px;color:#0f172a">NexTask Backup</h1>
        <p style="margin:6px 0 0;color:#64748b;font-size:14px">Workspace snapshot ready.</p>
      </div>
      <div style="padding:20px 0">
        <p style="margin:0 0 8px;font-size:14px"><strong>File:</strong> ${fileName}</p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Size:</strong> ${sizeMB} MB</p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Generated:</strong> ${now.toLocaleString()}</p>
        ${attachmentCount > 0 ? `<p style="margin:0 0 16px;font-size:14px"><strong>Attachments:</strong> ${attachmentCount} employee submission files for today</p>` : ""}
        ${downloadBlock}
        ${countsHtml}
      </div>
      <div style="padding:16px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
        Sent by NexTask &middot; ${callerName}
      </div>
    </div>
  `;

  const resend = new Resend(apiKey);
  const { data: sendData, error: sendErr } = await resend.emails.send({
    from: fromAddr,
    to: [email],
    subject: `NexTask Backup — ${now.toLocaleDateString()}`,
    html,
    attachments: tooBig
      ? []
      : [{ filename: fileName, content: zipBuffer.toString("base64") }],
  });

  if (sendErr) {
    return NextResponse.json({ error: sendErr.message ?? "Email send failed" }, { status: 502 });
  }

  return NextResponse.json(
    {
      ok: true,
      messageId: sendData?.id ?? null,
      email,
      fileName,
      sizeBytes: zipBuffer.length,
      attached: !tooBig,
      signedUrl,
    },
    { status: 200 },
  );
}
