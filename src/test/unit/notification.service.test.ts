// Unit tests for notification service.
// Validates optimistic cache updates, ordering, read-state management, and unread counts.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock supabase ────────────────────────────────────────────────────────────
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ─── Controlled notification store ───────────────────────────────────────────
let notifications: import("@/types").Notification[] = [];

const storeMock = {
  get notifications() { return notifications; },
  setNotifications: vi.fn((n) => { notifications = n; }),
};

vi.mock("@/store/dataStore", () => ({
  useDataStore: { getState: () => storeMock },
}));

import { notificationService } from "@/services/notification.service";
import { createNotification } from "@/test/factories";

beforeEach(() => {
  notifications = [];
  vi.clearAllMocks();

  // Default mock: supabase calls succeed but are fire-and-forget
  mockFrom.mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue({ error: null }),
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────
describe("notificationService.list", () => {
  it("should return only notifications for the given user", () => {
    notifications = [
      createNotification({ userId: "u_alice" }),
      createNotification({ userId: "u_bob" }),
      createNotification({ userId: "u_alice" }),
    ];
    expect(notificationService.list("u_alice")).toHaveLength(2);
    expect(notificationService.list("u_bob")).toHaveLength(1);
  });

  it("should return an empty array when user has no notifications", () => {
    notifications = [createNotification({ userId: "u_alice" })];
    expect(notificationService.list("u_nobody")).toEqual([]);
  });

  it("should return notifications sorted by createdAt descending (newest first)", () => {
    notifications = [
      createNotification({ userId: "u_alice", createdAt: "2026-05-18T10:00:00Z" }),
      createNotification({ userId: "u_alice", createdAt: "2026-05-18T12:00:00Z" }),
      createNotification({ userId: "u_alice", createdAt: "2026-05-18T08:00:00Z" }),
    ];
    const result = notificationService.list("u_alice");
    expect(result[0].createdAt).toBe("2026-05-18T12:00:00Z");
    expect(result[2].createdAt).toBe("2026-05-18T08:00:00Z");
  });
});

// ─── unreadCount ──────────────────────────────────────────────────────────────
describe("notificationService.unreadCount", () => {
  it("should return 0 when user has no notifications", () => {
    expect(notificationService.unreadCount("u_nobody")).toBe(0);
  });

  it("should count only unread notifications", () => {
    notifications = [
      createNotification({ userId: "u_alice", read: false }),
      createNotification({ userId: "u_alice", read: true }),
      createNotification({ userId: "u_alice", read: false }),
    ];
    expect(notificationService.unreadCount("u_alice")).toBe(2);
  });

  it("should return 0 when all notifications are read", () => {
    notifications = [
      createNotification({ userId: "u_alice", read: true }),
      createNotification({ userId: "u_alice", read: true }),
    ];
    expect(notificationService.unreadCount("u_alice")).toBe(0);
  });
});

// ─── push ─────────────────────────────────────────────────────────────────────
describe("notificationService.push", () => {
  it("should prepend the notification to the cache", () => {
    const existing = createNotification({ userId: "u_alice" });
    notifications = [existing];

    notificationService.push({
      userId: "u_alice",
      type: "success",
      title: "New",
      body: "Test body",
    });

    const updated = storeMock.setNotifications.mock.calls[0][0];
    expect(updated[0].title).toBe("New"); // newest first
    expect(updated).toHaveLength(2);
  });

  it("should assign an id and createdAt to the new notification", () => {
    notificationService.push({ userId: "u_alice", type: "info", title: "Hi", body: "World" });
    const created = storeMock.setNotifications.mock.calls[0][0][0];
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
  });

  it("should set read to false on the new notification", () => {
    notificationService.push({ userId: "u_alice", type: "info", title: "Hi", body: "World" });
    const created = storeMock.setNotifications.mock.calls[0][0][0];
    expect(created.read).toBe(false);
  });

  it("should return the created notification", () => {
    const result = notificationService.push({ userId: "u_alice", type: "warning", title: "Warn", body: "!" });
    expect(result.type).toBe("warning");
    expect(result.title).toBe("Warn");
  });
});

// ─── markRead ─────────────────────────────────────────────────────────────────
describe("notificationService.markRead", () => {
  it("should flip read to true for the target notification only", () => {
    const n1 = createNotification({ userId: "u_alice", read: false });
    const n2 = createNotification({ userId: "u_alice", read: false });
    notifications = [n1, n2];

    notificationService.markRead(n1.id);

    const updated = storeMock.setNotifications.mock.calls[0][0];
    const target = updated.find((n: { id: string }) => n.id === n1.id);
    const other = updated.find((n: { id: string }) => n.id === n2.id);
    expect(target.read).toBe(true);
    expect(other.read).toBe(false); // not changed
  });
});

// ─── markAllRead ──────────────────────────────────────────────────────────────
describe("notificationService.markAllRead", () => {
  it("should mark all unread notifications for a user as read", () => {
    notifications = [
      createNotification({ userId: "u_alice", read: false }),
      createNotification({ userId: "u_alice", read: false }),
      createNotification({ userId: "u_bob", read: false }), // different user
    ];

    notificationService.markAllRead("u_alice");

    const updated = storeMock.setNotifications.mock.calls[0][0];
    const aliceNotifs = updated.filter((n: { userId: string }) => n.userId === "u_alice");
    const bobNotifs = updated.filter((n: { userId: string }) => n.userId === "u_bob");

    expect(aliceNotifs.every((n: { read: boolean }) => n.read)).toBe(true);
    expect(bobNotifs[0].read).toBe(false); // other user unchanged
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────
describe("notificationService.clear", () => {
  it("should remove all notifications for the specified user", () => {
    notifications = [
      createNotification({ userId: "u_alice" }),
      createNotification({ userId: "u_alice" }),
      createNotification({ userId: "u_bob" }),
    ];

    notificationService.clear("u_alice");

    const updated = storeMock.setNotifications.mock.calls[0][0];
    expect(updated.filter((n: { userId: string }) => n.userId === "u_alice")).toHaveLength(0);
    expect(updated.filter((n: { userId: string }) => n.userId === "u_bob")).toHaveLength(1);
  });

  it("should not throw when user has no notifications", () => {
    notifications = [];
    expect(() => notificationService.clear("u_nobody")).not.toThrow();
  });
});
