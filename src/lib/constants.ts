export const APP_NAME = "NexTask";
export const APP_TAGLINE = "Effortless work submissions for the modern office.";
export const COMPANY = "NexVision Innovations";

export const ROLES = ["admin", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  "pending",
  "submitted",
  "late",
  "missing",
  "revision_requested",
  "revision_approved",
  "revision_rejected",
  "locked",
] as const;
export type SubmissionStatus = (typeof STATUSES)[number];

export const ALLOWED_FILE_TYPES = [
  "xlsx",
  "xls",
  "csv",
  "pdf",
  "docx",
  "doc",
  "jpg",
  "jpeg",
  "png",
];

export const MAX_FILE_SIZE_MB = 10;
export const MAX_INLINE_DATA_URL_BYTES = 1024 * 1024; // 1MB

export const DEMO_ACCOUNTS = [
  { role: "admin", email: "admin@nexvision.local", password: "password123", label: "Admin" },
  { role: "manager", email: "manager@nexvision.local", password: "password123", label: "Manager" },
  { role: "employee", email: "employee@nexvision.local", password: "password123", label: "Employee" },
] as const;

export const STORAGE_PREFIX = "nextask:";
