import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Bypasses RLS. Never import from "use client" files.
if (typeof window !== "undefined") {
  throw new Error("supabase/admin must not be imported in the browser bundle");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error(
    "[supabase/admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

export const supabaseAdmin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});
