// ─────────────────────────────────────────────────────────────────────────────
// Principal QA — submissionService.create() comprehensive test suite
//
// Covers every branch a QA lead would care about:
//   • maxFiles limit        (new guard)
//   • File-type validation  (pdf, png, jpg, jpeg, docx, xlsx, csv — and rejected types)
//   • File-size validation  (per-type maxFileSizeMB, boundary values)
//   • Happy paths           (each allowed type, zero files, mixed types)
//   • Status assignment     (submitted vs revised via revision flow)
//   • Versioning            (new vs re-submit: version bump, parentId, cache replace)
//   • Cache behaviour       (prepend, deduplicate)
//   • Storage/DB errors     (graceful storage failure, hard DB failure)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSubmission, createSubmissionType, createUser } from "@/test/factories";

// ─── Controllable state (accessible inside vi.mock factories via vi.hoisted) ──
const state = vi.hoisted(() => ({
  storageError:    null as string | null,
  dbUpsertError:   null as string | null,
  pastDeadline:    false,
  pastWorkEnd:     false,
  uploadedPaths:   [] as string[],
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: vi.fn(async () => ({
        error: state.dbUpsertError ? { message: state.dbUpsertError } : null,
      })),
      // delete().eq() chain
      delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      insert: vi.fn(async () => ({ error: null })),
    }),
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string) => {
          state.uploadedPaths.push(path);
          return state.storageError
            ? { data: null, error: { message: state.storageError } }
            : { data: { path }, error: null };
        }),
      }),
    },
  },
  STORAGE_BUCKET: "submissions",
}));

vi.mock("@/lib/dates", () => ({
  todayISO:        () => "2026-05-20",
  nowISO:          () => "2026-05-20T10:00:00.000Z",
  isPastDeadline:  () => state.pastDeadline,
}));

vi.mock("@/services/workSettings.service", () => ({
  workSettingsService: {
    isPastWorkEnd:    () => state.pastWorkEnd,
    isWorkingDay:     () => true,
    countWorkingDays: () => 5,
  },
}));

vi.mock("@/services/log.service", () => ({
  logService: { append: vi.fn() },
}));

vi.mock("@/services/notification.service", () => ({
  notificationService: { push: vi.fn() },
}));

// ─── Auth / store plumbing ────────────────────────────────────────────────────

const empUser = createUser({ id: "u_emp", name: "Test Employee", role: "employee" });

const authState = vi.hoisted(() => ({
  user: { id: "u_emp", name: "Test Employee", role: "employee" } as Record<string, unknown> | null,
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: { getState: () => authState },
}));

let submissions: ReturnType<typeof createSubmission>[] = [];
let submissionTypes: ReturnType<typeof createSubmissionType>[] = [];

const storeMock = {
  get submissions() { return submissions; },
  get submissionTypes() { return submissionTypes; },
  get users() { return [empUser]; },
  setSubmissions: vi.fn((s) => { submissions = s; }),
  notifications: [],
  setNotifications: vi.fn(),
  revisions: [] as { id: string; submissionId: string; status: string; resubmittedAt?: string }[],
  setRevisions: vi.fn(),
};

vi.mock("@/store/dataStore", () => ({
  useDataStore: { getState: () => storeMock },
}));

// ─── FileReader stub (for fileToInlineDataUrl in the service) ─────────────────
// happy-dom doesn't always fire FileReader events synchronously; stub it so
// tests are not flaky.
class FakeFileReader {
  result = "data:application/octet-stream;base64,dGVzdA==";
  onload: ((e: ProgressEvent) => void) | null = null;
  readAsDataURL() {
    setTimeout(() => this.onload?.({} as ProgressEvent), 0);
  }
}
Object.defineProperty(globalThis, "FileReader", { value: FakeFileReader, writable: true });

// ─── File factories ───────────────────────────────────────────────────────────

