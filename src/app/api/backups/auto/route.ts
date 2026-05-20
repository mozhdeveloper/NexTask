// GET/POST /api/backups/auto — invoked by Vercel Cron (vercel.json: "0 * * * *").
// Vercel Cron sends GET by default; we accept both.
//
// Logic:
//   1. Reject if CRON_SECRET is configured and the request lacks the matching
//      Authorization header.
//   2. Read auto-backup settings from Supabase (NOT localStorage).
//   3. Skip if disabled, already ran today, or before scheduled hour.
//   4. Build a real ZIP (with today's attachments), upload, log it.
//   5. Email the configured address via Resend.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildBackupZip, downloadBackupZip, signedBackupUrl } from "@/lib/backup/build";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function handle(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret !== "change-me-to-a-random-secret") {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Read schedule ─────────────────────────────────────────────────────────
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("work_settings")
    .select("auto_backup_enabled, auto_backup_email, auto_backup_time, last_auto_backup_date")
    .eq("id", true)
    .maybeSingle();
  if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });
  if (!ws?.auto_backup_enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  if (ws.last_auto_backup_date === todayISO) {
    return NextResponse.json({ skipped: true, reason: "already_ran_today" });
  }
  const [hh, mm] = ((ws.auto_backup_time as string | null) || "22:00").split(":").map(Number);
  const now = new Date();
  const scheduledToday = new Date();
  scheduledToday.setHours(hh, mm, 0, 0);
  if (now < scheduledToday) {
    return NextResponse.json({ skipped: true, reason: "not_yet_time" });
  }

  // ── Run backup ────────────────────────────────────────────────────────────
  const id = `bk_${crypto.randomUUID().slice(0, 8)}`;
  await supabaseAdmin.from("backup_logs").insert({
    id,
    admin_id: null,
    file_name: "(pending)",
    file_path: "(pending)",
    size_bytes: 0,
    started_at: now.toISOString(),
    completed_at: null,
    status: "running",
  });

  let built;
  try {
    built = await buildBackupZip({
      triggeredBy: "auto-cron",
      attachmentsForDate: todayISO,
    });
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

  await supabaseAdmin
    .from("work_settings")
    .update({ last_auto_backup_date: todayISO })
    .eq("id", true);

  // ── Email ─────────────────────────────────────────────────────────────────
  const email = ws.auto_backup_email as string | null;
  let emailResult: { ok: boolean; error?: string } = { ok: true };
  if (email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddr = process.env.RESEND_FROM ?? "NexTask <onboarding@resend.dev>";
      const sizeMB = (built.sizeBytes / 1024 / 1024).toFixed(2);
      const zipBuffer = await downloadBackupZip(built.storagePath);
      const tooBig = zipBuffer.length > MAX_ATTACHMENT_BYTES;
      const signedUrl = tooBig
        ? await signedBackupUrl(built.storagePath, 24 * 60 * 60).catch(() => null)
        : null;

      const downloadBlock = tooBig
        ? `<p style="margin:0 0 12px;color:#b45309;font-size:14px"><strong>Note:</strong> ${sizeMB} MB exceeds attachment limit. Use this download link (expires in 24 h):</p>
           ${signedUrl ? `<p><a href="${signedUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Download backup</a></p>` : ""}`
        : "";

      const { error: sendErr } = await resend.emails.send({
        from: fromAddr,
        to: [email],
        subject: `NexTask Auto Backup — ${now.toLocaleDateString()}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
            <div style="padding:20px 0;border-bottom:1px solid #e2e8f0">
              <h1 style="margin:0;font-size:18px">NexTask Auto Backup</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:14px">Scheduled daily backup completed.</p>
            </div>
            <div style="padding:16px 0">
              <p style="margin:0 0 6px;font-size:14px"><strong>File:</strong> ${built.fileName}</p>
              <p style="margin:0 0 6px;font-size:14px"><strong>Size:</strong> ${sizeMB} MB</p>
              <p style="margin:0 0 6px;font-size:14px"><strong>Attachments:</strong> ${built.attachmentCount} employee submission files for today</p>
              <p style="margin:0;font-size:14px"><strong>Completed:</strong> ${new Date(built.generatedAt).toLocaleString()}</p>
              ${downloadBlock}
            </div>
            <div style="padding:14px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
              Sent automatically by NexTask
            </div>
          </div>
        `,
        attachments: tooBig
          ? []
          : [{ filename: built.fileName, content: zipBuffer.toString("base64") }],
      });
      if (sendErr) emailResult = { ok: false, error: sendErr.message };
    } catch (e) {
      emailResult = { ok: false, error: (e as Error).message };
    }
  }

  return NextResponse.json({
    ok: true,
    backupId: id,
    fileName: built.fileName,
    sizeBytes: built.sizeBytes,
    attachmentCount: built.attachmentCount,
    email,
    emailResult,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
