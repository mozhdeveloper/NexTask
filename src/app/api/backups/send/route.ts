// POST /api/backups/send — admin-only.
// Builds a JSON snapshot of workspace data and emails it via Resend.
// Body: { email: string, backupId?: string }
//   - If backupId is provided, the backup_log id is included for traceability.
//   - The email contains a JSON attachment with all dynamic tables.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

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
  const email = isEmail(body.email) ? body.email : null;
  if (!email) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const backupId = typeof body.backupId === "string" ? body.backupId : null;

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM ?? "NexTask <onboarding@resend.dev>";
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured on the server" },
      { status: 500 },
    );
  }

  // ─── Build snapshot ──────────────────────────────────────────────────────
  const snapshot: Record<string, unknown> = {
    _meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: (caller as { name: string }).name,
      backupId,
      project: "NexTask",
    },
  };
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const { data, error } = await supabaseAdmin.from(t).select("*");
    if (error) {
      return NextResponse.json(
        { error: `Failed to read ${t}: ${error.message}` },
        { status: 500 },
      );
    }
    snapshot[t] = data ?? [];
    counts[t] = (data ?? []).length;
  }

  const json = JSON.stringify(snapshot, null, 2);
  const fileBase64 = Buffer.from(json, "utf8").toString("base64");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `nextask_backup_${stamp}.json`;

  const sizeKB = (json.length / 1024).toFixed(1);
  const countsHtml = Object.entries(counts)
    .map(([t, n]) => `<tr><td style="padding:4px 12px;color:#475569">${t}</td><td style="padding:4px 12px;text-align:right;font-weight:600;color:#0f172a">${n}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="padding:24px 0;border-bottom:1px solid #e2e8f0">
        <h1 style="margin:0;font-size:20px;color:#0f172a">NexTask Backup</h1>
        <p style="margin:6px 0 0;color:#64748b;font-size:14px">A workspace data snapshot is attached to this email.</p>
      </div>
      <div style="padding:20px 0">
        <p style="margin:0 0 8px;font-size:14px"><strong>File:</strong> ${fileName}</p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Size:</strong> ${sizeKB} KB</p>
        <p style="margin:0 0 16px;font-size:14px"><strong>Generated:</strong> ${now.toLocaleString()}</p>
        <table style="border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px;overflow:hidden;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600">Table</th>
              <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600">Rows</th>
            </tr>
          </thead>
          <tbody>${countsHtml}</tbody>
        </table>
      </div>
      <div style="padding:16px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">
        Sent by NexTask &middot; ${(caller as { name: string }).name}
      </div>
    </div>
  `;

  const resend = new Resend(apiKey);
  const { data: sendData, error: sendErr } = await resend.emails.send({
    from: fromAddr,
    to: [email],
    subject: `NexTask Backup — ${now.toLocaleDateString()}`,
    html,
    attachments: [
      {
        filename: fileName,
        content: fileBase64,
      },
    ],
  });

  if (sendErr) {
    return NextResponse.json(
      { error: sendErr.message ?? "Email send failed" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      messageId: sendData?.id ?? null,
      email,
      fileName,
      sizeBytes: json.length,
      counts,
    },
    { status: 200 },
  );
}
