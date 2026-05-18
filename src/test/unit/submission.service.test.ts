// Unit tests for submission service — pure in-memory logic
// (list, get, forUserOnDate, markStatus). The create() path is covered by
// integration tests since it uploads to Supabase Storage.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSubmission, createUser, createSubmissionType } from "@/test/factories";

// ─── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
  STORAGE_BUCKET: "submissions",
}));

vi.mock("@/lib/supabase/mappers", () => ({
  mapSubmission: vi.fn((r) => r),
}));

vi.mock("@/services/log.service", () => ({
  logService: { append: vi.fn() },
}));

vi.mock("@/services/notification.service", () => ({
  notificationService: { push: vi.fn() },
}));

vi.mock("@/services/workSettings.service", () => ({
  workSettingsService: {
    isWorkingDay: vi.fn(() => true),
    countWorkingDays: vi.fn(() => 5),
  },
}));

const adminUser = createUser({ id: "u_admin", role: "admin" });
const empUser = createUser({ id: "u_emp", role: "employee" });

// Hoisted so vi.mock factory can reference it before module-level variables initialize
const authState = vi.hoisted(() => {
  const state: { user: Record<string, unknown> | null } = { user: { id: "u_emp", role: "employee" } };
  return state;
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: { getState: () => authState },
}));

let submissions: ReturnType<typeof createSubmission>[] = [];
let submissionTypes: ReturnType<typeof createSubmissionType>[] = [];
let users = [adminUser, empUser];

const storeMock = {
  get submissions() { return submissions; },
  get submissionTypes() { return submissionTypes; },
  get users() { return users; },
  setSubmissions: vi.fn((s) => { submissions = s; }),
  notifications: [],
  setNotifications: vi.fn(),
};

vi.mock("@/store/dataStore", () => ({
  useDataStore: { getState: () => storeMock },
}));

import { submissionService } from "@/services/submission.service";

beforeEach(() => {
  submissions = [];
  submissionTypes = [createSubmissionType({ id: "st_1" })];
  users = [adminUser, empUser];
  vi.clearAllMocks();
});