function makeFile(name: string, sizeBytes: number, type = "application/octet-stream"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const pdf   = (bytes = 512)  => makeFile("report.pdf",   bytes, "application/pdf");
const png   = (bytes = 512)  => makeFile("image.png",    bytes, "image/png");
const jpg   = (bytes = 512)  => makeFile("photo.jpg",    bytes, "image/jpeg");
const jpeg  = (bytes = 512)  => makeFile("scan.jpeg",    bytes, "image/jpeg");
const docx  = (bytes = 512)  => makeFile("doc.docx",     bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
const xlsx  = (bytes = 512)  => makeFile("sheet.xlsx",   bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
const csv   = (bytes = 512)  => makeFile("data.csv",     bytes, "text/csv");

const TODAY = "2026-05-20";

function baseInput(
  overrides: Partial<{ submissionTypeId: string; files: File[]; date: string; workSummary: string }> = {}
) {
  return {
    date: TODAY,
    submissionTypeId: "st_1",
    workSummary: "Completed daily tasks",
    tasksDetails: "- Task A\n- Task B",
    files: [] as File[],
    ...overrides,
  };
}

// ─── Global reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  submissions = [];
  submissionTypes = [
    createSubmissionType({
      id: "st_1",
      allowedFileTypes: ["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "csv"],
      maxFileSizeMB: 10,
      maxFiles: 5,
    }),
  ];
  authState.user = { id: "u_emp", name: "Test Employee", role: "employee" };
  state.storageError    = null;
  state.dbUpsertError   = null;
  state.pastDeadline    = false;
  state.pastWorkEnd     = false;
  state.uploadedPaths   = [];
  storeMock.setSubmissions.mockClear();
});

import { submissionService } from "@/services/submission.service";

// ═════════════════════════════════════════════════════════════════════════════
// 1. FILE TYPE VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — file type validation", () => {
  it("should reject a .txt file not in allowedFileTypes", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("notes.txt", 100, "text/plain")] }))
    ).rejects.toThrow("File type .txt is not allowed.");
  });

  it("should reject a .exe file", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("installer.exe", 100)] }))
    ).rejects.toThrow("File type .exe is not allowed.");
  });

  it("should reject a .mp4 video file", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("clip.mp4", 100, "video/mp4")] }))
    ).rejects.toThrow("File type .mp4 is not allowed.");
  });

  it("should reject a .html file", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("page.html", 100, "text/html")] }))
    ).rejects.toThrow("File type .html is not allowed.");
  });

  it("should reject a .js script file", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("script.js", 100, "text/javascript")] }))
    ).rejects.toThrow("File type .js is not allowed.");
  });

  it("should reject a .zip archive", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("archive.zip", 100, "application/zip")] }))
    ).rejects.toThrow("File type .zip is not allowed.");
  });

  it("should reject a file with no extension (ext is empty string)", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("noextension", 100)] }))
    ).rejects.toThrow("is not allowed");
  });

  it("should treat extension matching as case-insensitive — REPORT.PDF should be accepted", async () => {
    await expect(
      submissionService.create(baseInput({ files: [makeFile("REPORT.PDF", 100, "application/pdf")] }))
    ).resolves.toBeDefined();
  });

  it("should accept .pdf", async () => {
    await expect(submissionService.create(baseInput({ files: [pdf()] }))).resolves.toBeDefined();
  });

  it("should accept .png", async () => {
    await expect(submissionService.create(baseInput({ files: [png()] }))).resolves.toBeDefined();
  });

  it("should accept .jpg", async () => {
    await expect(submissionService.create(baseInput({ files: [jpg()] }))).resolves.toBeDefined();
  });

  it("should accept .jpeg", async () => {
    await expect(submissionService.create(baseInput({ files: [jpeg()] }))).resolves.toBeDefined();
  });

  it("should accept .docx", async () => {
    await expect(submissionService.create(baseInput({ files: [docx()] }))).resolves.toBeDefined();
  });

  it("should accept .xlsx", async () => {
    await expect(submissionService.create(baseInput({ files: [xlsx()] }))).resolves.toBeDefined();
  });

  it("should accept .csv", async () => {
    await expect(submissionService.create(baseInput({ files: [csv()] }))).resolves.toBeDefined();
  });

  it("should fail on the first invalid file even when other files in batch are valid", async () => {
    const files = [pdf(), makeFile("bad.exe", 100), png()];
    await expect(submissionService.create(baseInput({ files }))).rejects.toThrow(".exe is not allowed");
  });

  it("should reject .pdf when it is removed from allowedFileTypes for the type", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["png", "jpg"], maxFileSizeMB: 10, maxFiles: 5 }),
    ];
    await expect(
      submissionService.create(baseInput({ files: [pdf()] }))
    ).rejects.toThrow(".pdf is not allowed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. maxFiles LIMIT
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — maxFiles limit", () => {
  it("should reject when files exceed maxFiles (6 files, limit 5)", async () => {
    const files = Array.from({ length: 6 }, () => pdf());
    await expect(submissionService.create(baseInput({ files })))
      .rejects.toThrow("Too many files. Max 5 files per submission.");
  });

  it("should accept when file count equals maxFiles exactly (5 files, limit 5)", async () => {
    const files = [pdf(), png(), jpg(), docx(), xlsx()];
    await expect(submissionService.create(baseInput({ files }))).resolves.toBeDefined();
  });

  it("should accept when file count is below maxFiles (1 file, limit 5)", async () => {
    await expect(submissionService.create(baseInput({ files: [pdf()] }))).resolves.toBeDefined();
  });

  it("should accept zero files even though limit is 5 (no files means no violation)", async () => {
    await expect(submissionService.create(baseInput({ files: [] }))).resolves.toBeDefined();
  });

  it("should use singular 'file' in error message when maxFiles is 1", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["pdf"], maxFiles: 1, maxFileSizeMB: 10 }),
    ];
    await expect(submissionService.create(baseInput({ files: [pdf(), pdf()] })))
      .rejects.toThrow("Max 1 file per submission.");
  });

  it("should use plural 'files' in error message when maxFiles > 1", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["pdf"], maxFiles: 3, maxFileSizeMB: 10 }),
    ];
    await expect(
      submissionService.create(baseInput({ files: [pdf(), pdf(), pdf(), pdf()] }))
    ).rejects.toThrow("Max 3 files per submission.");
  });

  it("should check maxFiles BEFORE per-file type validation (count guard fires first)", async () => {
    // 6 files, last one invalid — should get count error, not type error
    const files = [pdf(), pdf(), pdf(), pdf(), pdf(), makeFile("bad.exe", 100)];
    await expect(submissionService.create(baseInput({ files })))
      .rejects.toThrow("Too many files");
  });

  it("should enforce maxFiles per submission type independently (type with limit 2)", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["pdf"], maxFiles: 2, maxFileSizeMB: 10 }),
    ];
    await expect(submissionService.create(baseInput({ files: [pdf(), pdf(), pdf()] })))
      .rejects.toThrow("Max 2 files");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. FILE SIZE LIMIT
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — file size limit", () => {
  const TEN_MB = 10 * 1024 * 1024;

  it("should reject a file 1 byte over maxFileSizeMB", async () => {
    await expect(submissionService.create(baseInput({ files: [pdf(TEN_MB + 1)] })))
      .rejects.toThrow("report.pdf exceeds 10 MB.");
  });

  it("should accept a file at exactly maxFileSizeMB (boundary — not over)", async () => {
    await expect(submissionService.create(baseInput({ files: [pdf(TEN_MB)] })))
      .resolves.toBeDefined();
  });

  it("should reject when any file in a multi-file batch is over the limit", async () => {
    await expect(
      submissionService.create(baseInput({ files: [pdf(100), png(100), jpg(TEN_MB + 1)] }))
    ).rejects.toThrow("photo.jpg exceeds 10 MB.");
  });

  it("should include the filename in the size error message", async () => {
    const big = makeFile("quarterly_summary.pdf", TEN_MB + 1, "application/pdf");
    await expect(submissionService.create(baseInput({ files: [big] })))
      .rejects.toThrow("quarterly_summary.pdf exceeds 10 MB");
  });

  it("should respect a custom per-type limit (2 MB type — reject > 2 MB file)", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["pdf"], maxFileSizeMB: 2, maxFiles: 5 }),
    ];
    await expect(submissionService.create(baseInput({ files: [pdf(2 * 1024 * 1024 + 1)] })))
      .rejects.toThrow("exceeds 2 MB");
  });

  it("should accept file at a tight 2 MB per-type limit exactly", async () => {
    submissionTypes = [
      createSubmissionType({ id: "st_1", allowedFileTypes: ["pdf"], maxFileSizeMB: 2, maxFiles: 5 }),
    ];
    await expect(submissionService.create(baseInput({ files: [pdf(2 * 1024 * 1024)] })))
      .resolves.toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. SUCCESSFUL CREATES — EACH FILE TYPE
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — successful creates", () => {
  it("should create a submission with a single PDF and record it as an attachment", async () => {
    const sub = await submissionService.create(baseInput({ files: [pdf(1024)] }));
    expect(sub.attachments).toHaveLength(1);
    expect(sub.attachments[0].originalName).toBe("report.pdf");
    expect(sub.attachments[0].mime).toBe("application/pdf");
    expect(sub.attachments[0].sizeBytes).toBe(1024);
  });

  it("should create a submission with a PNG image and record correct mime", async () => {
    const sub = await submissionService.create(baseInput({ files: [png(2048)] }));
    expect(sub.attachments[0].originalName).toBe("image.png");
    expect(sub.attachments[0].mime).toBe("image/png");
    expect(sub.attachments[0].sizeBytes).toBe(2048);
  });

  it("should create a submission with a JPG photo", async () => {
    const sub = await submissionService.create(baseInput({ files: [jpg(3000)] }));
    expect(sub.attachments[0].originalName).toBe("photo.jpg");
    expect(sub.attachments[0].mime).toBe("image/jpeg");
    expect(sub.attachments[0].sizeBytes).toBe(3000);
  });

  it("should create a submission with a JPEG photo", async () => {
    const sub = await submissionService.create(baseInput({ files: [jpeg(3000)] }));
    expect(sub.attachments[0].originalName).toBe("scan.jpeg");
  });

  it("should create a submission with a DOCX document", async () => {
    const sub = await submissionService.create(baseInput({ files: [docx(5000)] }));
    expect(sub.attachments[0].originalName).toBe("doc.docx");
    expect(sub.attachments[0].sizeBytes).toBe(5000);
  });

  it("should create a submission with an XLSX spreadsheet", async () => {
    const sub = await submissionService.create(baseInput({ files: [xlsx(4000)] }));
    expect(sub.attachments[0].originalName).toBe("sheet.xlsx");
    expect(sub.attachments[0].sizeBytes).toBe(4000);
  });

  it("should create a submission with a CSV data file", async () => {
    const sub = await submissionService.create(baseInput({ files: [csv(800)] }));
    expect(sub.attachments[0].originalName).toBe("data.csv");
    expect(sub.attachments[0].mime).toBe("text/csv");
  });

  it("should create a submission with zero files and leave filePath empty", async () => {
    const sub = await submissionService.create(baseInput({ files: [] }));
    expect(sub.attachments).toHaveLength(0);
    expect(sub.filePath).toBe("");
  });

  it("should create a submission with all 5 mixed file types (at maxFiles limit)", async () => {
    const files = [pdf(), png(), jpg(), docx(), xlsx()];
    const sub = await submissionService.create(baseInput({ files }));
    expect(sub.attachments).toHaveLength(5);
    const names = sub.attachments.map((a) => a.originalName);
    expect(names).toContain("report.pdf");
    expect(names).toContain("image.png");
    expect(names).toContain("photo.jpg");
    expect(names).toContain("doc.docx");
    expect(names).toContain("sheet.xlsx");
  });

  it("should replace spaces in filename with underscores for storedName, preserving originalName", async () => {
    const file = makeFile("my work report 2026.pdf", 100, "application/pdf");
    const sub = await submissionService.create(baseInput({ files: [file] }));
    expect(sub.attachments[0].originalName).toBe("my work report 2026.pdf");
    expect(sub.attachments[0].storedName).toBe("my_work_report_2026.pdf");
  });

  it("should upload each file to the submissions bucket under userId/date/ path", async () => {
    await submissionService.create(baseInput({ files: [pdf(), png()] }));
    expect(state.uploadedPaths).toHaveLength(2);
    state.uploadedPaths.forEach((p) => {
      expect(p).toMatch(/^u_emp\/2026-05-20\//);
    });
  });

  it("should set userId from the authenticated user", async () => {
    const sub = await submissionService.create(baseInput());
    expect(sub.userId).toBe("u_emp");
  });

  it("should lock the submission immediately on creation", async () => {
    const sub = await submissionService.create(baseInput());
    expect(sub.locked).toBe(true);
  });

  it("should trim leading and trailing whitespace from workSummary", async () => {
    const sub = await submissionService.create({
      ...baseInput(),
      workSummary: "   trimmed summary   ",
    });
    expect(sub.workSummary).toBe("trimmed summary");
  });

  it("should set versionNumber to 1 for a brand new submission", async () => {
    const sub = await submissionService.create(baseInput());
    expect(sub.versionNumber).toBe(1);
  });

  it("should set parentSubmissionId to null for a brand new submission", async () => {
    const sub = await submissionService.create(baseInput());
    expect(sub.parentSubmissionId).toBeNull();
  });

  it("should generate a hashStub for each attachment", async () => {
    const sub = await submissionService.create(baseInput({ files: [pdf()] }));
    expect(typeof sub.attachments[0].hashStub).toBe("string");
    expect(sub.attachments[0].hashStub.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. STATUS ASSIGNMENT
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — status assignment", () => {
  it("should assign 'submitted' when before deadline and within work hours", async () => {
    state.pastDeadline = false;
    state.pastWorkEnd  = false;
    const sub = await submissionService.create(baseInput({ date: TODAY }));
    expect(sub.status).toBe("submitted");
  });

  it("should assign 'submitted' when past the submission type's deadline time (no late concept)", async () => {
    state.pastDeadline = true;
    const sub = await submissionService.create(baseInput({ date: TODAY }));
    expect(sub.status).toBe("submitted");
  });

  it("should assign 'submitted' when past work-end hours on today's date (no late concept)", async () => {
    state.pastWorkEnd = true;
    const sub = await submissionService.create(baseInput({ date: TODAY }));
    expect(sub.status).toBe("submitted");
  });

  it("should assign 'submitted' when past work-end but date is NOT today (historical submission)", async () => {
    state.pastWorkEnd = true;
    // Different date → isToday = false → pastWorkHours ignored
    const sub = await submissionService.create(baseInput({ date: "2026-05-19" }));
    expect(sub.status).toBe("submitted");
  });

  it("should assign 'submitted' when BOTH deadline AND work-end are past (no late concept)", async () => {
    state.pastDeadline = true;
    state.pastWorkEnd  = true;
    const sub = await submissionService.create(baseInput({ date: TODAY }));
    expect(sub.status).toBe("submitted");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. VERSIONING AND RE-SUBMISSION
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — re-submission and versioning", () => {
  function priorSub(overrides: Partial<ReturnType<typeof createSubmission>> = {}) {
    return createSubmission({
      id: "sub_existing",
      userId: "u_emp",
      date: TODAY,
      submissionTypeId: "st_1",
      locked: false,
      versionNumber: 1,
      ...overrides,
    });
  }

  it("should bump versionNumber to 2 when re-submitting an unlocked submission", async () => {
    submissions = [priorSub()];
    const sub = await submissionService.create(baseInput());
    expect(sub.versionNumber).toBe(2);
  });

  it("should bump versionNumber to 3 on a third submission (v2 → v3)", async () => {
    submissions = [priorSub({ versionNumber: 2 })];
    const sub = await submissionService.create(baseInput());
    expect(sub.versionNumber).toBe(3);
  });

  it("should set parentSubmissionId to the previous submission's id", async () => {
    submissions = [priorSub({ id: "sub_parent_abc" })];
    const sub = await submissionService.create(baseInput());
    expect(sub.parentSubmissionId).toBe("sub_parent_abc");
  });

  it("should reuse the existing submission's id (not generate a new one) on re-submit", async () => {
    submissions = [priorSub({ id: "sub_stable_id" })];
    const sub = await submissionService.create(baseInput());
    expect(sub.id).toBe("sub_stable_id");
  });

  it("should replace the existing entry in the cache — not add a duplicate", async () => {
    submissions = [priorSub({ id: "sub_stable_id" })];
    await submissionService.create(baseInput());
    const updated: ReturnType<typeof createSubmission>[] =
      storeMock.setSubmissions.mock.calls[0][0];
    const matches = updated.filter((s) => s.id === "sub_stable_id");
    expect(matches).toHaveLength(1);
    expect(updated).toHaveLength(1);
  });

  it("should assign 'revised' when re-uploading after an approved revision", async () => {
    submissions = [priorSub({ status: "revision_approved", locked: false, submittedAt: "2026-05-19T09:00:00.000Z" })];
    const sub = await submissionService.create(baseInput());
    expect(sub.status).toBe("revised");
  });

  it("should assign 'submitted' when re-uploading over a non-revision-approved submission", async () => {
    submissions = [priorSub({ status: "submitted", locked: false, submittedAt: "2026-05-19T09:00:00.000Z" })];
    const sub = await submissionService.create(baseInput());
    expect(sub.status).toBe("submitted");
  });

  it("should NOT re-submit when the existing submission is locked — throws", async () => {
    submissions = [priorSub({ locked: true })];
    await expect(submissionService.create(baseInput())).rejects.toThrow("locked");
  });

  it("should still accept files on re-submission, replacing old attachments", async () => {
    submissions = [priorSub()];
    const sub = await submissionService.create(baseInput({ files: [pdf(), png()] }));
    expect(sub.attachments).toHaveLength(2);
    expect(sub.versionNumber).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. CACHE UPDATES
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — cache updates", () => {
  it("should call setSubmissions exactly once per create", async () => {
    await submissionService.create(baseInput());
    expect(storeMock.setSubmissions).toHaveBeenCalledTimes(1);
  });

  it("should prepend the new submission to an empty cache", async () => {
    submissions = [];
    const sub = await submissionService.create(baseInput());
    const updated: ReturnType<typeof createSubmission>[] =
      storeMock.setSubmissions.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(sub.id);
  });

  it("should prepend the new submission ahead of existing unrelated submissions", async () => {
    submissions = [createSubmission({ userId: "u_other" })];
    const sub = await submissionService.create(baseInput());
    const updated: ReturnType<typeof createSubmission>[] =
      storeMock.setSubmissions.mock.calls[0][0];
    expect(updated[0].id).toBe(sub.id);
    expect(updated).toHaveLength(2);
  });

  it("should not mutate other users' submissions in the cache", async () => {
    const other = createSubmission({ id: "sub_other", userId: "u_other", status: "submitted" });
    submissions = [other];
    await submissionService.create(baseInput());
    const updated: ReturnType<typeof createSubmission>[] =
      storeMock.setSubmissions.mock.calls[0][0];
    const found = updated.find((s) => s.id === "sub_other");
    expect(found).toBeDefined();
    expect(found?.status).toBe("submitted");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. STORAGE AND DB ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════════════

describe("submissionService.create — storage and DB error handling", () => {
  it("should NOT throw when storage upload fails — service treats it as a non-fatal warning", async () => {
    state.storageError = "Bucket quota exceeded";
    await expect(submissionService.create(baseInput({ files: [pdf()] }))).resolves.toBeDefined();
  });

  it("should still create the attachment record (null storagePath) when storage fails", async () => {
    state.storageError = "network timeout";
    const sub = await submissionService.create(baseInput({ files: [pdf()] }));
    // Attachment is still present in the submission (storagePath may be null)
    expect(sub.attachments).toHaveLength(1);
    expect(sub.attachments[0].originalName).toBe("report.pdf");
  });

  it("should handle multiple storage failures gracefully — all attachments still recorded", async () => {
    state.storageError = "internal server error";
    const sub = await submissionService.create(baseInput({ files: [pdf(), png(), jpg()] }));
    expect(sub.attachments).toHaveLength(3);
  });

  it("should throw 'Failed to save submission to database' when DB upsert errors", async () => {
    state.dbUpsertError = "unique constraint violation";
    await expect(submissionService.create(baseInput())).rejects.toThrow(
      "Failed to save submission to database."
    );
  });

  it("should throw 'Not authenticated' when no user is logged in", async () => {
    authState.user = null;
    await expect(submissionService.create(baseInput())).rejects.toThrow("Not authenticated");
  });

  it("should throw 'Submission type not found' when type ID does not exist in store", async () => {
    submissionTypes = [];
    await expect(submissionService.create(baseInput())).rejects.toThrow("Submission type not found");
  });

  it("should still upload files to storage before detecting DB error", async () => {
    // Storage is fine; DB fails after uploads
    state.dbUpsertError = "db error";
    try {
      await submissionService.create(baseInput({ files: [pdf()] }));
    } catch {
      // expected
    }
    // The upload DID happen before the DB call
    expect(state.uploadedPaths).toHaveLength(1);
  });
});
