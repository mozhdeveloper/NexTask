// POST /api/logs — capture real client IP/UA server-side and write activity log.
// This endpoint is intentionally lenient: it accepts unauthenticated calls so
// auth.login/auth.logout can still be recorded.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface Body {
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  user_agent?: string | null;
}

function clientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const ua = body.user_agent ?? req.headers.get("user-agent") ?? null;
  const ip = clientIp(req);

  const { error } = await supabaseAdmin.from("activity_logs").insert({
    user_id: body.user_id,
    action: body.action,
    target_type: body.target_type,
    target_id: body.target_id,
    ip,
    user_agent: ua,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
