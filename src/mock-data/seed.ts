import type {
  User,
  Department,
  SubmissionType,
  Submission,
  RevisionRequest,
  ActivityLog,
  BackupLog,
  Project,
  Notification,
} from "@/types";
import { AVATAR_COLORS } from "@/lib/status";
import { backupFileName, buildSubmissionPath, hashStub, pseudoIp } from "@/lib/helpers";

// Deterministic "today" anchor for seed data
const NOW = new Date();
const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
};

export const seedDepartments: Department[] = [
  { id: "dept_dev", name: "Development", createdAt: iso(daysAgo(120)) },
  { id: "dept_design", name: "Design", createdAt: iso(daysAgo(120)) },
  { id: "dept_marketing", name: "Marketing", createdAt: iso(daysAgo(120)) },
  { id: "dept_sales", name: "Sales", createdAt: iso(daysAgo(120)) },
  { id: "dept_hr", name: "HR", createdAt: iso(daysAgo(120)) },
  { id: "dept_ops", name: "Operations", createdAt: iso(daysAgo(120)) },
];

export const seedUsers: User[] = [
  {
    id: "u_admin",
    name: "Admin",
    email: "admin@nexvision.local",
    passwordHash: "password123",
    role: "admin",
    departmentId: "dept_ops",
    jobTitle: "Administrator",
    avatarColor: "bg-ink",
    isActive: true,
    createdAt: iso(daysAgo(200)),
  },
  {
    id: "u_manager",
    name: "Sarah Lee",
    email: "manager@nexvision.local",
    passwordHash: "password123",
    role: "manager",
    departmentId: "dept_dev",
    jobTitle: "Engineering Manager",
    avatarColor: "bg-violet-500",
    isActive: true,
    createdAt: iso(daysAgo(180)),
  },
  {
    id: "u_employee",
    name: "John Doe",
    email: "employee@nexvision.local",
    passwordHash: "password123",
    role: "employee",
    departmentId: "dept_dev",
    jobTitle: "Senior Developer",
    avatarColor: "bg-emerald-500",
    isActive: true,
    createdAt: iso(daysAgo(160)),
  },
];

const namePool: Array<[string, string, keyof typeof DEPT_KEY]> = [
  ["Sarah Miller", "sarah.miller", "dev"],
  ["Robert King", "robert.king", "dev"],
  ["Priya White", "priya.white", "design"],
  ["Michael Scott", "michael.scott", "marketing"],
  ["Alex Turner", "alex.turner", "dev"],
  ["Emily Carter", "emily.carter", "design"],
  ["David Kim", "david.kim", "sales"],
  ["Lisa Wong", "lisa.wong", "hr"],
  ["Marcus Reed", "marcus.reed", "ops"],
  ["Hannah Patel", "hannah.patel", "marketing"],
  ["Tom Becker", "tom.becker", "sales"],
  ["Olivia Brown", "olivia.brown", "design"],
  ["Noah Adams", "noah.adams", "dev"],
  ["Mia Foster", "mia.foster", "hr"],
];

const DEPT_KEY = {
  dev: "dept_dev",
  design: "dept_design",
  marketing: "dept_marketing",
  sales: "dept_sales",
  hr: "dept_hr",
  ops: "dept_ops",
} as const;

namePool.forEach(([name, slug, dKey], i) => {
  seedUsers.push({
    id: `u_${slug.replace(".", "_")}`,
    name,
    email: `${slug}@nexvision.local`,
    passwordHash: "password123",
    role: i === 0 ? "manager" : "employee",
    departmentId: DEPT_KEY[dKey],
    jobTitle: i % 2 === 0 ? "Specialist" : "Associate",
    avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
    isActive: i !== namePool.length - 1, // last one inactive for demo
    createdAt: iso(daysAgo(60 + i * 3)),
  });
});

export const seedSubmissionTypes: SubmissionType[] = [
  {
    id: "st_daily",
    name: "Daily Work Log",
    departmentId: null,
    requiredDaily: true,
    deadlineTime: "18:00",
    allowedFileTypes: ["pdf", "docx", "xlsx", "csv", "png", "jpg"],
    maxFileSizeMB: 10,
    isActive: true,
  },
  {
    id: "st_inventory",
    name: "Inventory Sheet",
    departmentId: "dept_ops",
    requiredDaily: true,
    deadlineTime: "17:00",
    allowedFileTypes: ["xlsx", "xls", "csv"],
    maxFileSizeMB: 8,
    isActive: true,
  },
  {
    id: "st_design_brief",
    name: "Design Brief",
    departmentId: "dept_design",
    requiredDaily: false,
    deadlineTime: "19:00",
    allowedFileTypes: ["pdf", "png", "jpg"],
    maxFileSizeMB: 10,
    isActive: true,
  },
  {
    id: "st_sales",
    name: "Sales Pipeline Report",
    departmentId: "dept_sales",
    requiredDaily: true,
    deadlineTime: "18:30",
    allowedFileTypes: ["xlsx", "pdf", "csv"],
    maxFileSizeMB: 10,
    isActive: true,
  },
  {
    id: "st_weekly",
    name: "Weekly Summary",
    departmentId: null,
    requiredDaily: false,
    deadlineTime: "17:00",
    allowedFileTypes: ["pdf", "docx"],
    maxFileSizeMB: 6,
    isActive: true,
  },
];

