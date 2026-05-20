// Database type stubs for the Supabase client.
// You can later regenerate this with: `supabase gen types typescript --project-id <ref>`.
// For now we expose just the column shapes we read/write so service code is typed.

export type DbUserRole = "admin" | "manager" | "employee";
export type DbSubmissionStatus =
  | "pending"
  | "submitted"
  | "late"       // legacy — no longer assigned, kept for DB compatibility
  | "revised"
  | "missing"
  | "revision_requested"
  | "revision_approved"
  | "revision_rejected"
  | "locked"
  | "excused";
export type DbRevisionStatus = "pending" | "approved" | "rejected" | "resubmitted";
export type DbProjectStatus = "planning" | "in_progress" | "review" | "completed" | "on_hold";
export type DbBackupStatus = "running" | "completed" | "failed";
export type DbNotificationType = "info" | "success" | "warning" | "danger";

export interface DbDepartmentRow {
  id: string;
  name: string;
  lead: string | null;
  description: string | null;
  created_at: string;
}

export interface DbUserRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: DbUserRole;
  department_id: string | null;
  job_title: string | null;
  avatar_color: string;
  is_active: boolean;
  created_at: string;
}

export interface DbSubmissionTypeRow {
  id: string;
  name: string;
  department_id: string | null;
  required_daily: boolean;
  deadline_time: string;
  allowed_file_types: string[];
  max_file_size_mb: number;
  max_files: number | null;
  is_active: boolean;
  created_at: string;
}

export interface DbSubmissionRow {
  id: string;
  user_id: string;
  submission_type_id: string;
  date: string;
  work_summary: string;
  tasks_details: string;
  status: DbSubmissionStatus;
  locked: boolean;
  submitted_at: string | null;
  locked_at: string | null;
  uploaded_ip: string | null;
  version_number: number;
  parent_submission_id: string | null;
  file_path: string;
  created_at: string;
  started_at: string | null;
  task_title: string | null;
}

export interface DbAttachmentRow {
  id: string;
  submission_id: string;
  original_name: string;
  stored_name: string;
  size_bytes: number;
  mime: string;
  hash_stub: string;
  storage_path: string | null;
  data_url: string | null;
  created_at: string;
}

export interface DbRevisionRow {
  id: string;
  submission_id: string;
  user_id: string;
  reason: string;
  status: DbRevisionStatus;
  admin_id: string | null;
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface DbActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface DbBackupLogRow {
  id: string;
  admin_id: string | null;
  file_name: string;
  file_path: string;
  size_bytes: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  status: DbBackupStatus;
}

export interface DbProjectRow {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  lead: string | null;
  owner_id: string | null;
  status: DbProjectStatus;
  members: string[];
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  revision_status: string | null;
  revision_requested_by: string | null;
  revision_note: string | null;
  created_at: string;
}

export interface DbNotificationRow {
  id: string;
  user_id: string;
  type: DbNotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface DbWorkSettingsRow {
  id: boolean;
  working_days: number[];
  auto_backup_enabled: boolean;
  auto_backup_email: string;
  auto_backup_time: string;
  last_auto_backup_date: string | null;
  updated_at: string;
  work_start_time: string;
  work_end_time: string;
  /** JSONB column storing per-role permission arrays. {} means use defaults. */
  permissions: Record<string, string[]> | null;
}

export interface DbHolidayRow {
  date: string;
  label: string;
  created_at: string;
}
