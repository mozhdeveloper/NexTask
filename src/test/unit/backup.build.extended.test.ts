// ─────────────────────────────────────────────────────────────────────────────
// Principal QA — buildBackupZip() extended test suite
//
// Complements backup.build.test.ts (core pipeline) with:
//   • All supported attachment file types (PDF, DOCX, XLSX, PNG, JPG, JPEG, CSV)
//   • Submissions with NO attachments (description.json still created)
//   • Employee name sanitization (spaces, slashes, asterisks, hyphens)
//   • Date-filter fallback behaviour (no matches → all + manifest note + README.txt)
//   • Multiple employees on the same date (each gets own folder)
//   • Multiple submission types per employee (separate subfolders)
//   • Batch downloads: >6 attachments (exercises the BATCH=6 concurrency window)
//   • Manifest format completeness (all required fields present)
//   • data.json completeness (all 12 tables snapshotted)
//   • Collision deduplication (two attachments with same original name in one submission)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/supabase/client", () => ({
  STORAGE_BUCKET: "submissions",
  supabase: {},
}));

// ─── Shared controllable state (vi.hoisted so vi.mock factory can see it) ────

type AnyRow = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables:           {} as Record<string, AnyRow[] | { error: string }>,
  downloads:        {} as Record<string, Buffer | { error: string }>,
  uploadResult:     { error: null as string | null },
  uploadCalls:      [] as Array<{ bucket: string; path: string; body: Buffer }>,
  lastDownloadBucket: null as string | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: vi.fn(async () => {
        const t = state.tables[table];
        if (!t) return { data: [], error: null };
        if ("error" in t) return { data: null, error: { message: (t as { error: string }).error } };
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
          return { data: null, error: { message: (v as { error: string }).error } };
        }),
        upload: vi.fn(async (path: string, body: Buffer) => {
          state.uploadCalls.push({ bucket, path, body });
          if (state.uploadResult.error)
            return { data: null, error: { message: state.uploadResult.error } };
          return { data: { path }, error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://signed.example/?p=${encodeURIComponent(path)}` },
          error: null,
        })),
      }),
    },
  },
}));

import { buildBackupZip } from "@/lib/backup/build";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal but valid tables state. Call with overrides to adjust specific tables. */
function buildTables(overrides: Partial<typeof state.tables> = {}): typeof state.tables {
  return {
    users: [
      { id: "u1", name: "Alice Smith",      email: "alice@x.com", role: "employee", department_id: "d1", job_title: "Engineer" },
      { id: "u2", name: "Bob Johnson",      email: "bob@x.com",   role: "employee", department_id: "d1", job_title: "Analyst" },
      { id: "u3", name: "Carlos O'Brien",   email: "carlos@x.com",role: "employee", department_id: "d2", job_title: null },
      { id: "u4", name: "Jean-Pierre Dupont",email:"jp@x.com",    role: "employee", department_id: null, job_title: null },
    ],
    departments: [
      { id: "d1", name: "Engineering" },
      { id: "d2", name: "Operations" },
    ],
    submission_types: [
      { id: "t1", name: "Daily Report" },
      { id: "t2", name: "Weekly Summary" },
      { id: "t3", name: "Inventory Sheet" },
    ],
    submissions: [],
    attachments: [],
    revisions: [],
    projects: [],
    holidays: [],
    notifications: [],
    activity_logs: [],
    backup_logs: [],
    work_settings: [{ id: "ws1", enabled: true }],
    ...overrides,
  };
}

// ─── Reset between tests ─────────────────────────────────────────────────────

