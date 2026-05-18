// Global test setup — runs before every test file.
import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach } from "vitest";

// ─── Silence console.warn in service code (expected in tests) ─────────────────
const origWarn = console.warn;
beforeEach(() => {
  console.warn = vi.fn();
});
afterEach(() => {
  console.warn = origWarn;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ─── Stub browser-only globals not available in happy-dom ─────────────────────
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
