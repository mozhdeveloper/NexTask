// Map snake_case Supabase rows ↔ camelCase domain types used throughout the app.
// Keeping mappers centralised means service-layer code stays clean and pages don't change.

import type {
  Attachment,
  BackupLog,
  Department,
  Notification,
  Project,
  RevisionRequest,
  Submission,
  SubmissionType,
  User,
  Holiday,
  WorkSettings,
  AutoBackupSettings,
  ActivityLog,
} from "@/types";
import type {
  DbAttachmentRow,
  DbBackupLogRow,
  DbDepartmentRow,
  DbNotificationRow,
  DbProjectRow,
  DbRevisionRow,
  DbSubmissionRow,
  DbSubmissionTypeRow,
  DbUserRow,
  DbHolidayRow,
  DbWorkSettingsRow,
  DbActivityLogRow,
} from "./types";

export const mapUser = (r: DbUserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: "", // not stored client-side; Supabase Auth owns credentials
  role: r.role,
  departmentId: r.department_id,
  jobTitle: r.job_title ?? undefined,
  avatarColor: r.avatar_color,
  isActive: r.is_active,
  createdAt: r.created_at,
});

export const mapDepartment = (r: DbDepartmentRow): Department => ({
  id: r.id,
  name: r.name,
  lead: r.lead ?? undefined,
  description: r.description ?? undefined,
  createdAt: r.created_at,
});

export const mapSubmissionType = (r: DbSubmissionTypeRow): SubmissionType => ({
  id: r.id,
  name: r.name,
  departmentId: r.department_id,
  requiredDaily: r.required_daily,
  deadlineTime: r.deadline_time?.slice(0, 5) ?? "18:00",
  allowedFileTypes: r.allowed_file_types ?? [],
  maxFileSizeMB: r.max_file_size_mb,
  isActive: r.is_active,
});

export const mapAttachment = (r: DbAttachmentRow): Attachment => ({
  id: r.id,
  originalName: r.original_name,
  storedName: r.stored_name,
  sizeBytes: r.size_bytes,
  mime: r.mime,
  hashStub: r.hash_stub,
  dataUrl: r.data_url ?? undefined,
  storagePath: r.storage_path ?? undefined,
});

export const mapSubmission = (
  r: DbSubmissionRow,
  attachments: DbAttachmentRow[] = []
): Submission => ({
  id: r.id,
  userId: r.user_id,
  submissionTypeId: r.submission_type_id,
  date: r.date,
  workSummary: r.work_summary,
  tasksDetails: r.tasks_details,
  attachments: attachments.map(mapAttachment),
  status: r.status,
  locked: r.locked,
  submittedAt: r.submitted_at,
  lockedAt: r.locked_at,
  uploadedIp: r.uploaded_ip ?? "",
  versionNumber: r.version_number,
  parentSubmissionId: r.parent_submission_id,
  filePath: r.file_path,
});

export const mapRevision = (r: DbRevisionRow): RevisionRequest => ({
  id: r.id,
  submissionId: r.submission_id,
  userId: r.user_id,
  reason: r.reason,
  status: r.status,
  adminId: r.admin_id ?? undefined,
  adminNote: r.admin_note ?? undefined,
  createdAt: r.created_at,
  decidedAt: r.decided_at ?? undefined,
});

export const mapActivityLog = (r: DbActivityLogRow): ActivityLog => ({
  id: r.id,
  userId: r.user_id ?? "",
  action: r.action,
  targetType: r.target_type ?? undefined,
  targetId: r.target_id ?? null,
  ip: r.ip ?? undefined,
  userAgent: r.user_agent ?? undefined,
  createdAt: r.created_at,
});

export const mapBackupLog = (r: DbBackupLogRow): BackupLog => ({
  id: r.id,
  adminId: r.admin_id ?? "",
  fileName: r.file_name,
  filePath: r.file_path,
  sizeBytes: r.size_bytes,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  status: r.status,
});

export const mapProject = (r: DbProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  departmentId: r.department_id ?? undefined,
  lead: r.lead ?? undefined,
  ownerId: r.owner_id ?? undefined,
  status: r.status,
  members: r.members ?? [],
  dueDate: r.due_date ?? undefined,
  progress: r.progress ?? undefined,
  createdAt: r.created_at,
});

export const mapNotification = (r: DbNotificationRow): Notification => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  title: r.title,
  body: r.body,
  link: r.link ?? undefined,
  read: r.read,
  createdAt: r.created_at,
});

export const mapHoliday = (r: DbHolidayRow): Holiday => ({
  date: r.date,
  label: r.label,
});

export const mapWorkSettings = (
  ws: DbWorkSettingsRow | null,
  holidays: DbHolidayRow[]
): WorkSettings => ({
  workingDays: ws?.working_days ?? [1, 2, 3, 4, 5],
  holidays: holidays.map(mapHoliday),
});

export const mapAutoBackupSettings = (
  ws: DbWorkSettingsRow | null
): AutoBackupSettings => ({
  enabled: ws?.auto_backup_enabled ?? false,
  email: ws?.auto_backup_email ?? "",
  time: ws?.auto_backup_time?.slice(0, 5) ?? "22:00",
  lastAutoBackupDate: ws?.last_auto_backup_date ?? null,
});
