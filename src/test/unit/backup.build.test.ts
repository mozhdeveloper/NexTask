// Unit tests for src/lib/backup/build.ts — the shared backup pipeline.
// Mocks supabaseAdmin so no real network calls happen.

import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/supabase/client", () => ({
  STORAGE_BUCKET: "submissions",
  supabase: {},
}));

type AnyRow = Record<string, unknown>;
const state = {
  tables: {} as Record<string, AnyRow[] | { error: string }>,
  downloads: {} as Record<string, Buffer | { error: string }>,
  uploadResult: { error: null as string | null },
  uploadCalls: [] as Array<{ bucket: string; path: string; body: Buffer; contentType?: string }>,
  signedUrl: { url: "https://signed.example/x" as string | null, error: null as string | null },
  lastDownloadBucket: null as string | null,
};

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: vi.fn(async () => {
        const t = state.tables[table];
        if (!t) return { data: [], error: null };
        if ("error" in t) return { data: null, error: { message: t.error } };
        return { data: t, error: null };
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        download: vi.fn(async (path: string) => {
          state.lastDownloadBucket = bucket;
          const v = state.downloads[path];
          if (!v) return { data: null, error: { message: "not found" } };
          if (v instanceof Buffer) {
            const ab = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
            return { data: { arrayBuffer: async () => ab }, error: null };
          }
          return { data: null, error: { message: v.error } };
        }),
        upload: vi.fn(async (path: string, body: Buffer, opts: { contentType?: string }) => {
          state.uploadCalls.push({ bucket, path, body, contentType: opts?.contentType });
          if (state.uploadResult.error) return { data: null, error: { message: state.uploadResult.error } };
          return { data: { path }, error: null };
        }),
        createSignedUrl: vi.fn(async (path: string, _expires: number) => {
          if (state.signedUrl.error) return { data: null, error: { message: state.signedUrl.error } };
          return { data: { signedUrl: `${state.signedUrl.url}?p=${encodeURIComponent(path)}` }, error: null };
        }),
      }),
    },
  },
}));

import { buildBackupZip, downloadBackupZip, signedBackupUrl } from "@/lib/backup/build";

beforeEach(() => {
  state.tables = {
    users: [
      { id: "u1", name: "Alice Smith", email: "alice@x.com", role: "employee", department_id: "d1", job_title: "Engineer" },
      { id: "u2", name: "Bob/Weird*Name", email: "bob@x.com", role: "employee", department_id: "d1", job_title: null },
    ],
    departments: [{ id: "d1", name: "Eng" }],
    submission_types: [
      { id: "t1", name: "Daily Report" },
      { id: "t2", name: "Weekly Summary" },
    ],
    submissions: [
      { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20", work_summary: "Built feature A", tasks_details: "- task 1\n- task 2", status: "submitted", locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-19", work_summary: "Bug fixes",       tasks_details: "fixes",         status: "submitted", locked: false, submitted_at: "2026-05-19T10:00:00Z", version_number: 1 },
      { id: "s3", user_id: "u1", submission_type_id: "t2", date: "2026-05-20", work_summary: "Wrote tests",     tasks_details: "tests",         status: "submitted", locked: false, submitted_at: "2026-05-20T11:00:00Z", version_number: 1 },
    ],
    attachments: [
      { id: "a1", storage_path: "u1/s1/file.pdf", original_name: "report.pdf", submission_id: "s1", size_bytes: 100, mime: "application/pdf" },
      { id: "a2", storage_path: "u2/s2/old.pdf",  original_name: "old.pdf",    submission_id: "s2", size_bytes: 50,  mime: "application/pdf" },
      { id: "a3", storage_path: "u1/s3/img.png",  original_name: "img.png",    submission_id: "s3", size_bytes: 75,  mime: "image/png" },
      { id: "a4", storage_path: null, original_name: "missing.txt", submission_id: "s1", size_bytes: 0, mime: "text/plain" },
    ],
    revisions: [],
    projects: [],
    holidays: [],
    notifications: [],
    activity_logs: [],
    backup_logs: [],
    work_settings: [{ id: true }],
  };
  state.downloads = {
    "u1/s1/file.pdf": Buffer.from("PDF-DATA-1"),
    "u2/s2/old.pdf":  Buffer.from("OLD-PDF"),
    "u1/s3/img.png":  Buffer.from("PNG-DATA-3"),
  };
  state.uploadResult = { error: null };
  state.uploadCalls = [];
  state.signedUrl = { url: "https://signed.example/x", error: null };
  state.lastDownloadBucket = null;
});

