import type { Role, SubmissionStatus } from "@/lib/constants";

export type ID = string;

export interface User {
  id: ID;
  name: string;
  email: string;
  passwordHash: string; // mock: plain or simple hash
  role: Role;
  departmentId: ID | null;
  jobTitle?: string;
  avatarColor: string; // tailwind bg class
  isActive: boolean;
  createdAt: string;
}

export interface Department {
  id: ID;
  name: string;
  lead?: ID;
  description?: string;
  createdAt: string;
}

export interface SubmissionType {
  id: ID;
  name: string;
  departmentId: ID | null; // null = applies to all
  requiredDaily: boolean;
  deadlineTime: string; // "18:00"
  allowedFileTypes: string[];
  maxFileSizeMB: number;
  isActive: boolean;
}

export interface Attachment {
  id: ID;
  originalName: string;
  storedName: string;
  sizeBytes: number;
  mime: string;
  hashStub: string;
  dataUrl?: string; // only for tiny files
  storagePath?: string; // Supabase Storage path for large files
}

export interface Submission {
  id: ID;
  userId: ID;
  submissionTypeId: ID;
  date: string; // YYYY-MM-DD
  workSummary: string;
  tasksDetails: string;
  attachments: Attachment[];
  status: SubmissionStatus;
  locked: boolean;
  submittedAt: string | null;
  lockedAt: string | null;
  uploadedIp: string;
  versionNumber: number;
  parentSubmissionId: ID | null;
  filePath: string;
  startedAt?: string | null; // when employee clicked "Start day / Start task"
  taskTitle?: string | null; // optional headline shown to admins
}

export interface RevisionRequest {
  id: ID;
  submissionId: ID;
  userId: ID;
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminId?: ID;
  adminNote?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface ActivityLog {
  id: ID;
  userId: ID;
  action: string;
  targetType?: string;
  targetId?: ID | null;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface BackupLog {
  id: ID;
  adminId: ID;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  status: "running" | "completed" | "failed";
}

export interface Project {
  id: ID;
  name: string;
  description?: string;
  departmentId?: ID;
  lead?: ID;
  ownerId?: ID;
  status: "planning" | "in_progress" | "review" | "completed" | "on_hold";
  members?: ID[];
  startDate?: string;     // YYYY-MM-DD, optional
  dueDate?: string;       // YYYY-MM-DD, optional
  completedAt?: string;   // YYYY-MM-DD, set when status → completed
  progress?: number;
  revisionStatus?: "pending" | "approved" | "rejected";
  revisionRequestedBy?: string;
  revisionNote?: string;
  createdAt: string;
}

export interface Notification {
  id: ID;
  userId: ID; // recipient
  type: "info" | "success" | "warning" | "danger";
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  label: string;
}

export interface WorkSettings {
  workingDays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  holidays: Holiday[];
  workStartTime: string; // "HH:mm" — earliest expected submission window
  workEndTime: string;   // "HH:mm" — after this, missing submissions are marked
}

export interface AutoBackupSettings {
  enabled: boolean;
  email: string;
  time: string; // "22:00"
  lastAutoBackupDate: string | null;
}
