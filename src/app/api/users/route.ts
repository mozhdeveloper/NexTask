// POST /api/users — admin-only. Creates a Supabase auth user with the provided
// password, then inserts a matching public.users row and returns the new row.
//
// SECURITY: uses the service_role key on the server only. Verifies caller is
// admin by reading the session cookie and looking up the linked public.users row.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AVATAR_COLORS } from "@/lib/status";

export const runtime = "nodejs";

interface Body {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "manager" | "employee";
  departmentId: string | null;
  jobTitle?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.email || !body?.name || !body?.role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Authn: require a logged-in session
  const sb = createSupabaseServerClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Authz: caller must be admin or manager in public.users
  const { data: caller } = await sb
    .from("users")
    .select("role,is_active,department_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  const callerRole = (caller as { role: string } | null)?.role;
  if (!caller || !["admin", "manager"].includes(callerRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Managers may only create employee accounts within their own department.
  if (callerRole === "manager") {
    if (body.role !== "employee") {
      return NextResponse.json(
        { error: "Managers may only create employee accounts." },
        { status: 403 }
      );
    }
    const callerDept = (caller as { department_id: string | null }).department_id;
    if (body.departmentId && callerDept && body.departmentId !== callerDept) {
      return NextResponse.json(
        { error: "You can only add employees to your own department." },
        { status: 403 }
      );
    }
  }

  const password = body.password?.trim() || "password123";

  // 1. Create auth user (email-confirmed) via admin client
  const created = await supabaseAdmin.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name: body.name },
  });
  if (created.error || !created.data.user) {
    return NextResponse.json(
      { error: created.error?.message ?? "Failed to create auth user" },
      { status: 400 }
    );
  }

  // 2. Insert public.users row linked to the new auth user
  const newId = `u_${created.data.user.id.slice(0, 8)}`;
  const { count } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true });
  const palette = AVATAR_COLORS[(count ?? 0) % AVATAR_COLORS.length];

  const insert = await supabaseAdmin
    .from("users")
    .insert({
      id: newId,
      auth_user_id: created.data.user.id,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      role: body.role,
      department_id: body.departmentId ?? null,
      job_title: body.jobTitle ?? null,
      avatar_color: palette,
      is_active: true,
    })
    .select("*")
    .single();

  if (insert.error) {
    // best-effort rollback of the auth user so we don't leak orphans
    await supabaseAdmin.auth.admin.deleteUser(created.data.user.id).catch(() => {});
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  return NextResponse.json(insert.data, { status: 201 });
}
