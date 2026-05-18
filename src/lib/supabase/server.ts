import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // In route handlers we get a mutable store; in RSC it's read-only.
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* RSC — ignore */
          }
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            /* RSC — ignore */
          }
        },
      },
    }
  );
}