beforeEach(() => {
  state.tables           = buildTables();
  state.downloads        = {};
  state.uploadResult     = { error: null };
  state.uploadCalls      = [];
  state.lastDownloadBucket = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. ALL SUPPORTED FILE TYPES IN EMPLOYEE FOLDERS
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — all supported attachment file types", () => {
  const FILE_TYPES = [
    { ext: "pdf",  mime: "application/pdf",     data: "PDF-CONTENT",  name: "report.pdf"    },
    { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: "DOCX-CONTENT", name: "doc.docx" },
    { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       data: "XLSX-CONTENT", name: "sheet.xlsx" },
    { ext: "png",  mime: "image/png",           data: "PNG-CONTENT",  name: "photo.png"     },
    { ext: "jpg",  mime: "image/jpeg",          data: "JPG-CONTENT",  name: "image.jpg"     },
    { ext: "jpeg", mime: "image/jpeg",          data: "JPEG-CONTENT", name: "scan.jpeg"     },
    { ext: "csv",  mime: "text/csv",            data: "CSV-CONTENT",  name: "data.csv"      },
  ];

  for (const ft of FILE_TYPES) {
    it(`should include a .${ft.ext} file in the employee folder`, async () => {
      const storagePath = `u1/s1/${ft.name}`;
      state.tables = buildTables({
        submissions: [
          { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
            work_summary: "Test", tasks_details: "", status: "submitted", locked: false,
            submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
        ],
        attachments: [
          { id: "a1", submission_id: "s1", storage_path: storagePath,
            original_name: ft.name, size_bytes: ft.data.length, mime: ft.mime },
        ],
      });
      state.downloads[storagePath] = Buffer.from(ft.data);

      const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
      const zip = await JSZip.loadAsync(state.uploadCalls[0].body);

      // The file must exist somewhere under employees/
      const entries = Object.keys(zip.files);
      const found = entries.some((e) => e.endsWith(ft.name));
      expect(found).toBe(true);
      expect(result.attachmentCount).toBe(1);
    });
  }

  it("should include all 7 file types in a single backup when all are submitted on one day", async () => {
    const submissions: AnyRow[] = FILE_TYPES.map((ft, i) => ({
      id: `s${i}`, user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
      work_summary: `work for ${ft.ext}`, tasks_details: "", status: "submitted",
      locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1,
    }));
    const attachments: AnyRow[] = FILE_TYPES.map((ft, i) => ({
      id: `a${i}`, submission_id: `s${i}`,
      storage_path: `u1/s${i}/${ft.name}`,
      original_name: ft.name, size_bytes: ft.data.length, mime: ft.mime,
    }));

    state.tables = buildTables({ submissions, attachments });
    FILE_TYPES.forEach((ft, i) => {
      state.downloads[`u1/s${i}/${ft.name}`] = Buffer.from(ft.data);
    });

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentCount).toBe(FILE_TYPES.length);
    expect(result.attachmentBytes).toBe(
      FILE_TYPES.reduce((sum, ft) => sum + Buffer.from(ft.data).length, 0)
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. SUBMISSIONS WITH NO ATTACHMENTS
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — submissions with no attachments", () => {
  it("should still create description.json for a submission with no files", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "Text only work", tasks_details: "Just notes", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);

    const descFile = zip.file("employees/Alice_Smith/2026-05-20__Daily_Report/description.json");
    expect(descFile).not.toBeNull();

    const desc = JSON.parse(await descFile!.async("string"));
    expect(desc.submissionId).toBe("s1");
    expect(desc.taskDescription.workSummary).toBe("Text only work");
    expect(desc.files).toEqual([]);
  });

  it("should record zero attachments in result when all submissions have no files", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "No files", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "Also no files", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentCount).toBe(0);
    expect(result.attachmentBytes).toBe(0);
    expect(result.rowCounts.submissions).toBe(2);
  });

  it("should create description.json with correct files array metadata even when no storage_path", async () => {
    // Attachment row exists but storage_path is null (upload failed previously)
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "work", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [
        // storage_path is null — filtered out by buildBackupZip before grouping
        { id: "a1", submission_id: "s1", storage_path: null,
          original_name: "lost.pdf", size_bytes: 100, mime: "application/pdf" },
      ],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const desc = JSON.parse(
      await zip.file("employees/Alice_Smith/2026-05-20__Daily_Report/description.json")!.async("string")
    );
    // null storage_path attachment is excluded from the grouped map
    expect(desc.files).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. EMPLOYEE NAME SANITIZATION
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — employee name folder sanitization", () => {
  function submissionForUser(userId: string, subId = "s1") {
    return {
      id: subId, user_id: userId, submission_type_id: "t1", date: "2026-05-20",
      work_summary: "test", tasks_details: "", status: "submitted",
      locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1,
    };
  }

  it("should replace spaces with underscores — 'Alice Smith' → 'Alice_Smith'", async () => {
    state.tables = buildTables({ submissions: [submissionForUser("u1")], attachments: [] });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.startsWith("employees/Alice_Smith/"))).toBe(true);
  });

  it("should replace apostrophes with underscores — \"Carlos O'Brien\" → 'Carlos_O_Brien'", async () => {
    state.tables = buildTables({ submissions: [submissionForUser("u3")], attachments: [] });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.startsWith("employees/Carlos_O_Brien/"))).toBe(true);
  });

  it("should preserve hyphens in names — 'Jean-Pierre Dupont' → 'Jean-Pierre_Dupont'", async () => {
    state.tables = buildTables({ submissions: [submissionForUser("u4")], attachments: [] });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    // hyphen is in [a-zA-Z0-9._-] so it's preserved; space → _
    expect(entries.some((e) => e.startsWith("employees/Jean-Pierre_Dupont/"))).toBe(true);
  });

  it("should replace slashes and asterisks in user names used as folders", async () => {
    // Inject a user with dangerous path chars
    const badUser = { id: "u_bad", name: "Bob/Weird*Name", email: "b@x.com",
      role: "employee", department_id: null, job_title: null };
    const tables = buildTables({
      users: [...(buildTables().users as AnyRow[]), badUser],
      submissions: [submissionForUser("u_bad")],
      attachments: [],
    });
    state.tables = tables;

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    // Should be sanitized — no raw "/" in path segment
    const hasRawSlash = entries.some((e) => e.includes("Bob/Weird*Name"));
    expect(hasRawSlash).toBe(false);
    const sanitizedPresent = entries.some((e) => e.startsWith("employees/Bob_Weird_Name/"));
    expect(sanitizedPresent).toBe(true);
  });

  it("should fall back to 'user_<id>' folder name when user is not found in lookup", async () => {
    // Submission references a non-existent user id
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u_ghost", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "ghost", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.startsWith("employees/user_u_ghost/"))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DATE FILTER FALLBACK BEHAVIOUR
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — date filter and fallback", () => {
  it("should filter to exact date when submissions exist for that date", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "today", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-19",
          work_summary: "yesterday", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-19T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);

    // Only today's employee folder should exist
    expect(entries.some((e) => e.startsWith("employees/Alice_Smith/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("employees/Bob_Johnson/"))).toBe(false);
  });

  it("should fall back to ALL submissions when no exact date match exists", async () => {
    state.tables = buildTables({
      submissions: [
        // Only a submission for yesterday — none for the requested date
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-19",
          work_summary: "yesterday only", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-19T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    // Falls back → should contain the yesterday submission
    expect(result.rowCounts.submissions).toBe(1);
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    // employee folder for Alice should exist because fallback included it
    expect(entries.some((e) => e.startsWith("employees/Alice_Smith/"))).toBe(true);
  });

  it("should write fallback reason to manifest when no exact date match", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-19",
          work_summary: "old", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-19T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const manifest = await zip.file("manifest.txt")!.async("string");
    expect(manifest).toContain("no matches, fell back to ALL submissions");
  });

  it("should write just the date to manifest when exact match is found (no fallback note)", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "today", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const manifest = await zip.file("manifest.txt")!.async("string");
    expect(manifest).toContain("Attachments for:  2026-05-20");
    expect(manifest).not.toContain("fell back");
  });

  it("should create employees/README.txt when there are zero submissions at all", async () => {
    state.tables = buildTables({ submissions: [], attachments: [] });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const readme = zip.file("employees/README.txt");
    expect(readme).not.toBeNull();
    const content = await readme!.async("string");
    expect(content).toContain("No employee submissions matched");
  });

  it("should NOT create employees/README.txt when submissions are present", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "w", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    expect(zip.file("employees/README.txt")).toBeNull();
  });

  it("should write 'all dates' to manifest when attachmentsForDate is omitted", async () => {
    state.tables = buildTables({ submissions: [], attachments: [] });

    await buildBackupZip(); // no filter
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const manifest = await zip.file("manifest.txt")!.async("string");
    expect(manifest).toContain("Attachments for:  all dates");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. MULTIPLE EMPLOYEES AND SUBMISSION TYPES
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — multiple employees and types", () => {
  it("should give each employee their own folder when both submitted on the same date", async () => {
    const storagePath1 = "u1/s1/report.pdf";
    const storagePath2 = "u2/s2/data.csv";
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "Alice work", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T09:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "Bob work", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T09:30:00Z", version_number: 1 },
      ],
      attachments: [
        { id: "a1", submission_id: "s1", storage_path: storagePath1,
          original_name: "report.pdf", size_bytes: 100, mime: "application/pdf" },
        { id: "a2", submission_id: "s2", storage_path: storagePath2,
          original_name: "data.csv", size_bytes: 50, mime: "text/csv" },
      ],
    });
    state.downloads[storagePath1] = Buffer.from("PDF");
    state.downloads[storagePath2] = Buffer.from("CSV");

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);

    expect(zip.file("employees/Alice_Smith/2026-05-20__Daily_Report/report.pdf")).not.toBeNull();
    expect(zip.file("employees/Bob_Johnson/2026-05-20__Daily_Report/data.csv")).not.toBeNull();
    expect(result.attachmentCount).toBe(2);
  });

  it("should create separate subfolders per submission type for the same employee", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "daily", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T09:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u1", submission_type_id: "t2", date: "2026-05-20",
          work_summary: "weekly", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);

    expect(entries.some((e) => e.includes("2026-05-20__Daily_Report"))).toBe(true);
    expect(entries.some((e) => e.includes("2026-05-20__Weekly_Summary"))).toBe(true);
  });

  it("should include _v2 suffix in subfolder name for version 2 re-submissions", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "revised", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 2 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.includes("_v2"))).toBe(true);
  });

  it("should exclude an employee who only has submissions on a different date", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "today", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T09:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-18",
          work_summary: "two days ago", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-18T09:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.startsWith("employees/Alice_Smith/"))).toBe(true);
    expect(entries.some((e) => e.startsWith("employees/Bob_Johnson/"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. BATCH DOWNLOAD — MORE THAN 6 ATTACHMENTS (BATCH = 6)
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — batch downloads (> 6 files)", () => {
  function buildSevenFilesState() {
    const N = 7;
    const submissions: AnyRow[] = [];
    const attachments: AnyRow[] = [];
    const downloads: Record<string, Buffer> = {};

    for (let i = 1; i <= N; i++) {
      submissions.push({
        id: `s${i}`, user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
        work_summary: `work ${i}`, tasks_details: "", status: "submitted",
        locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: i,
      });
      const path = `u1/s${i}/file${i}.pdf`;
      attachments.push({
        id: `a${i}`, submission_id: `s${i}`, storage_path: path,
        original_name: `file${i}.pdf`, size_bytes: 10 * i, mime: "application/pdf",
      });
      downloads[path] = Buffer.from(`PDF-DATA-${i}`);
    }

    state.tables = buildTables({ submissions, attachments });
    state.downloads = downloads;
  }

  it("should download all 7 attachments when batch size is 6 (requires 2 batches)", async () => {
    buildSevenFilesState();
    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentCount).toBe(7);
  });

  it("should sum attachment bytes correctly across two batches", async () => {
    buildSevenFilesState();
    const expectedBytes = Array.from({ length: 7 }, (_, i) => Buffer.from(`PDF-DATA-${i + 1}`).length)
      .reduce((a, b) => a + b, 0);
    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentBytes).toBe(expectedBytes);
  });

  it("should include all 7 files in the ZIP under employee subfolders", async () => {
    buildSevenFilesState();
    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    for (let i = 1; i <= 7; i++) {
      const entries = Object.keys(zip.files);
      expect(entries.some((e) => e.endsWith(`file${i}.pdf`))).toBe(true);
    }
  });

  it("should count skipped files correctly even when failures span both batches", async () => {
    buildSevenFilesState();
    // Fail files 3 and 7 (one in first batch, one in second)
    state.downloads["u1/s3/file3.pdf"] = { error: "timeout" };
    state.downloads["u1/s7/file7.pdf"] = { error: "not found" };

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    expect(result.attachmentCount).toBe(5);
    expect(result.attachmentBytes).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const manifest = await zip.file("manifest.txt")!.async("string");
    expect(manifest).toContain("Attachments skipped:       2");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. MANIFEST FORMAT COMPLETENESS
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — manifest format completeness", () => {
  beforeEach(() => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "test", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });
  });

  it("should contain the project name header", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("NexTask Backup");
  });

  it("should contain 'Generated:' ISO timestamp", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toMatch(/Generated:\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should contain 'Triggered by:' field with the provided value", async () => {
    await buildBackupZip({ triggeredBy: "manual:admin_test" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("Triggered by:     manual:admin_test");
  });

  it("should contain 'Attachments for:' field", async () => {
    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("Attachments for:");
  });

  it("should list every table name in the Row counts section", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    const tables = [
      "users", "departments", "submission_types", "submissions",
      "attachments", "revisions", "projects", "holidays",
      "notifications", "activity_logs", "backup_logs", "work_settings",
    ];
    tables.forEach((t) => expect(m).toContain(t));
  });

  it("should report 'Submissions in /employees' count", async () => {
    await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("Submissions in /employees: 1");
  });

  it("should report 'Attachments included:' in MB format", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toMatch(/Attachments included:\s+\d+ files \(\d+\.\d{2} MB\)/);
  });

  it("should report 'Attachments skipped:' count", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("Attachments skipped:");
  });

  it("should contain the Layout section describing the ZIP structure", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const m = await zip.file("manifest.txt")!.async("string");
    expect(m).toContain("data.json");
    expect(m).toContain("manifest.txt");
    expect(m).toContain("employees/<name>/<date>__<type>/description.json");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. data.json COMPLETENESS
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — data.json completeness", () => {
  it("should snapshot all 12 tables in data.json", async () => {
    await buildBackupZip();
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const json = JSON.parse(await zip.file("data.json")!.async("string"));

    const expected = [
      "users", "departments", "submission_types", "submissions",
      "attachments", "revisions", "projects", "holidays",
      "notifications", "activity_logs", "backup_logs", "work_settings",
    ];
    expected.forEach((t) => expect(json).toHaveProperty(t));
  });

  it("should include _meta with project name, generatedAt, and triggeredBy", async () => {
    await buildBackupZip({ triggeredBy: "auto-cron" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const json = JSON.parse(await zip.file("data.json")!.async("string"));

    expect(json._meta.project).toBe("NexTask");
    expect(json._meta.triggeredBy).toBe("auto-cron");
    expect(json._meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should accurately report row counts for each table in the result", async () => {
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "w", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
        { id: "s2", user_id: "u2", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "w2", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [],
    });

    const result = await buildBackupZip();
    expect(result.rowCounts.users).toBe(4); // 4 users in buildTables()
    expect(result.rowCounts.submissions).toBe(2);
    expect(result.rowCounts.attachments).toBe(0);
    expect(result.rowCounts.departments).toBe(2);
    expect(result.rowCounts.submission_types).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. FILENAME COLLISION DEDUPLICATION
// ═════════════════════════════════════════════════════════════════════════════

describe("buildBackupZip — filename collision handling", () => {
  it("should deduplicate when two attachments in the same submission share the same original name", async () => {
    // Both attachments are named "report.pdf" but in different storage paths
    state.tables = buildTables({
      submissions: [
        { id: "s1", user_id: "u1", submission_type_id: "t1", date: "2026-05-20",
          work_summary: "w", tasks_details: "", status: "submitted",
          locked: false, submitted_at: "2026-05-20T10:00:00Z", version_number: 1 },
      ],
      attachments: [
        { id: "aaa111", submission_id: "s1", storage_path: "u1/s1/v1.pdf",
          original_name: "report.pdf", size_bytes: 10, mime: "application/pdf" },
        { id: "bbb222", submission_id: "s1", storage_path: "u1/s1/v2.pdf",
          original_name: "report.pdf", size_bytes: 20, mime: "application/pdf" },
      ],
    });
    state.downloads["u1/s1/v1.pdf"] = Buffer.from("PDF1");
    state.downloads["u1/s1/v2.pdf"] = Buffer.from("PDF2");

    const result = await buildBackupZip({ attachmentsForDate: "2026-05-20" });
    const zip = await JSZip.loadAsync(state.uploadCalls[0].body);
    const entries = Object.keys(zip.files).filter((e) => e.endsWith(".pdf") && e.includes("employees"));

    // Both files should be present (second one gets a collision-avoidance prefix)
    expect(entries).toHaveLength(2);
    expect(result.attachmentCount).toBe(2);
  });
});