const sampleSummaries = [
  "Worked on client dashboard UI and fixed responsive issues.",
  "API integration and bug fixes in payment module.",
  "Database optimization and report generation.",
  "Working on landing page design.",
  "Mobile app responsive and performance fixes.",
  "Refactored auth flow and added test coverage.",
  "QA pass on the new onboarding wizard.",
  "Pipeline review and lead enrichment.",
  "Inventory reconciliation and supplier outreach.",
  "Brand guideline draft and component audit.",
];

const sampleTasks = [
  "Fixed sidebar collapse, finalized stat-card spacing, paired with QA.",
  "Closed PR #482, deployed to staging, monitoring metrics.",
  "Wrote 12 new unit tests, 3 e2e specs, all green.",
  "Reviewed 4 PRs, gave detailed feedback, merged 2.",
  "Synced with stakeholders, updated roadmap, prepared demo.",
];

export const seedSubmissions: Submission[] = [];
const employees = seedUsers.filter((u) => u.role !== "admin");
for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
  const date = ymd(daysAgo(dayOffset));
  employees.forEach((u, i) => {
    const r = (dayOffset * 7 + i) % 10;
    let status: Submission["status"] = "submitted";
    if (dayOffset === 0 && r < 3) status = "pending";
    else if (dayOffset === 0 && r === 3) status = "missing";
    else if (r === 4) status = "late";
    else if (r === 5) status = "revision_requested";
    else if (r === 6) status = "revision_approved";

    if (status === "pending" || status === "missing") {
      // create empty pending row
      seedSubmissions.push({
        id: `sub_${u.id}_${date}`,
        userId: u.id,
        submissionTypeId: "st_daily",
        date,
        workSummary: "",
        tasksDetails: "",
        attachments: [],
        status,
        locked: false,
        submittedAt: null,
        lockedAt: null,
        uploadedIp: pseudoIp(u.id + date),
        versionNumber: 1,
        parentSubmissionId: null,
        filePath: "",
      });
      return;
    }

    const submittedDate = new Date(daysAgo(dayOffset));
    submittedDate.setHours(status === "late" ? 19 : 9 + (i % 8), 30 + i, 0, 0);
    const submittedAt = submittedDate.toISOString();
    const summary = sampleSummaries[(dayOffset + i) % sampleSummaries.length];
    const tasks = sampleTasks[(dayOffset + i) % sampleTasks.length];
    const fileName = `${u.name.split(" ")[0].toLowerCase()}_log_${date}.pdf`;
    seedSubmissions.push({
      id: `sub_${u.id}_${date}`,
      userId: u.id,
      submissionTypeId: "st_daily",
      date,
      workSummary: summary,
      tasksDetails: tasks,
      attachments: [
        {
          id: `att_${hashStub(u.id + date)}`,
          originalName: fileName,
          storedName: fileName,
          sizeBytes: 80_000 + ((i * 1234) % 600_000),
          mime: "application/pdf",
          hashStub: hashStub(u.id + date + fileName),
        },
      ],
      status,
      locked: status === "submitted" || status === "revision_approved",
      submittedAt,
      lockedAt: submittedAt,
      uploadedIp: pseudoIp(u.id + date),
      versionNumber: status === "revision_approved" ? 2 : 1,
      parentSubmissionId: null,
      filePath: buildSubmissionPath({
        username: u.name.split(" ")[0].toLowerCase(),
        date,
        fileName,
        submittedAt,
      }),
    });
  });
}

export const seedRevisions: RevisionRequest[] = seedSubmissions
  .filter((s) => s.status === "revision_requested" || s.status === "revision_approved")
  .slice(0, 8)
  .map((s, i) => ({
    id: `rev_${s.id}`,
    submissionId: s.id,
    userId: s.userId,
    reason:
      i % 2 === 0
        ? "Uploaded the wrong version of the file, please allow re-upload."
        : "Need to update the work summary with the latest figures.",
    status: s.status === "revision_approved" ? "approved" : "pending",
    adminId: s.status === "revision_approved" ? "u_admin" : undefined,
    adminNote: s.status === "revision_approved" ? "Approved — re-upload allowed." : undefined,
    createdAt: s.submittedAt ?? iso(NOW),
    decidedAt: s.status === "revision_approved" ? iso(NOW) : undefined,
  }));

