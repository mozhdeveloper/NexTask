// POST /api/push/send — server-side Web Push delivery.
//
// Body: { userIds: string[]; title: string; body?: string; url?: string; tag?: string }
//
// Auth: requires a logged-in session. Anyone can fire a notification at *themselves*;
// only admin/manager/system roles can target other users.
//
// Configure these env vars (server-only except the public key):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<base64url public key>
//   VAPID_PRIVATE_KEY=<base64url private key>
//   VAPID_SUBJECT=mailto:admin@yourdomain.com

import { NextResponse } from "next/server";
import webpush from "web-push";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@nextask.local";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

interface Body {
  userIds: string[];
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(req: Request) {
  if (!ensureVapid()) {
    return NextResponse.json(
      { error: "VAPID keys not configured on server" },
      { status: 500 },
    );
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload?.title || !Array.isArray(payload.userIds) || payload.userIds.length === 0) {
    return NextResponse.json({ error: "Missing userIds or title" }, { status: 400 });
  }

  // Authn + Authz
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: caller } = await sb
    .from("users")
    .select("id,role")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  const callerRow = caller as { id: string; role: string } | null;
  if (!callerRow) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const isPrivileged = callerRow.role === "admin" || callerRow.role === "manager";
  const onlySelf =
    payload.userIds.length === 1 && payload.userIds[0] === callerRow.id;
  if (!isPrivileged && !onlySelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch subscriptions
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", payload.userIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (subs ?? []) as (SubscriptionRow & { user_id: string })[];
  if (rows.length === 0) return NextResponse.json({ sent: 0, failed: 0 });

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/dashboard",
    tag: payload.tag,
    icon: payload.icon,
    requireInteraction: !!payload.requireInteraction,
  });

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          notificationPayload,
        );
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(row.endpoint);
      }
    }),
  );

  // Garbage-collect dead subscriptions
  if (stale.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  }

  return NextResponse.json({ sent, failed, pruned: stale.length });
}
