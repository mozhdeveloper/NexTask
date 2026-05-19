// POST /api/push/subscribe — upsert a push subscription for the current user.
// Body: { endpoint, p256dh, auth }
//
// Server-side fallback in case clients prefer routing through the API instead of
// writing directly via the Supabase client.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface Body {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.endpoint || !body.p256dh || !body.auth) {
    return NextResponse.json({ error: "Missing keys" }, { status: 400 });
  }

  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await sb
    .from("users")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    {
      user_id: (profile as { id: string }).id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      user_agent: body.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