export const seedActivityLogs: ActivityLog[] = [];
seedSubmissions.slice(0, 30).forEach((s, i) => {
  if (!s.submittedAt) return;
  seedActivityLogs.push({
    id: `log_${i}`,
    userId: s.userId,
    action: "submission.upload",
    targetType: "submission",
    targetId: s.id,
    ip: s.uploadedIp,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    createdAt: s.submittedAt,
  });
});
seedRevisions.forEach((r, i) => {
  seedActivityLogs.push({
    id: `log_rev_${i}`,
    userId: r.userId,
    action: "revision.request",
    targetType: "revision",
    targetId: r.id,
    ip: pseudoIp(r.id),
    userAgent: "Mozilla/5.0 Chrome/120",
    createdAt: r.createdAt,
  });
});
seedActivityLogs.push(
  {
    id: "log_login_admin",
    userId: "u_admin",
    action: "auth.login",
    targetType: "session",
    targetId: null,
    ip: "192.168.1.10",
    userAgent: "Mozilla/5.0 Chrome/120",
    createdAt: iso(daysAgo(0)),
  },
  {
    id: "log_login_emp",
    userId: "u_employee",
    action: "auth.login",
    targetType: "session",
    targetId: null,
    ip: "192.168.1.42",
    userAgent: "Mozilla/5.0 Chrome/120",
    createdAt: iso(daysAgo(0)),
  }
);

export const seedBackupLogs: BackupLog[] = [0, 1, 2].map((n) => {
  const start = daysAgo(n);
  start.setHours(23, 30, 0, 0);
  const end = new Date(start.getTime() + 4500);
  return {
    id: `bk_${n}`,
    adminId: "u_admin",
    fileName: backupFileName(start),
    filePath: `D:\\OfficeSystemStorage\\backups\\${backupFileName(start)}`,
    sizeBytes: 28_000_000 + n * 1_500_000,
    startedAt: iso(start),
    completedAt: iso(end),
    createdAt: iso(start),
    status: "completed",
  };
});

export const seedProjects: Project[] = [
  {
    id: "p_dashboard",
    name: "Client Dashboard v2",
    departmentId: "dept_dev",
    lead: "u_manager",
    status: "in_progress",
    members: ["u_employee", "u_sarah_miller", "u_robert_king"],
    dueDate: ymd(daysAgo(-21)),
    createdAt: iso(daysAgo(45)),
  },
  {
    id: "p_brand",
    name: "Brand Refresh",
    departmentId: "dept_design",
    lead: "u_priya_white",
    status: "review",
    members: ["u_priya_white", "u_emily_carter", "u_olivia_brown"],
    dueDate: ymd(daysAgo(-7)),
    createdAt: iso(daysAgo(60)),
  },
  {
    id: "p_pipeline",
    name: "Sales Pipeline Automation",
    departmentId: "dept_sales",
    lead: "u_david_kim",
    status: "planning",
    members: ["u_david_kim", "u_tom_becker"],
    dueDate: ymd(daysAgo(-40)),
    createdAt: iso(daysAgo(20)),
  },
  {
    id: "p_onboard",
    name: "Onboarding Wizard",
    departmentId: "dept_hr",
    lead: "u_lisa_wong",
    status: "completed",
    members: ["u_lisa_wong", "u_mia_foster"],
    dueDate: ymd(daysAgo(7)),
    createdAt: iso(daysAgo(80)),
  },
  {
    id: "p_compliance",
    name: "Compliance Audit Q2",
    departmentId: "dept_ops",
    lead: "u_marcus_reed",
    status: "on_hold",
    members: ["u_marcus_reed", "u_admin"],
    dueDate: ymd(daysAgo(-50)),
    createdAt: iso(daysAgo(30)),
  },
];

export const seedNotifications: Notification[] = [
  {
    id: "n1",
    userId: "u_admin",
    type: "warning",
    title: "4 overdue submissions",
    body: "Action required across Design and Development.",
    link: "/admin/submissions",
    read: false,
    createdAt: iso(daysAgo(0)),
  },
  {
    id: "n2",
    userId: "u_admin",
    type: "info",
    title: "New revision request",
    body: "Sarah Miller requested a revision for May log.",
    link: "/admin/revisions",
    read: false,
    createdAt: iso(daysAgo(0)),
  },
  {
    id: "n3",
    userId: "u_admin",
    type: "success",
    title: "Backup completed",
    body: "Nightly backup finished successfully.",
    link: "/admin/backups",
    read: true,
    createdAt: iso(daysAgo(1)),
  },
  {
    id: "n4",
    userId: "u_employee",
    type: "info",
    title: "Welcome back, John",
    body: "You have submitted 5 of 5 days this week.",
    read: false,
    createdAt: iso(daysAgo(0)),
  },
  {
    id: "n5",
    userId: "u_employee",
    type: "success",
    title: "Revision approved",
    body: "Your revision request was approved.",
    link: "/my-submissions",
    read: false,
    createdAt: iso(daysAgo(1)),
  },
  {
    id: "n6",
    userId: "u_manager",
    type: "info",
    title: "Department compliance 88.6%",
    body: "Development department is on track.",
    link: "/reports",
    read: false,
    createdAt: iso(daysAgo(0)),
  },
];
