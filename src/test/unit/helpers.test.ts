// Unit tests for src/lib/helpers.ts
// Tests pure functions — no I/O, no mocks needed.

import { describe, it, expect } from "vitest";
import { uid, hashStub, pseudoIp, toCsv, buildSubmissionPath, backupFileName, userAgent } from "@/lib/helpers";

// ─── uid ─────────────────────────────────────────────────────────────────────
describe("uid", () => {
  it("should return a string prefixed with the given prefix", () => {
    const id = uid("sub");
    expect(id.startsWith("sub_")).toBe(true);
  });

  it("should return a string prefixed with 'id' by default", () => {
    const id = uid();
    expect(id.startsWith("id_")).toBe(true);
  });

  it("should return unique values on successive calls", () => {
    const ids = Array.from({ length: 50 }, () => uid("x"));
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });

  it("should return a non-empty string", () => {
    expect(uid("test").length).toBeGreaterThan(4);
  });
});

// ─── hashStub ─────────────────────────────────────────────────────────────────
describe("hashStub", () => {
  it("should return an 8-character hex string", () => {
    expect(hashStub("hello")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("should be deterministic for the same input", () => {
    expect(hashStub("test123")).toBe(hashStub("test123"));
  });

  it("should produce different hashes for different inputs", () => {
    expect(hashStub("foo")).not.toBe(hashStub("bar"));
  });

  it("should handle empty string without throwing", () => {
    expect(() => hashStub("")).not.toThrow();
    expect(hashStub("")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("should handle unicode input", () => {
    expect(() => hashStub("日本語テスト")).not.toThrow();
  });
});

// ─── pseudoIp ─────────────────────────────────────────────────────────────────
describe("pseudoIp", () => {
  it("should return a string in 192.168.x.x format", () => {
    const ip = pseudoIp("user123");
    expect(ip).toMatch(/^192\.168\.\d{1,3}\.\d{1,3}$/);
  });

  it("should be deterministic for the same seed", () => {
    expect(pseudoIp("u_admin")).toBe(pseudoIp("u_admin"));
  });

  it("should return different IPs for different seeds", () => {
    expect(pseudoIp("user_a")).not.toBe(pseudoIp("user_b"));
  });

  it("should produce octets in the valid range 0-253", () => {
    const ip = pseudoIp("seedvalue");
    const parts = ip.split(".").map(Number);
    expect(parts[2]).toBeGreaterThanOrEqual(0);
    expect(parts[2]).toBeLessThanOrEqual(253);
    expect(parts[3]).toBeGreaterThanOrEqual(0);
    expect(parts[3]).toBeLessThanOrEqual(253);
  });
});

// ─── toCsv ────────────────────────────────────────────────────────────────────
describe("toCsv", () => {
  it("should return empty string for empty array", () => {
    expect(toCsv([])).toBe("");
  });

  it("should produce a header row followed by data rows", () => {
    const rows = [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }];
    const csv = toCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("Alice,30");
    expect(lines[2]).toBe("Bob,25");
  });

  it("should quote values containing commas", () => {
    const rows = [{ note: "Hello, world" }];
    expect(toCsv(rows)).toContain('"Hello, world"');
  });

  it("should quote values containing double quotes and escape them", () => {
    const rows = [{ note: 'Say "hello"' }];
    const csv = toCsv(rows);
    expect(csv).toContain('"Say ""hello"""');
  });

  it("should treat null/undefined as empty string", () => {
    const rows = [{ a: null, b: undefined }];
    const csv = toCsv(rows);
    expect(csv).toBe("a,b\n,");
  });

  it("should quote values containing newlines", () => {
    const rows = [{ text: "line1\nline2" }];
    expect(toCsv(rows)).toContain('"line1\nline2"');
  });
});

// ─── buildSubmissionPath ──────────────────────────────────────────────────────
describe("buildSubmissionPath", () => {
  it("should return a path starting with 'employees/'", () => {
    const path = buildSubmissionPath({
      username: "john",
      date: "2026-05-18",
      fileName: "report.pdf",
      submittedAt: "2026-05-18T14:00:00.000Z",
    });
    expect(path.startsWith("employees/john/")).toBe(true);
  });

  it("should embed the year in the path", () => {
    const path = buildSubmissionPath({
      username: "john",
      date: "2026-05-18",
      fileName: "report.pdf",
      submittedAt: "2026-05-18T14:00:00.000Z",
    });
    expect(path).toContain("/2026/");
  });

  it("should include a month label like '05-May'", () => {
    const path = buildSubmissionPath({
      username: "jane",
      date: "2026-05-18",
      fileName: "doc.docx",
      submittedAt: "2026-05-18T09:00:00.000Z",
    });
    expect(path).toContain("05-May");
  });

  it("should include the day segment", () => {
    const path = buildSubmissionPath({
      username: "jane",
      date: "2026-05-18",
      fileName: "doc.docx",
      submittedAt: "2026-05-18T09:00:00.000Z",
    });
    expect(path).toContain("/18/");
  });

  it("should include the filename in the path", () => {
    const path = buildSubmissionPath({
      username: "mike",
      date: "2026-12-01",
      fileName: "myfile.pdf",
      submittedAt: "2026-12-01T10:00:00.000Z",
    });
    expect(path).toContain("myfile.pdf");
  });
});

// ─── backupFileName ───────────────────────────────────────────────────────────
describe("backupFileName", () => {
  it("should return a string starting with 'office_uploads_backup_'", () => {
    expect(backupFileName().startsWith("office_uploads_backup_")).toBe(true);
  });

  it("should return a string ending in '.zip'", () => {
    expect(backupFileName().endsWith(".zip")).toBe(true);
  });

  it("should include the year from the provided date", () => {
    const d = new Date("2026-06-15T10:30:00.000Z");
    expect(backupFileName(d)).toContain("2026");
  });

  it("should not contain colons or dots in the timestamp segment", () => {
    const name = backupFileName(new Date("2026-06-15T10:30:00.000Z"));
    const ts = name.replace("office_uploads_backup_", "").replace(".zip", "");
    expect(ts).not.toContain(":");
    expect(ts).not.toContain(".");
  });
});

// ─── userAgent ────────────────────────────────────────────────────────────────
describe("userAgent", () => {
  it("should return a string", () => {
    expect(typeof userAgent()).toBe("string");
  });

  it("should return 'node' when navigator is not defined", () => {
    // In happy-dom navigator is defined but this checks the fallback branch manually
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
    expect(userAgent()).toBe("node");
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  });
});
