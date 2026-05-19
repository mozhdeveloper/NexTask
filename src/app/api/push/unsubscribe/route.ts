// DELETE /api/push/unsubscribe — remove a push subscription by endpoint.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Resolve the caller's public user id so the delete is scoped to their own subscriptions only.
  const { data: profile } = await sb
    .from("users")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("user_id", (profile as { id: string }).id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
