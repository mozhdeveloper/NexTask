// Unit tests for src/lib/supabase/mappers.ts
// Validates that snake_case DB rows are correctly transformed to camelCase domain types.

import { describe, it, expect } from "vitest";
import {
  mapUser,
  mapDepartment,
  mapSubmissionType,
  mapSubmission,
  mapAttachment,
  mapRevision,
  mapActivityLog,
  mapBackupLog,
  mapNotification,
  mapProject,
  mapWorkSettings,
} from "@/lib/supabase/mappers";
import type {
  DbUserRow,
  DbDepartmentRow,
  DbSubmissionTypeRow,
  DbSubmissionRow,
  DbAttachmentRow,
  DbRevisionRow,
  DbActivityLogRow,
  DbBackupLogRow,
  DbNotificationRow,
  DbProjectRow,
  DbWorkSettingsRow,
} from "@/lib/supabase/types";

// ─── mapUser ─────────────────────────────────────────────────────────────────
describe("mapUser", () => {
  const row: DbUserRow = {
    id: "u_admin",
    auth_user_id: "auth-uuid-123",
    name: "Admin User",
    email: "admin@example.com",
    role: "admin",
    department_id: "dept_1",
    job_title: "Director",
    avatar_color: "bg-teal-500",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("should map id, name, email, role directly", () => {
    const user = mapUser(row);
    expect(user.id).toBe("u_admin");
    expect(user.name).toBe("Admin User");
    expect(user.email).toBe("admin@example.com");
    expect(user.role).toBe("admin");
  });

  it("should map department_id to departmentId", () => {
    expect(mapUser(row).departmentId).toBe("dept_1");
  });

  it("should map job_title to jobTitle", () => {
    expect(mapUser(row).jobTitle).toBe("Director");
  });

  it("should map is_active to isActive", () => {
    expect(mapUser(row).isActive).toBe(true);
  });

  it("should set passwordHash to empty string (not stored client-side)", () => {
    expect(mapUser(row).passwordHash).toBe("");
  });

  it("should handle null department_id as null", () => {
    const user = mapUser({ ...row, department_id: null });
    expect(user.departmentId).toBeNull();
  });

  it("should handle null job_title as undefined", () => {
    const user = mapUser({ ...row, job_title: null });
    expect(user.jobTitle).toBeUndefined();
  });
});

// ─── mapDepartment ────────────────────────────────────────────────────────────
describe("mapDepartment", () => {
  const row: DbDepartmentRow = {
    id: "dept_1",
    name: "Engineering",
    lead: "u_manager",
    description: "Builds things",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("should map id, name, created_at", () => {
    const dept = mapDepartment(row);
    expect(dept.id).toBe("dept_1");
    expect(dept.name).toBe("Engineering");
  });

  it("should map lead to lead (same key)", () => {
    expect(mapDepartment(row).lead).toBe("u_manager");
  });

  it("should return undefined lead when null", () => {
    expect(mapDepartment({ ...row, lead: null }).lead).toBeUndefined();
  });

  it("should map description", () => {
    expect(mapDepartment(row).description).toBe("Builds things");
  });
});

// ─── mapSubmissionType ────────────────────────────────────────────────────────
describe("mapSubmissionType", () => {
  const row: DbSubmissionTypeRow = {
    id: "st_1",
    name: "Daily Work Log",
    department_id: null,
    required_daily: true,
    deadline_time: "18:00:00",
    allowed_file_types: ["pdf", "docx"],
    max_file_size_mb: 10,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("should map required_daily to requiredDaily", () => {
    expect(mapSubmissionType(row).requiredDaily).toBe(true);
  });

  it("should slice deadline_time to HH:MM format", () => {
    expect(mapSubmissionType(row).deadlineTime).toBe("18:00");
  });

  it("should fall back to '18:00' for null deadline_time", () => {
    expect(mapSubmissionType({ ...row, deadline_time: null as unknown as string }).deadlineTime).toBe("18:00");
  });

  it("should map max_file_size_mb to maxFileSizeMB", () => {
    expect(mapSubmissionType(row).maxFileSizeMB).toBe(10);
  });

  it("should map allowed_file_types to allowedFileTypes", () => {
    expect(mapSubmissionType(row).allowedFileTypes).toEqual(["pdf", "docx"]);
  });

  it("should fall back to empty array for null allowed_file_types", () => {
    expect(mapSubmissionType({ ...row, allowed_file_types: null as unknown as string[] }).allowedFileTypes).toEqual([]);
  });
});

// ─── mapSubmission ────────────────────────────────────────────────────────────
describe("mapSubmission", () => {
  const row: DbSubmissionRow = {
    id: "sub_1",
    user_id: "u_emp",
    submission_type_id: "st_1",
    date: "2026-05-18",
    work_summary: "Completed tasks",
    tasks_details: "Task A, Task B",
    status: "submitted",
    locked: true,
    submitted_at: "2026-05-18T14:00:00Z",
    locked_at: "2026-05-18T14:00:00Z",
    uploaded_ip: "192.168.1.1",
    version_number: 1,
    parent_submission_id: null,
    file_path: "employees/emp/2026/05-May/18/file.pdf",
    created_at: "2026-05-18T14:00:00Z",
  };

  it("should map user_id to userId", () => {
    expect(mapSubmission(row).userId).toBe("u_emp");
  });

  it("should map submission_type_id to submissionTypeId", () => {
    expect(mapSubmission(row).submissionTypeId).toBe("st_1");
  });

  it("should return empty attachments array when none provided", () => {
    expect(mapSubmission(row).attachments).toEqual([]);
  });

  it("should include mapped attachments when provided", () => {
    const att: DbAttachmentRow = {
      id: "att_1",
      submission_id: "sub_1",
      original_name: "doc.pdf",
      stored_name: "doc.pdf",
      size_bytes: 1024,
      mime: "application/pdf",
      hash_stub: "ab12ef34",
      storage_path: "submissions/u_emp/2026-05-18/doc.pdf",
      data_url: null,
      created_at: "2026-05-18T14:00:00Z",
    };
    const sub = mapSubmission(row, [att]);
    expect(sub.attachments).toHaveLength(1);
    expect(sub.attachments[0].originalName).toBe("doc.pdf");
  });

  it("should map version_number to versionNumber", () => {
    expect(mapSubmission(row).versionNumber).toBe(1);
  });

  it("should use empty string when uploaded_ip is null", () => {
    expect(mapSubmission({ ...row, uploaded_ip: null }).uploadedIp).toBe("");
  });
});

// ─── mapRevision ──────────────────────────────────────────────────────────────
describe("mapRevision", () => {
  const row: DbRevisionRow = {
    id: "rev_1",
    submission_id: "sub_1",
    user_id: "u_emp",
    reason: "Need to add attachment",
    status: "pending",
    admin_id: null,
    admin_note: null,
    created_at: "2026-05-18T10:00:00Z",
    decided_at: null,
  };

  it("should map submission_id to submissionId", () => {
    expect(mapRevision(row).submissionId).toBe("sub_1");
  });

  it("should map user_id to userId", () => {
    expect(mapRevision(row).userId).toBe("u_emp");
  });

  it("should return undefined for null admin_id and admin_note", () => {
    const r = mapRevision(row);
    expect(r.adminId).toBeUndefined();
    expect(r.adminNote).toBeUndefined();
  });

  it("should return undefined for null decided_at", () => {
    expect(mapRevision(row).decidedAt).toBeUndefined();
  });

  it("should map admin_note when present", () => {
    const r = mapRevision({ ...row, admin_note: "Looks good" });
    expect(r.adminNote).toBe("Looks good");
  });
});

// ─── mapActivityLog ───────────────────────────────────────────────────────────
describe("mapActivityLog", () => {
  const row: DbActivityLogRow = {
    id: "log_1",
    user_id: "u_admin",
    action: "auth.login",
    target_type: "session",
    target_id: null,
    ip: "192.168.1.1",
    user_agent: "Mozilla/5.0",
    created_at: "2026-05-18T09:00:00Z",
  };

  it("should map user_id to userId", () => {
    expect(mapActivityLog(row).userId).toBe("u_admin");
  });

  it("should map null user_id to empty string", () => {
    expect(mapActivityLog({ ...row, user_id: null }).userId).toBe("");
  });

  it("should map target_type to targetType", () => {
    expect(mapActivityLog(row).targetType).toBe("session");
  });

  it("should map target_id to targetId (null allowed)", () => {
    expect(mapActivityLog(row).targetId).toBeNull();
  });

  it("should map ip and user_agent", () => {
    const log = mapActivityLog(row);
    expect(log.ip).toBe("192.168.1.1");
    expect(log.userAgent).toBe("Mozilla/5.0");
  });
});

// ─── mapBackupLog ─────────────────────────────────────────────────────────────
describe("mapBackupLog", () => {
  const row: DbBackupLogRow = {
    id: "bkp_1",
    admin_id: "u_admin",
    file_name: "backup_2026.zip",
    file_path: "D:\\backups\\backup_2026.zip",
    size_bytes: 26000000,
    started_at: "2026-05-18T22:00:00Z",
    completed_at: "2026-05-18T22:00:03Z",
    created_at: "2026-05-18T22:00:00Z",
    status: "completed",
  };

  it("should map admin_id to adminId", () => {
    expect(mapBackupLog(row).adminId).toBe("u_admin");
  });

  it("should map file_name to fileName", () => {
    expect(mapBackupLog(row).fileName).toBe("backup_2026.zip");
  });

  it("should map size_bytes to sizeBytes", () => {
    expect(mapBackupLog(row).sizeBytes).toBe(26000000);
  });

  it("should map completed_at to completedAt", () => {
    expect(mapBackupLog(row).completedAt).toBe("2026-05-18T22:00:03Z");
  });

  it("should map null admin_id to empty string", () => {
    expect(mapBackupLog({ ...row, admin_id: null as unknown as string }).adminId).toBe("");
  });
});

// ─── mapNotification ──────────────────────────────────────────────────────────
describe("mapNotification", () => {
  const row: DbNotificationRow = {
    id: "ntf_1",
    user_id: "u_emp",
    type: "success",
    title: "Revision approved",
    body: "You can re-upload now.",
    link: "/my-submissions",
    read: false,
    created_at: "2026-05-18T12:00:00Z",
  };

  it("should map user_id to userId", () => {
    expect(mapNotification(row).userId).toBe("u_emp");
  });

  it("should map null link to undefined", () => {
    expect(mapNotification({ ...row, link: null }).link).toBeUndefined();
  });

  it("should map read boolean", () => {
    expect(mapNotification(row).read).toBe(false);
    expect(mapNotification({ ...row, read: true }).read).toBe(true);
  });
});

// ─── mapWorkSettings ──────────────────────────────────────────────────────────
describe("mapWorkSettings", () => {
  const row: DbWorkSettingsRow = {
    id: true,
    working_days: [1, 2, 3, 4, 5],
    auto_backup_enabled: false,
    auto_backup_email: "",
    auto_backup_time: "22:00",
    last_auto_backup_date: null,
    updated_at: "2026-05-18T00:00:00Z",
  };

  it("should map working_days to workingDays array", () => {
    const ws = mapWorkSettings(row, []);
    expect(ws.workingDays).toEqual([1, 2, 3, 4, 5]);
  });

  it("should include mapped holidays", () => {
    const holidays = [{ date: "2026-12-25", label: "Christmas", created_at: "2026-01-01T00:00:00Z" }];
    const ws = mapWorkSettings(row, holidays);
    expect(ws.holidays).toHaveLength(1);
    expect(ws.holidays[0].date).toBe("2026-12-25");
  });

  it("should return empty holidays array when none provided", () => {
    expect(mapWorkSettings(row, []).holidays).toEqual([]);
  });

  it("should map project", () => {
    const projectRow: DbProjectRow = {
      id: "p_1",
      name: "Client Dashboard",
      description: "v2",
      department_id: "dept_dev",
      lead: "u_manager",
      owner_id: "u_admin",
      status: "in_progress",
      members: ["u_emp1", "u_emp2"],
      due_date: "2026-06-01",
      start_date: null,
      completed_at: null,
      progress: 45,
      created_at: "2026-01-01T00:00:00Z",
    };
    const p = mapProject(projectRow);
    expect(p.id).toBe("p_1");
    expect(p.status).toBe("in_progress");
    expect(p.members).toEqual(["u_emp1", "u_emp2"]);
    expect(p.progress).toBe(45);
    expect(p.lead).toBe("u_manager");
  });
});
