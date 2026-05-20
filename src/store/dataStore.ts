import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  WorkSettings,
  AutoBackupSettings,
} from "@/types";
import {
  seedUsers,
  seedDepartments,
  seedSubmissionTypes,
  seedSubmissions,
  seedRevisions,
  seedActivityLogs,
  seedBackupLogs,
  seedProjects,
  seedNotifications,
} from "@/mock-data/seed";
import { STORAGE_PREFIX } from "@/lib/constants";
import type { Role } from "@/lib/constants";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

interface DataState {
  users: User[];
  departments: Department[];
  submissionTypes: SubmissionType[];
  submissions: Submission[];
  revisions: RevisionRequest[];
  logs: ActivityLog[];
  backups: BackupLog[];
  projects: Project[];
  notifications: Notification[];
  workSettings: WorkSettings;
  autoBackupSettings: AutoBackupSettings;
  permissions: Record<Role, string[]>;
  hydrated: boolean;

  setUsers: (u: User[]) => void;
  setSubmissionTypes: (t: SubmissionType[]) => void;
  setSubmissions: (s: Submission[]) => void;
  setRevisions: (r: RevisionRequest[]) => void;
  setBackups: (b: BackupLog[]) => void;
  setProjects: (p: Project[]) => void;
  setNotifications: (n: Notification[]) => void;
  setLogs: (l: ActivityLog[]) => void;
  setWorkSettings: (s: WorkSettings) => void;
  setAutoBackupSettings: (s: AutoBackupSettings) => void;
  setPermissions: (p: Record<Role, string[]>) => void;
  reset: () => void;
}

const initial = () => ({
  users: seedUsers,
  departments: seedDepartments,
  submissionTypes: seedSubmissionTypes,
  submissions: seedSubmissions,
  revisions: seedRevisions,
  logs: seedActivityLogs,
  backups: seedBackupLogs,
  projects: seedProjects,
  notifications: seedNotifications,
  workSettings: {
    workingDays: [1, 2, 3, 4, 5], // Mon–Fri
    holidays: [] as WorkSettings["holidays"],
    workStartTime: "09:00",
    workEndTime: "18:00",
  } as WorkSettings,
  autoBackupSettings: {
    enabled: false,
    email: "",
    time: "22:00",
    lastAutoBackupDate: null,
  } as AutoBackupSettings,
  permissions: { ...DEFAULT_PERMISSIONS },
});

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      ...initial(),
      hydrated: false,
      setUsers: (users) => set({ users }),
      setSubmissionTypes: (submissionTypes) => set({ submissionTypes }),
      setSubmissions: (submissions) => set({ submissions }),
      setRevisions: (revisions) => set({ revisions }),
      setBackups: (backups) => set({ backups }),
      setProjects: (projects) => set({ projects }),
      setNotifications: (notifications) => set({ notifications }),
      setLogs: (logs) => set({ logs }),
      setWorkSettings: (workSettings) => set({ workSettings }),
      setAutoBackupSettings: (autoBackupSettings) => set({ autoBackupSettings }),
      setPermissions: (permissions) => set({ permissions }),
      reset: () => set({ ...initial() }),
    }),
    {
      name: `${STORAGE_PREFIX}data`,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // Only persist lightweight settings — bulk data (submissions, logs, users etc.)
      // is always fetched fresh from Supabase on boot, so storing it in localStorage
      // wastes quota (5 MB limit) and causes stale-data flickering.
      partialize: (state) => ({
        workSettings: state.workSettings,
        autoBackupSettings: state.autoBackupSettings,
        permissions: state.permissions,
      }),
      // Deep-merge so partial stored data never wipes required fields.
      // e.g. an old stored { holidays: [] } won't erase workingDays from the default.
      merge: (persisted: unknown, current: DataState): DataState => {
        const p = (persisted ?? {}) as Partial<DataState>;
        const def = initial();
        return {
          ...current,
          workSettings: { ...def.workSettings, ...(p.workSettings ?? {}) },
          autoBackupSettings: { ...def.autoBackupSettings, ...(p.autoBackupSettings ?? {}) },
          permissions: p.permissions ?? current.permissions,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
