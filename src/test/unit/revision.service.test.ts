// Unit tests for revisionService — request/approve/reject flows
// including verification that the correct users get notified.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSubmission, createUser, createRevision } from "@/test/factories";

// ─── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

vi.mock("@/lib/supabase/mappers", () => ({
  mapRevision: vi.fn((r) => r),
}));

vi.mock("@/services/log.service", () => ({
  logService: { append: vi.fn() },
}));

const notifyPush = vi.fn();
vi.mock("@/services/notification.service", () => ({
  notificationService: { push: (...a: unknown[]) => notifyPush(...a) },
}));

// ─── Auth (hoisted, mutable across tests) ──────────────────────────────────
const authState = vi.hoisted(() => {
  const s: { user: Record<string, unknown> | null } = {
    user: { id: "u_emp", name: "Emp", role: "employee" },
  };
  return s;
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: { getState: () => authState },
}));

// ─── Data store ────────────────────────────────────────────────────────────
const admin = createUser({ id: "u_admin", role: "admin", name: "Admin One" });
const admin2 = createUser({ id: "u_admin2", role: "admin", name: "Admin Two" });
const manager = createUser({ id: "u_mgr", role: "manager", name: "Manager" });
const employee = createUser({ id: "u_emp", role: "employee", name: "Emp" });

let revisions: ReturnType<typeof createRevision>[] = [];
let submissions: ReturnType<typeof createSubmission>[] = [];
let users = [admin, admin2, manager, employee];

const storeMock = {
  get revisions() { return revisions; },
  get submissions() { return submissions; },
  get users() { return users; },
  setRevisions: vi.fn((r) => { revisions = r; }),
  setSubmissions: vi.fn((s) => { submissions = s; }),
};

vi.mock("@/store/dataStore", () => ({
  useDataStore: { getState: () => storeMock },
}));

import { revisionService } from "@/services/revision.service";

beforeEach(() => {
  revisions = [];
  submissions = [
    createSubmission({ id: "sub_1", userId: "u_emp", date: "2026-05-18", status: "submitted" }),
  ];
  users = [admin, admin2, manager, employee];
  authState.user = { id: "u_emp", name: "Emp", role: "employee" };
  vi.clearAllMocks();
});

// ─── request ───────────────────────────────────────────────────────────────
describe("revisionService.request", () => {
  it("creates a revision and marks the submission as revision_requested", async () => {
    await revisionService.request("sub_1", "Please reopen");
    expect(storeMock.setRevisions).toHaveBeenCalled();
    expect(revisions[0].submissionId).toBe("sub_1");
    expect(revisions[0].status).toBe("pending");
    expect(submissions.find((s) => s.id === "sub_1")?.status).toBe("revision_requested");
  });

  it("notifies every admin (and only admins) about the request", async () => {
    await revisionService.request("sub_1", "Need to fix attachment");
    const targets = notifyPush.mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect(targets).toContain("u_admin");
    expect(targets).toContain("u_admin2");
    expect(targets).not.toContain("u_mgr");
    expect(targets).not.toContain("u_emp");
  });

  it("throws when the user is not authenticated", async () => {
    authState.user = null;
    await expect(revisionService.request("sub_1", "x")).rejects.toThrow(/Not authenticated/);
  });

  it("throws when the submission doesn't exist", async () => {
    await expect(revisionService.request("nope", "x")).rejects.toThrow(/not found/i);
  });
});

// ─── approve ───────────────────────────────────────────────────────────────
describe("revisionService.approve", () => {
  beforeEach(() => {
    revisions = [createRevision({ id: "rev_1", submissionId: "sub_1", userId: "u_emp" })];
    authState.user = { id: "u_admin", name: "Admin One", role: "admin" };
  });

  it("flips the revision to approved and unlocks the submission", async () => {
    await revisionService.approve("rev_1", "Looks good");
    const r = revisions.find((x) => x.id === "rev_1")!;
    expect(r.status).toBe("approved");
    const s = submissions.find((x) => x.id === "sub_1")!;
    expect(s.locked).toBe(false);
    expect(s.status).toBe("revision_approved");
  });

  it("notifies the submission owner", async () => {
    await revisionService.approve("rev_1");
    expect(notifyPush).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u_emp", type: "success" }),
    );
  });

  it("forbids employees from approving", async () => {
    authState.user = { id: "u_emp", name: "Emp", role: "employee" };
    await expect(revisionService.approve("rev_1")).rejects.toThrow(/Forbidden/);
  });

  it("allows managers to approve", async () => {
    authState.user = { id: "u_mgr", name: "Manager", role: "manager", departmentId: "dept_dev" };
    await expect(revisionService.approve("rev_1")).resolves.not.toThrow();
  });

  it("forbids managers from approving revisions outside their department", async () => {
    authState.user = { id: "u_mgr", name: "Manager", role: "manager", departmentId: "dept_other" };
    await expect(revisionService.approve("rev_1")).rejects.toThrow(/own department/);
  });
});

// ─── reject ────────────────────────────────────────────────────────────────
describe("revisionService.reject", () => {
  beforeEach(() => {
    revisions = [createRevision({ id: "rev_1", submissionId: "sub_1", userId: "u_emp" })];
    authState.user = { id: "u_admin", name: "Admin One", role: "admin" };
  });

  it("flips the revision to rejected and the submission to revision_rejected", async () => {
    await revisionService.reject("rev_1", "Not needed");
    const r = revisions.find((x) => x.id === "rev_1")!;
    expect(r.status).toBe("rejected");
    const s = submissions.find((x) => x.id === "sub_1")!;
    expect(s.status).toBe("revision_rejected");
  });

  it("notifies the submission owner with the rejection note as body", async () => {
    await revisionService.reject("rev_1", "Submission was correct");
    expect(notifyPush).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u_emp",
        type: "danger",
        body: "Submission was correct",
      }),
    );
  });

  it("forbids employees from rejecting", async () => {
    authState.user = { id: "u_emp", name: "Emp", role: "employee" };
    await expect(revisionService.reject("rev_1", "no")).rejects.toThrow(/Forbidden/);
  });

  it("forbids managers from rejecting revisions outside their department", async () => {
    authState.user = { id: "u_mgr", name: "Manager", role: "manager", departmentId: "dept_other" };
    await expect(revisionService.reject("rev_1", "no")).rejects.toThrow(/own department/);
  });
});
