// Test data factories — use these instead of hardcoded literals.
// Each factory accepts overrides so tests stay declarative about what matters.

import type {
  User,
  Submission,
  RevisionRequest,
  Notification,
  Project,
  WorkSettings,
  Holiday,
  ActivityLog,
  BackupLog,
  Department,
  SubmissionType,
} from "@/types";

let seq = 0;
const next = () => ++seq;

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: `u_test_${next()}`,
  name: `Test User ${seq}`,
  email: `testuser${seq}@example.com`,
  passwordHash: "",
  role: "employee",
  departmentId: "dept_dev",
  jobTitle: "Engineer",
  avatarColor: "bg-teal-500",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const createAdmin = (overrides: Partial<User> = {}): User =>
  createUser({ role: "admin", email: `admin${next()}@example.com`, ...overrides });

export const createDepartment = (overrides: Partial<Department> = {}): Department => ({
  id: `dept_test_${next()}`,
  name: `Department ${seq}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const createSubmissionType = (overrides: Partial<SubmissionType> = {}): SubmissionType => ({
  id: `st_test_${next()}`,
  name: `Type ${seq}`,
  departmentId: null,
  requiredDaily: true,
  deadlineTime: "18:00",
  allowedFileTypes: ["pdf", "docx", "png"],
  maxFileSizeMB: 10,
  isActive: true,
  ...overrides,
});

export const createSubmission = (overrides: Partial<Submission> = {}): Submission => ({
  id: `sub_test_${next()}`,
  userId: "u_employee",
  submissionTypeId: "st_test_1",
  date: "2026-05-18",
  workSummary: "Worked on feature X",
  tasksDetails: "Task A, Task B",
  attachments: [],
  status: "submitted",
  locked: true,
  submittedAt: "2026-05-18T14:00:00.000Z",
  lockedAt: "2026-05-18T14:00:00.000Z",
  uploadedIp: "192.168.0.1",
  versionNumber: 1,
  parentSubmissionId: null,
  filePath: "employees/test/2026/05-May/18/test_file.pdf",
  ...overrides,
});

export const createRevision = (overrides: Partial<RevisionRequest> = {}): RevisionRequest => ({
  id: `rev_test_${next()}`,
  submissionId: "sub_test_1",
  userId: "u_employee",
  reason: "Please allow me to fix the attachment",
  status: "pending",
  createdAt: "2026-05-18T10:00:00.000Z",
  ...overrides,
});

export const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: `ntf_test_${next()}`,
  userId: "u_employee",
  type: "info",
  title: "Test notification",
  body: "This is a test",
  read: false,
  createdAt: "2026-05-18T10:00:00.000Z",
  ...overrides,
});

export const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: `proj_test_${next()}`,
  name: `Project ${seq}`,
  status: "planning",
  createdAt: "2026-05-18T10:00:00.000Z",
  ...overrides,
});

export const createWorkSettings = (overrides: Partial<WorkSettings> = {}): WorkSettings => ({
  workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  holidays: [],
  workStartTime: "09:00",
  workEndTime: "18:00",
  ...overrides,
});

export const createHoliday = (overrides: Partial<Holiday> = {}): Holiday => ({
  date: "2026-12-25",
  label: "Christmas",
  ...overrides,
});

export const createActivityLog = (overrides: Partial<ActivityLog> = {}): ActivityLog => ({
  id: `log_test_${next()}`,
  userId: "u_admin",
  action: "test.action",
  targetType: "test",
  targetId: null,
  ip: "192.168.1.1",
  userAgent: "TestAgent/1.0",
  createdAt: "2026-05-18T10:00:00.000Z",
  ...overrides,
});

export const createBackupLog = (overrides: Partial<BackupLog> = {}): BackupLog => ({
  id: `bkp_test_${next()}`,
  adminId: "u_admin",
  fileName: `backup_${seq}.zip`,
  filePath: `D:\\backups\\backup_${seq}.zip`,
  sizeBytes: 26000000,
  startedAt: "2026-05-18T22:00:00.000Z",
  completedAt: "2026-05-18T22:00:03.000Z",
  createdAt: "2026-05-18T22:00:00.000Z",
  status: "completed",
  ...overrides,
});
