// Integration tests — run against the LIVE Supabase project using service_role.
// These tests CREATE then CLEAN UP their own isolated data (prefix: it_test_).
// They verify: schema correctness, RPC return shapes, trigger behaviour, view joins,
// and CRUD round-trips. Run separately from unit tests: `vitest run integration`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ─── Direct service-role client (bypasses RLS, safe for testing) ──────────────
const SUPABASE_URL = "https://wydphvbdyyxryxeqdbxk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// When the service-role key is not provided (typical local dev), skip the
// entire integration suite instead of failing the run. CI sets the env var.
const describeIntegration = SERVICE_ROLE_KEY ? describe : describe.skip;

if (!SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[integration] SUPABASE_SERVICE_ROLE_KEY not set — skipping Supabase integration suite."
  );
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || "anon-placeholder");

// ─── Test data registry — collected for cleanup ───────────────────────────────
const cleanup: Record<string, string[]> = {
  notifications: [],
  activity_logs: [],
  submissions: [],
  revisions: [],
  backup_logs: [],
  holidays: [],
  projects: [],
};

function trackCleanup(table: string, id: string) {
  if (!cleanup[table]) cleanup[table] = [];
  cleanup[table].push(id);
}

afterAll(async () => {
  // Delete all test-created rows in safe dependency order
  for (const [table, ids] of Object.entries(cleanup)) {
    if (ids.length === 0) continue;
    await sb.from(table).delete().in("id", ids);
  }
  // holidays keyed by date
  if (cleanup.holidays?.length) {
    await sb.from("holidays").delete().in("date", cleanup.holidays);
  }
});

// ─── 1. TABLE EXISTENCE & ROW COUNTS ─────────────────────────────────────────
describeIntegration("Schema — table existence and seed counts", () => {
  const tables = [
    ["users", 17],
    ["departments", 6],
    ["submission_types", 5],
    ["submissions", 210],
    ["revisions", 8],
    ["backup_logs", 3],
    ["projects", 5],
    ["notifications", 6],
    ["work_settings", 1],
  ] as const;

  for (const [table, expectedMin] of tables) {
    it(`should have at least ${expectedMin} rows in ${table}`, async () => {
      const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
      expect(error).toBeNull();
      expect(count).toBeGreaterThanOrEqual(expectedMin);
    });
  }
});

// ─── 2. ENUM CORRECTNESS ──────────────────────────────────────────────────────
describeIntegration("Schema — submission status enum values", () => {
  const validStatuses = new Set([
    "pending", "submitted", "late", "missing",
    "revision_requested", "revision_approved", "revision_rejected", "locked",
  ]);

  it("should only contain valid status values in submissions table", async () => {
    const { data, error } = await sb.from("submissions").select("status").limit(300);
    expect(error).toBeNull();
    const allValid = (data ?? []).every((r) => validStatuses.has(r.status));
    expect(allValid).toBe(true);
  });
});

