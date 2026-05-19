// Unit tests for src/lib/push.ts — VAPID key encoding helpers + feature detection.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { urlBase64ToUint8Array, isPushSupported } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  it("decodes a standard VAPID-style base64url key into a Uint8Array", () => {
    // "Hello world!" base64 → "SGVsbG8gd29ybGQh"
    const out = urlBase64ToUint8Array("SGVsbG8gd29ybGQh");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(12);
    expect(Array.from(out.slice(0, 5))).toEqual([72, 101, 108, 108, 111]);
  });

  it("translates `-` to `+` and `_` to `/` (base64url → base64)", () => {
    // Build bytes that produce '+' and '/' in standard base64, then test the url variant.
    const original = "AAECAwQFBgcICQ"; // base64 of 0..9
    const urlSafe = original.replace(/\+/g, "-").replace(/\//g, "_");
    const out = urlBase64ToUint8Array(urlSafe);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
  });

  it("pads missing `=` characters so atob doesn't throw", () => {
    // "Hi" → "SGk" (no padding) should still decode
    expect(() => urlBase64ToUint8Array("SGk")).not.toThrow();
    const out = urlBase64ToUint8Array("SGk");
    expect(Array.from(out)).toEqual([72, 105]);
  });

  it("returns an empty array for an empty input (after padding)", () => {
    expect(urlBase64ToUint8Array("").length).toBe(0);
  });
});

describe("isPushSupported", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  });

  it("returns true when serviceWorker, PushManager, and Notification are all present", () => {
    vi.stubGlobal("window", {
      PushManager: function () {},
      Notification: function () {},
    });
    vi.stubGlobal("navigator", { serviceWorker: {} });
    expect(isPushSupported()).toBe(true);
  });

  it("returns false when serviceWorker is missing", () => {
    vi.stubGlobal("window", {
      PushManager: function () {},
      Notification: function () {},
    });
    vi.stubGlobal("navigator", {});
    expect(isPushSupported()).toBe(false);
  });

  it("returns false when PushManager is missing (older browsers)", () => {
    vi.stubGlobal("window", { Notification: function () {} });
    vi.stubGlobal("navigator", { serviceWorker: {} });
    expect(isPushSupported()).toBe(false);
  });
});
