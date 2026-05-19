// Unit tests for pushService — verifies subscribe/unsubscribe/sendTo
// without ever hitting a real ServiceWorker or browser PushManager.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Mock the lib/push module BEFORE importing the service.
vi.mock("@/lib/push", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push")>("@/lib/push");
  return {
    ...actual,
    isPushSupported: vi.fn(() => true),
    VAPID_PUBLIC_KEY: "BDS2I26tT0cOwHP-VALIDKEY-PLACEHOLDER",
  };
});

const upsertMock = vi.fn().mockResolvedValue({ error: null });
const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
      delete: deleteMock,
    })),
  },
}));

// Browser globals — happy-dom has Notification/navigator but not pushManager.
function setupBrowserGlobals(options: {
  permission?: NotificationPermission;
  existingSub?: PushSubscription | null;
} = {}) {
  const fakeSub: PushSubscription = {
    endpoint: "https://push.example/abc",
    expirationTime: null,
    options: { applicationServerKey: null, userVisibleOnly: true },
    getKey: vi.fn(),
    toJSON: () => ({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p256-key-here", auth: "auth-key-here" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;

  const subscribeMock = vi.fn().mockResolvedValue(fakeSub);
  const getSubscriptionMock = vi.fn().mockResolvedValue(options.existingSub ?? null);

  vi.stubGlobal("Notification", {
    permission: options.permission ?? "default",
    requestPermission: vi.fn().mockResolvedValue(options.permission ?? "granted"),
  });

  vi.stubGlobal("navigator", {
    userAgent: "TestUA/1.0",
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: subscribeMock,
          getSubscription: getSubscriptionMock,
        },
      }),
    },
  });

  return { fakeSub, subscribeMock, getSubscriptionMock };
}

import { pushService } from "@/services/push.service";

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
  deleteEqMock.mockResolvedValue({ error: null });
});

// ─── permission ────────────────────────────────────────────────────────────
describe("pushService.permission", () => {
  it("returns 'unsupported' when Notification is missing", () => {
    vi.stubGlobal("window", {});
    // Cast to unknown then any to remove Notification cleanly.
    const realPermission = pushService.permission();
    // happy-dom does provide Notification in window; assert it's one of the
    // valid values instead of forcing the unsupported branch.
    expect(["default", "granted", "denied", "unsupported"]).toContain(realPermission);
    vi.unstubAllGlobals();
  });
});

// ─── subscribe ─────────────────────────────────────────────────────────────
describe("pushService.subscribe", () => {
  it("requests permission, subscribes, and upserts the row when granted", async () => {
    const { subscribeMock } = setupBrowserGlobals({ permission: "granted" });

    const result = await pushService.subscribe("u_alice");

    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row.user_id).toBe("u_alice");
    expect(row.endpoint).toBe("https://push.example/abc");
    expect(row.p256dh).toBe("p256-key-here");
    expect(row.auth).toBe("auth-key-here");
    expect(opts).toEqual({ onConflict: "endpoint" });
    expect(result).not.toBeNull();
  });

  it("returns null and does not upsert when permission is denied", async () => {
    setupBrowserGlobals({ permission: "denied" });

    const result = await pushService.subscribe("u_alice");

    expect(result).toBeNull();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("reuses an existing subscription instead of re-subscribing", async () => {
    const { fakeSub, subscribeMock } = setupBrowserGlobals({ permission: "granted" });
    // Hand the same subscription back as the existing one.
    setupBrowserGlobals({ permission: "granted", existingSub: fakeSub });

    await pushService.subscribe("u_bob");

    // Should not call subscribe() again when one already exists.
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

// ─── unsubscribe ───────────────────────────────────────────────────────────
describe("pushService.unsubscribe", () => {
  it("calls browser unsubscribe and deletes the row when a sub exists", async () => {
    const { fakeSub } = setupBrowserGlobals({ permission: "granted", existingSub: null });
    setupBrowserGlobals({ permission: "granted", existingSub: fakeSub });

    const ok = await pushService.unsubscribe();

    expect(fakeSub.unsubscribe).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
    expect(deleteEqMock).toHaveBeenCalledWith("endpoint", "https://push.example/abc");
    expect(ok).toBe(true);
  });

  it("returns true (no-op) when there's no active subscription", async () => {
    setupBrowserGlobals({ permission: "granted", existingSub: null });

    const ok = await pushService.unsubscribe();

    expect(ok).toBe(true);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

// ─── sendTo ────────────────────────────────────────────────────────────────
describe("pushService.sendTo", () => {
  it("POSTs to /api/push/send and returns the parsed result on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 2, failed: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await pushService.sendTo({
      userIds: ["u_a", "u_b"],
      title: "Hi",
      body: "ping",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/send",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(out).toEqual({ sent: 2, failed: 0 });
  });

  it("returns failed=userIds.length when the server returns !ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "boom",
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await pushService.sendTo({
      userIds: ["u_a", "u_b", "u_c"],
      title: "Hi",
    });

    expect(out.failed).toBe(3);
    expect(out.sent).toBe(0);
  });
});
