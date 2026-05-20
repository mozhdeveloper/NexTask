// POST /api/backups/run — admin-only. Inserts a backup_logs row, simulates the
// long-running job, then marks it completed. In production, this would shell out
// to pg_dump / Supabase Storage export. For now, the row is the record of truth.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

function backupFileName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `nextask_backup_${stamp}.sql.gz`;
}

export async function POST() {
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: caller } = await sb
    .from("users")
    .select("id,role")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!caller || (caller as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminPublicId = (caller as { id: string }).id;

  const id = `bk_${crypto.randomUUID().slice(0, 8)}`;
  const fileName = backupFileName();
  const storagePath = process.env.BACKUP_STORAGE_PATH ?? "./storage/backups";
  const filePath = `${storagePath}/${fileName}`;
  const startedAt = new Date().toISOString();

  const ins = await supabaseAdmin.from("backup_logs").insert({
    id,
    admin_id: adminPublicId,
    file_name: fileName,
    file_path: filePath,
    size_bytes: 0,
    started_at: startedAt,
    completed_at: null,
    status: "running",
  });
  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  // Simulate work (shorter on server than the previous client-side animation)
  await new Promise((r) => setTimeout(r, 1500));

  const sizeBytes = 25_000_000 + Math.floor(Math.random() * 6_000_000);
  const completedAt = new Date().toISOString();
  const upd = await supabaseAdmin
    .from("backup_logs")
    .update({
      size_bytes: sizeBytes,
      completed_at: completedAt,
      status: "completed",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (upd.error || !upd.data) {
    return NextResponse.json({ error: upd.error?.message ?? "Backup finalize failed" }, { status: 500 });
  }

  return NextResponse.json(upd.data, { status: 200 });
}
