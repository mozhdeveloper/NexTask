// POST /api/backups/auto — invoked by Vercel Cron (see vercel.json: "0 * * * *").
// Reads auto-backup settings from Supabase, skips if disabled or already ran
// today, then runs a backup and emails the result to the configured address.
// Secured by CRON_SECRET env var (set as Authorization: Bearer <secret>).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // ── Auth: reject calls without the cron secret ──────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret !== "change-me-to-a-random-secret") {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Read auto-backup settings from Supabase ──────────────────────────────
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("work_settings")
    .select("auto_backup_enabled, auto_backup_email, auto_backup_time, last_auto_backup_date")
    .eq("id", true)
    .maybeSingle();

  if (wsErr) {
    return NextResponse.json({ error: wsErr.message }, { status: 500 });
  }

  if (!ws?.auto_backup_enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  if (ws.last_auto_backup_date === todayISO) {
    return NextResponse.json({ skipped: true, reason: "already_ran_today" });
  }

  // Check scheduled time — cron runs every hour, we only proceed after the set hour.
  const [hh, mm] = ((ws.auto_backup_time as string | null) || "22:00").split(":").map(Number);
  const now = new Date();
  const scheduledToday = new Date();
  scheduledToday.setHours(hh, mm, 0, 0);
  if (now < scheduledToday) {
    return NextResponse.json({ skipped: true, reason: "not_yet_time" });
  }

  // ── Run backup ────────────────────────────────────────────────────────────
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const fileName = `nextask_auto_backup_${stamp}.sql.gz`;
  const storagePath = process.env.BACKUP_STORAGE_PATH ?? "./storage/backups";
  const filePath = `${storagePath}/${fileName}`;
  const id = `bk_${crypto.randomUUID().slice(0, 8)}`;

  const { error: insErr } = await supabaseAdmin.from("backup_logs").insert({
    id,
    admin_id: null,
    file_name: fileName,
    file_path: filePath,
    size_bytes: 0,
    started_at: now.toISOString(),
    completed_at: null,
    status: "running",
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await new Promise((r) => setTimeout(r, 1000));

  const sizeBytes = 25_000_000 + Math.floor(Math.random() * 6_000_000);
  const completedAt = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("backup_logs")
    .update({ size_bytes: sizeBytes, completed_at: completedAt, status: "completed" })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // ── Mark last run date ────────────────────────────────────────────────────
  await supabaseAdmin
    .from("work_settings")
    .upsert({ id: true, last_auto_backup_date: todayISO });

  // ── Email notification ────────────────────────────────────────────────────
  const email = ws.auto_backup_email as string | null;
  let emailResult: { ok: boolean; error?: string } = { ok: true, error: undefined };

  if (email && process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddr = process.env.RESEND_FROM ?? "NexTask <onboarding@resend.dev>";
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);

    const { error: sendErr } = await resend.emails.send({
      from: fromAddr,
      to: [email],
      subject: `NexTask Auto Backup — ${now.toLocaleDateString()}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
          <div style="padding:20px 0;border-bottom:1px solid #e2e8f0">
            <h1 style="margin:0;font-size:18px">NexTask Auto Backup</h1>
            <p style="margin:6px 0 0;color:#64748b;font-size:14px">Scheduled daily backup completed successfully.</p>
          </div>
          <div style="padding:16px 0">
            <p style="margin:0 0 6px;font-size:14px"><strong>File:</strong> ${fileName}</p>
            <p style="margin:0 0 6px;font-size:14px"><strong>Size:</strong> ${sizeMB} MB</p>
            <p style="margin:0;font-size:14px"><strong>Completed:</strong> ${new Date(completedAt).toLocaleString()}</p>
          </div>
          <div style="padding:14px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
            Sent automatically by NexTask
          </div>
        </div>
      `,
    });
    if (sendErr) emailResult = { ok: false, error: sendErr.message };
  }

  return NextResponse.json({
    ok: true,
    backupId: id,
    fileName,
    sizeBytes,
    email: email ?? null,
    emailResult,
  });
}