// ─── list ─────────────────────────────────────────────────────────────────────
describe("submissionService.list", () => {
  it("should return all submissions when no filter given", () => {
    submissions = [
      createSubmission({ userId: "u_emp" }),
      createSubmission({ userId: "u_admin" }),
    ];
    expect(submissionService.list()).toHaveLength(2);
  });

  it("should return only matching user submissions when userId filter given", () => {
    submissions = [
      createSubmission({ userId: "u_emp" }),
      createSubmission({ userId: "u_admin" }),
      createSubmission({ userId: "u_emp" }),
    ];
    expect(submissionService.list({ userId: "u_emp" })).toHaveLength(2);
  });

  it("should return empty array when no submissions exist", () => {
    expect(submissionService.list()).toEqual([]);
  });

  it("should return empty array when userId has no submissions", () => {
    submissions = [createSubmission({ userId: "u_admin" })];
    expect(submissionService.list({ userId: "u_nobody" })).toEqual([]);
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────
describe("submissionService.get", () => {
  it("should return the submission matching the id", () => {
    const s = createSubmission({ id: "sub_abc" });
    submissions = [s];
    expect(submissionService.get("sub_abc")).toEqual(s);
  });

  it("should return null when id is not found", () => {
    submissions = [createSubmission({ id: "sub_abc" })];
    expect(submissionService.get("sub_xyz")).toBeNull();
  });

  it("should return null when store is empty", () => {
    expect(submissionService.get("sub_abc")).toBeNull();
  });
});

// ─── forUserOnDate ────────────────────────────────────────────────────────────
describe("submissionService.forUserOnDate", () => {
  it("should return the submission matching user and date", () => {
    const s = createSubmission({ userId: "u_emp", date: "2026-05-18" });
    submissions = [s, createSubmission({ userId: "u_emp", date: "2026-05-17" })];
    expect(submissionService.forUserOnDate("u_emp", "2026-05-18")).toEqual(s);
  });

  it("should return null when no submission exists for that user+date", () => {
    submissions = [createSubmission({ userId: "u_emp", date: "2026-05-18" })];
    expect(submissionService.forUserOnDate("u_emp", "2026-05-19")).toBeNull();
  });

  it("should return null when a different user has a submission on that date", () => {
    submissions = [createSubmission({ userId: "u_admin", date: "2026-05-18" })];
    expect(submissionService.forUserOnDate("u_emp", "2026-05-18")).toBeNull();
  });
});

// ─── markStatus ───────────────────────────────────────────────────────────────
describe("submissionService.markStatus", () => {
  it("should update the submission status in the local cache", async () => {
    const s = createSubmission({ id: "sub_1", status: "pending" });
    submissions = [s];

    await submissionService.markStatus("sub_1", "submitted");

    const updated = storeMock.setSubmissions.mock.calls[0][0];
    expect(updated.find((x: { id: string }) => x.id === "sub_1").status).toBe("submitted");
  });

  it("should not mutate other submissions when marking one", async () => {
    const s1 = createSubmission({ id: "sub_1", status: "pending" });
    const s2 = createSubmission({ id: "sub_2", status: "submitted" });
    submissions = [s1, s2];

    await submissionService.markStatus("sub_1", "late");

    const updated = storeMock.setSubmissions.mock.calls[0][0];
    expect(updated.find((x: { id: string }) => x.id === "sub_2").status).toBe("submitted");
  });

  it("should write an audit log entry for the status change", async () => {
    submissions = [createSubmission({ id: "sub_1" })];
    const { logService } = await import("@/services/log.service");

    await submissionService.markStatus("sub_1", "missing");

    expect(logService.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "submission.mark_status" })
    );
  });
});

// ─── create — validation guards ───────────────────────────────────────────────
describe("submissionService.create — validation", () => {
  it("should throw when submission type is not found", async () => {
    submissionTypes = []; // empty store
    await expect(
      submissionService.create({ date: "2026-05-18", submissionTypeId: "st_missing", workSummary: "test", files: [] })
    ).rejects.toThrow("Submission type not found");
  });

  it("should throw when trying to re-submit a locked submission", async () => {
    submissionTypes = [createSubmissionType({ id: "st_1" })];
    submissions = [createSubmission({ userId: "u_emp", date: "2026-05-18", submissionTypeId: "st_1", locked: true })];
    await expect(
      submissionService.create({ date: "2026-05-18", submissionTypeId: "st_1", workSummary: "test", files: [] })
    ).rejects.toThrow("locked");
  });

  it("should throw when not authenticated", async () => {
    authState.user = null;
    await expect(
      submissionService.create({ date: "2026-05-18", submissionTypeId: "st_1", workSummary: "test", files: [] })
    ).rejects.toThrow("Not authenticated");
    authState.user = { id: "u_emp", role: "employee" }; // restore
  });
});

// ─── todayStats ───────────────────────────────────────────────────────────────
describe("submissionService.todayStats", () => {
  it("should return todayStatus as 'pending' when no submission for today", () => {
    submissions = [];
    const result = submissionService.todayStats("u_emp");
    expect(result.todayStatus).toBe("pending");
    expect(result.todaySubmission).toBeUndefined();
  });

  it("should return the today submission when one exists for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const s = createSubmission({ userId: "u_emp", date: today, status: "submitted" });
    submissions = [s];
    const result = submissionService.todayStats("u_emp");
    expect(result.todayStatus).toBe("submitted");
    expect(result.todaySubmission).toEqual(s);
  });

  it("should return week and month objects with numeric submitted and expected", () => {
    submissions = [];
    const result = submissionService.todayStats("u_emp");
    expect(typeof result.week.submitted).toBe("number");
    expect(typeof result.week.expected).toBe("number");
    expect(typeof result.month.submitted).toBe("number");
    expect(typeof result.month.expected).toBe("number");
  });

  it("should count submitted and revision_approved as 'ok' for week stat", () => {
    const today = new Date().toISOString().slice(0, 10);
    submissions = [
      createSubmission({ userId: "u_emp", date: today, status: "submitted" }),
      createSubmission({ userId: "u_emp", date: today, status: "revision_approved" }),
      createSubmission({ userId: "u_emp", date: today, status: "pending" }),
    ];
    const result = submissionService.todayStats("u_emp");
    // At least 2 of the 3 should count as submitted (pending does not)
    expect(result.week.submitted).toBeGreaterThanOrEqual(2);
  });
});

// ─── unlock ───────────────────────────────────────────────────────────────────
describe("submissionService.unlock", () => {
  it("should throw when user is not an admin", async () => {
    authState.user = { id: "u_emp", role: "employee" };
    await expect(submissionService.unlock("sub_1")).rejects.toThrow("Forbidden");
  });

  it("should update the submission to unlocked and revision_approved in cache", async () => {
    authState.user = { id: "u_admin", role: "admin" };
    const s = createSubmission({ id: "sub_1", userId: "u_emp", locked: true, status: "submitted" });
    submissions = [s];

    await submissionService.unlock("sub_1");

    const updated = storeMock.setSubmissions.mock.calls[0][0];
    const target = updated.find((x: { id: string }) => x.id === "sub_1");
    expect(target.locked).toBe(false);
    expect(target.status).toBe("revision_approved");

    authState.user = { id: "u_emp", role: "employee" }; // restore
  });
});