describe("buildBackupZip — core pipeline", () => {
  it("snapshots every table, builds a ZIP, uploads to the backups bucket", async () => {
    const result = await buildBackupZip({ triggeredBy: "test" });

    expect(result.fileName).toMatch(/^nextask_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
    expect(result.storagePath).toMatch(/^\d{4}\/\d{2}\/nextask_backup_/);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.rowCounts.users).toBe(2);
    expect(result.rowCounts.submissions).toBe(3);
    expect(result.rowCounts.attachments).toBe(4);

    expect(state.uploadCalls).toHaveLength(1);
    const up = state.uploadCalls[0];
    expect(up.bucket).toBe("backups");
    expect(up.contentType).toBe("application/zip");
    expect(up.path).toBe(result.storagePath);
    expect(up.body.length).toBe(result.sizeBytes);
  });

  it("ZIP contains data.json with every table + meta", async () => {
    await buildBackupZip({ triggeredBy: "manual:admin" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const json = JSON.parse(await zip.file("data.json")!.async("string"));

    expect(json._meta.triggeredBy).toBe("manual:admin");
    expect(json._meta.project).toBe("NexTask");
    expect(json.users).toHaveLength(2);
    expect(json.submissions).toHaveLength(3);
    expect(json.attachments).toHaveLength(4);
  });

  it("organises attachments into employees/<name>/<date>__<type>/ folders with description.json", async () => {
    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });

    expect(result.attachmentCount).toBe(2);
    expect(result.attachmentBytes).toBe(
      Buffer.from("PDF-DATA-1").length + Buffer.from("PNG-DATA-3").length,
    );

    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);

    // Files written 1:1 with original names (sanitized), under per-employee/per-submission folders
    expect(zip.file("employees/Alice_Smith/2026-05-20__Daily_Report/report.pdf")).not.toBeNull();
    expect(zip.file("employees/Alice_Smith/2026-05-20__Weekly_Summary/img.png")).not.toBeNull();

    // description.json present for each filtered submission with task details
    const descRaw = await zip.file("employees/Alice_Smith/2026-05-20__Daily_Report/description.json")!.async("string");
    const desc = JSON.parse(descRaw);
    expect(desc.submissionId).toBe("s1");
    expect(desc.employee.name).toBe("Alice Smith");
    expect(desc.employee.department).toBe("Eng");
    expect(desc.submissionType).toBe("Daily Report");
    expect(desc.taskDescription.workSummary).toBe("Built feature A");
    expect(desc.taskDescription.tasksDetails).toContain("task 1");
    expect(desc.files).toEqual([
      { originalName: "report.pdf", sizeBytes: 100, mime: "application/pdf" },
    ]);

    // Bob's submission is on 2026-05-19 — excluded from the filtered date.
    expect(zip.file("employees/Bob_Weird_Name/2026-05-19__Daily_Report/old.pdf")).toBeNull();
    expect(zip.file("employees/Bob_Weird_Name/2026-05-19__Daily_Report/description.json")).toBeNull();
  });

  it("includes all attachments when attachmentsForDate is omitted", async () => {
    const result = await buildBackupZip();
    expect(result.attachmentCount).toBe(3);
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    // Bob's file should now be present
    expect(zip.file("employees/Bob_Weird_Name/2026-05-19__Daily_Report/old.pdf")).not.toBeNull();
  });

  it("downloads employee files from the submissions bucket, not the backups bucket", async () => {
    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(state.lastDownloadBucket).toBe("submissions");
  });

  it("counts skipped downloads and records them in the manifest", async () => {
    state.downloads["u1/s1/file.pdf"] = { error: "storage 500" };

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentCount).toBe(1);
    expect(result.attachmentBytes).toBe(Buffer.from("PNG-DATA-3").length);

    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const manifest = await zip.file("manifest.txt")!.async("string");
    expect(manifest).toContain("Attachments included:      1");
    expect(manifest).toContain("Attachments skipped:       1");
    expect(manifest).toContain("Triggered by:");
  });

  it("throws (so caller can mark failed) when a table read errors — and never uploads", async () => {
    state.tables.submissions = { error: "permission denied" };
    await expect(buildBackupZip()).rejects.toThrow(/Failed to read submissions/);
    expect(state.uploadCalls).toHaveLength(0);
  });

  it("throws a helpful error when the bucket upload fails", async () => {
    state.uploadResult = { error: "Bucket not found" };
    await expect(buildBackupZip()).rejects.toThrow(
      /Create a private storage bucket named "backups"/,
    );
  });

  it("respects a custom fileName and still stores under YYYY/MM/", async () => {
    const r = await buildBackupZip({ fileName: "custom.zip" });
    expect(r.fileName).toBe("custom.zip");
    expect(r.storagePath).toMatch(/^\d{4}\/\d{2}\/custom\.zip$/);
  });
});

describe("downloadBackupZip", () => {
  it("returns the file buffer when the backup exists in the backups bucket", async () => {
    state.downloads["2026/05/x.zip"] = Buffer.from("ZIP-BYTES");
    const buf = await downloadBackupZip("2026/05/x.zip");
    expect(buf.toString()).toBe("ZIP-BYTES");
    expect(state.lastDownloadBucket).toBe("backups");
  });

  it("throws on missing file", async () => {
    await expect(downloadBackupZip("nope.zip")).rejects.toThrow(/Backup file not found/);
  });
});

describe("signedBackupUrl", () => {
  it("returns the signed URL from supabase", async () => {
    const u = await signedBackupUrl("2026/05/x.zip", 60);
    expect(u).toContain("https://signed.example/x");
    expect(u).toContain("2026%2F05%2Fx.zip");
  });

  it("throws when supabase refuses to sign", async () => {
    state.signedUrl = { url: null, error: "object not found" };
    await expect(signedBackupUrl("missing.zip")).rejects.toThrow(/object not found/);
  });
});
