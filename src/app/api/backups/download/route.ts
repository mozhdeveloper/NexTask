// GET /api/backups/download?id=<backupId> — admin-only.
// Returns a short-lived signed URL to the ZIP in the backups storage bucket.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedBackupUrl } from "@/lib/backup/build";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: caller } = await sb
    .from("users")
    .select("role")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!caller || (caller as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row, error } = await supabaseAdmin
    .from("backup_logs")
    .select("file_name,file_path,status")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = row as { file_name: string; file_path: string; status: string };
  if (r.status !== "completed" || !r.file_path || r.file_path === "(pending)") {
    return NextResponse.json({ error: "Backup not ready" }, { status: 409 });
  }

  try {
    const url = await signedBackupUrl(r.file_path, 5 * 60); // 5 min
    return NextResponse.json({ url, fileName: r.file_name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
