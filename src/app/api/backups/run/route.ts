// POST /api/backups/run — admin-only. Builds a real ZIP backup, uploads to
// Supabase Storage (private "backups" bucket), and records it in backup_logs.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildBackupZip } from "@/lib/backup/build";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: caller } = await sb
    .from("users")
    .select("id,role,name")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!caller || (caller as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminPublicId = (caller as { id: string }).id;
  const adminName = (caller as { name: string }).name;

  const id = `bk_${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const today = startedAt.slice(0, 10);

  // Insert "running" row first so the UI has a record even if the build throws.
  const ins = await supabaseAdmin.from("backup_logs").insert({
    id,
    admin_id: adminPublicId,
    file_name: "(pending)",
    file_path: "(pending)",
    size_bytes: 0,
    started_at: startedAt,
    completed_at: null,
    status: "running",
  });
  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  try {
    const built = await buildBackupZip({
      triggeredBy: `manual:${adminName}`,
      attachmentsForDate: today,
    });

    const upd = await supabaseAdmin
      .from("backup_logs")
      .update({
        file_name: built.fileName,
        file_path: built.storagePath,
        size_bytes: built.sizeBytes,
        completed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", id)
      .select("*")
      .single();

    if (upd.error || !upd.data) {
      return NextResponse.json({ error: upd.error?.message ?? "Failed to finalize" }, { status: 500 });
    }
    return NextResponse.json(
      {
        ...upd.data,
        _detail: {
          attachmentCount: built.attachmentCount,
          attachmentBytes: built.attachmentBytes,
          rowCounts: built.rowCounts,
        },
      },
      { status: 200 },
    );
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