// ─── 3. WORK SETTINGS SINGLETON ───────────────────────────────────────────────
describeIntegration("Schema — work_settings singleton", () => {
  it("should have exactly one row", async () => {
    const { count } = await sb.from("work_settings").select("*", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("should have Mon-Fri working days by default", async () => {
    const { data } = await sb.from("work_settings").select("working_days").single();
    expect(data?.working_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("should prevent inserting a second row", async () => {
    // Attempting to insert a second row should fail (trigger or check constraint)
    const { error } = await sb.from("work_settings").insert({ id: true });
    expect(error).not.toBeNull(); // must fail
  });
});

// ─── 4. VIEW: view_submission_with_user ───────────────────────────────────────
describeIntegration("View — view_submission_with_user", () => {
  it("should return rows with user_name populated", async () => {
    const { data, error } = await sb
      .from("view_submission_with_user")
      .select("user_name,department_name,type_name,status,date")
      .limit(5);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    data?.forEach((row) => {
      expect(row.user_name).toBeTruthy();
    });
  });

  it("should include department_name from users.department_id join", async () => {
    const { data } = await sb
      .from("view_submission_with_user")
      .select("department_name")
      .not("department_name", "is", null)
      .limit(1);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("should include type_name from submission_types join", async () => {
    const { data } = await sb
      .from("view_submission_with_user")
      .select("type_name")
      .not("type_name", "is", null)
      .limit(1);
    expect(data?.length).toBeGreaterThan(0);
  });
});

// ─── 5. RPC: rpc_count_working_days ──────────────────────────────────────────
describeIntegration("RPC — rpc_count_working_days", () => {
  it("should return 5 for a Mon-Fri week with no holidays", async () => {
    const { data, error } = await sb.rpc("rpc_count_working_days", {
      p_from: "2026-05-18", // Mon
      p_to: "2026-05-24",   // Sun
    });
    expect(error).toBeNull();
    expect(data).toBe(5);
  });

  it("should return 0 for a weekend-only range", async () => {
    const { data, error } = await sb.rpc("rpc_count_working_days", {
      p_from: "2026-05-23", // Sat
      p_to: "2026-05-24",   // Sun
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it("should return 1 for a single working day", async () => {
    const { data, error } = await sb.rpc("rpc_count_working_days", {
      p_from: "2026-05-18",
      p_to: "2026-05-18",
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
  });

  it("should subtract holidays that fall on working days", async () => {
    // Insert a test holiday on a Monday
    await sb.from("holidays").insert({ date: "2026-05-18", label: "it_test_holiday" });
    cleanup.holidays.push("2026-05-18");

    const { data } = await sb.rpc("rpc_count_working_days", {
      p_from: "2026-05-18",
      p_to: "2026-05-22", // Mon-Fri, but Mon is now a holiday → 4
    });
    expect(data).toBe(4);

    // Cleanup inline so subsequent tests aren't affected
    await sb.from("holidays").delete().eq("date", "2026-05-18");
    cleanup.holidays = cleanup.holidays.filter((d) => d !== "2026-05-18");
  });

  it("should return 10 for two full working weeks", async () => {
    const { data } = await sb.rpc("rpc_count_working_days", {
      p_from: "2026-05-18",
      p_to: "2026-05-29",
    });
    expect(data).toBe(10);
  });
});

// ─── 6. RPC: rpc_today_stats ──────────────────────────────────────────────────
describeIntegration("RPC — rpc_today_stats", () => {
  let adminId: string;

  beforeAll(async () => {
    const { data } = await sb.from("users").select("id").eq("role", "admin").limit(1);
    adminId = data?.[0]?.id ?? "";
  });

  it("should return a result for a valid user_id", async () => {
    const { data, error } = await sb.rpc("rpc_today_stats", { p_user_id: adminId });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("should return the expected jsonb shape: week, month, todayStatus, todaySubmission", async () => {
    const { data } = await sb.rpc("rpc_today_stats", { p_user_id: adminId });
    expect(data).toMatchObject({
      week: expect.objectContaining({ expected: expect.any(Number), submitted: expect.any(Number) }),
      month: expect.objectContaining({ expected: expect.any(Number), submitted: expect.any(Number) }),
      todayStatus: expect.any(String),
    });
  });

  it("should return todayStatus as 'pending' for a user with no submission today", async () => {
    // Use a fake user id that has no submissions
    const { data } = await sb.rpc("rpc_today_stats", { p_user_id: "u_nobody_it_test" });
    // Even for unknown user: should not throw, just return pending
    expect(data?.todayStatus).toBe("pending");
  });
});

// ─── 7. RPC: rpc_unread_notification_count ───────────────────────────────────
describeIntegration("RPC — rpc_unread_notification_count", () => {
  it("should return a non-negative integer for any user", async () => {
    const { data, error } = await sb.rpc("rpc_unread_notification_count", {
      p_user_id: "u_nobody_it",
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data).toBeGreaterThanOrEqual(0);
  });

  it("should return correct count for a user we seed with notifications", async () => {
    const { data: users } = await sb.from("users").select("id").limit(1);
    const uid = users?.[0]?.id ?? "u_test_tmp";
    const ntfIds: string[] = [];

    // Insert 2 unread, 1 read
    for (let i = 0; i < 2; i++) {
      const id = `it_ntf_${i}_${Date.now()}`;
      await sb.from("notifications").insert({ id, user_id: uid, type: "info", title: "t", body: "b", read: false });
      ntfIds.push(id);
      trackCleanup("notifications", id);
    }
    const readId = `it_ntf_read_${Date.now()}`;
    await sb.from("notifications").insert({ id: readId, user_id: uid, type: "info", title: "t", body: "b", read: true });
    trackCleanup("notifications", readId);
    ntfIds.push(readId);

    const { data: count } = await sb.rpc("rpc_unread_notification_count", { p_user_id: uid });
    // At least 2 (the ones we just inserted); the user may have had pre-existing unread ones
    expect(count).toBeGreaterThanOrEqual(2);

    // Cleanup
    await sb.from("notifications").delete().in("id", ntfIds);
  });
});

// ─── 8. TRIGGER: trim_activity_logs (keeps ≤ 1000) ───────────────────────────
describeIntegration("Trigger — trim_activity_logs should cap logs at 1000", () => {
  it("should have at most 1000 rows after bulk insert", async () => {
    // Get current count; if already close to 1000 this test is a no-op
    const { count: before } = await sb
      .from("activity_logs")
      .select("*", { count: "exact", head: true });

    if ((before ?? 0) < 990) {
      // Insert enough rows to approach the limit (only if safe)
      const batch = Array.from({ length: 5 }, (_, i) => ({
        id: `it_log_${i}_${Date.now()}`,
        user_id: null,
        action: `it_test.bulk_${i}`,
        target_type: "test",
      }));
      await sb.from("activity_logs").insert(batch);
      batch.forEach((r) => trackCleanup("activity_logs", r.id));
    }

    const { count: after } = await sb
      .from("activity_logs")
      .select("*", { count: "exact", head: true });
    expect(after).toBeLessThanOrEqual(1000);
  });
});

// ─── 9. TRIGGER: updated_at on work_settings ──────────────────────────────────
describeIntegration("Trigger — updated_at should auto-update on work_settings change", () => {
  it("should update the updated_at timestamp on any modification", async () => {
    const { data: before } = await sb.from("work_settings").select("updated_at").single();
    const tsBefore = before?.updated_at;

    // Wait 1 second so timestamp is clearly different
    await new Promise((r) => setTimeout(r, 1100));

    await sb.from("work_settings").update({ auto_backup_email: "test@test.com" }).eq("id", true);
    const { data: after } = await sb.from("work_settings").select("updated_at").single();

    // Restore
    await sb.from("work_settings").update({ auto_backup_email: "" }).eq("id", true);

    expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(new Date(tsBefore).getTime());
  });
});

// ─── 10. CRUD ROUND-TRIP: notifications ───────────────────────────────────────
describeIntegration("CRUD — notifications round-trip", () => {
  it("should insert, read, update (mark read), then delete a notification", async () => {
    const { data: users } = await sb.from("users").select("id").limit(1);
    const uid = users?.[0]?.id ?? "u_test";
    const id = `it_ntf_crud_${Date.now()}`;

    // INSERT
    const { error: insertErr } = await sb.from("notifications").insert({
      id,
      user_id: uid,
      type: "info",
      title: "Integration test notification",
      body: "Test body",
      read: false,
    });
    expect(insertErr).toBeNull();
    trackCleanup("notifications", id);

    // READ
    const { data: row } = await sb.from("notifications").select("*").eq("id", id).single();
    expect(row?.title).toBe("Integration test notification");
    expect(row?.read).toBe(false);

    // UPDATE
    await sb.from("notifications").update({ read: true }).eq("id", id);
    const { data: updated } = await sb.from("notifications").select("read").eq("id", id).single();
    expect(updated?.read).toBe(true);

    // DELETE
    const { error: delErr } = await sb.from("notifications").delete().eq("id", id);
    expect(delErr).toBeNull();
    cleanup.notifications = cleanup.notifications.filter((x) => x !== id);

    // VERIFY GONE
    const { data: gone } = await sb.from("notifications").select("*").eq("id", id).maybeSingle();
    expect(gone).toBeNull();
  });
});

// ─── 11. STORAGE BUCKET ───────────────────────────────────────────────────────
describeIntegration("Storage — submissions bucket", () => {
  it("should have a private bucket named 'submissions'", async () => {
    const { data: buckets } = await sb.storage.listBuckets();
    const bucket = buckets?.find((b) => b.id === "submissions");
    expect(bucket).toBeDefined();
    expect(bucket?.public).toBe(false);
  });
});

// ─── 12. USER ROLES ───────────────────────────────────────────────────────────
describeIntegration("Schema — user roles", () => {
  it("should have at least 1 admin user", async () => {
    const { count } = await sb.from("users").select("*", { count: "exact", head: true }).eq("role", "admin");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("should have the demo users with correct emails", async () => {
    const { data } = await sb
      .from("users")
      .select("email,role")
      .in("email", ["admin@nexvision.local", "manager@nexvision.local", "employee@nexvision.local"]);
    expect(data).toHaveLength(3);
    const roles = data?.map((u) => u.role).sort();
    expect(roles).toEqual(["admin", "employee", "manager"]);
  });

  it("should not have duplicate emails", async () => {
    const { data } = await sb.from("users").select("email");
    const emails = data?.map((u) => u.email) ?? [];
    const unique = new Set(emails);
    expect(unique.size).toBe(emails.length);
  });
});

// ─── 13. FOREIGN KEY INTEGRITY ────────────────────────────────────────────────
describeIntegration("Foreign key integrity", () => {
  it("all submission user_ids should reference existing users", async () => {
    const { data: userIds } = await sb.from("users").select("id");
    const { data: subs } = await sb.from("submissions").select("user_id").limit(300);
    const validIds = new Set(userIds?.map((u) => u.id));
    const orphaned = subs?.filter((s) => !validIds.has(s.user_id)) ?? [];
    expect(orphaned).toHaveLength(0);
  });

  it("all revision submission_ids should reference existing submissions", async () => {
    const { data: subIds } = await sb.from("submissions").select("id").limit(500);
    const { data: revisions } = await sb.from("revisions").select("submission_id");
    const validIds = new Set(subIds?.map((s) => s.id));
    const orphaned = revisions?.filter((r) => !validIds.has(r.submission_id)) ?? [];
    expect(orphaned).toHaveLength(0);
  });
});

// ─── 14. ACTIVITY LOG AUDIT COMPLETENESS ─────────────────────────────────────
describeIntegration("Activity logs — audit trail", () => {
  it("should accept log entries with all required fields", async () => {
    const id = `it_log_audit_${Date.now()}`;
    const { error } = await sb.from("activity_logs").insert({
      id,
      user_id: null,
      action: "it_test.audit_check",
      target_type: "test",
      target_id: null,
    });
    expect(error).toBeNull();
    trackCleanup("activity_logs", id);
  });

  it("should allow querying logs by action prefix for admin audit page", async () => {
    const { data, error } = await sb
      .from("activity_logs")
      .select("id,action,created_at")
      .like("action", "auth.%")
      .limit(10);
    expect(error).toBeNull();
    // May be empty if no auth logs, but should not error
    expect(Array.isArray(data)).toBe(true);
  });

  it("should allow querying logs sorted newest-first", async () => {
    const { data, error } = await sb
      .from("activity_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    expect(error).toBeNull();
    if (data && data.length > 1) {
      const timestamps = data.map((r) => new Date(r.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    }
  });
});
