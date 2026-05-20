// Run: node scripts/add-permissions-column.mjs
// Adds `permissions JSONB` column to work_settings and sets the initial value
// from DEFAULT_PERMISSIONS.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZHBodmJkeXl4cnl4ZXFkYnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MTEyNCwiZXhwIjoyMDk0NjE3MTI0fQ.Ix9PaviqX7rMlIEu2mIg1jwpZmuL5fT2iFz6e9cyzuY";

const ALL_PERMISSION_KEYS = [
  "submit_work","view_own","request_revision","view_all_subs","override_status",
  "unlock_submission","approve_revisions","send_reminders","manage_employees",
  "view_employee_details","manage_projects","view_projects","run_backups",
  "view_logs","manage_settings","manage_permissions","reset_data",
];

const DEFAULT_PERMISSIONS = {
  admin: ALL_PERMISSION_KEYS,
  manager: [
    "submit_work","view_own","request_revision","view_all_subs","override_status",
    "unlock_submission","approve_revisions","send_reminders","view_employee_details","view_projects",
  ],
  employee: ["submit_work","view_own","request_revision","view_projects"],
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("Step 1: Checking if permissions column exists...");

  // Try reading the column — if it throws "column does not exist" we need to add it
  const { data, error } = await supabase
    .from("work_settings")
    .select("permissions")
    .eq("id", true)
    .maybeSingle();

  if (error && error.message.includes("column")) {
    console.log("  Column does not exist — need to add via Management API");
    console.log("  ⚠️  Cannot add column via REST API — use Supabase Dashboard SQL editor:");
    console.log();
    console.log("  ALTER TABLE public.work_settings");
    console.log("    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;");
    console.log();
    console.log("  Then re-run this script to seed the default permissions.");
    return;
  }

  if (error) {
    console.error("Unexpected error:", error);
    return;
  }

  console.log("  Current permissions value:", data?.permissions);

  if (!data?.permissions || Object.keys(data.permissions).length === 0) {
    console.log("Step 2: Seeding default permissions into work_settings...");
    const { error: updateErr } = await supabase
      .from("work_settings")
      .update({ permissions: DEFAULT_PERMISSIONS })
      .eq("id", true);

    if (updateErr) {
      console.error("  Failed to seed permissions:", updateErr);
      return;
    }
    console.log("  ✅ Default permissions saved to work_settings.permissions");
  } else {
    console.log("  ✅ Permissions already set:", JSON.stringify(data.permissions).slice(0, 80) + "...");
  }

  console.log();
  console.log("Done.");
}

main().catch(console.error);
