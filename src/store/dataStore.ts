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
  } as WorkSettings,
  autoBackupSettings: {
    enabled: false,
    email: "",
    time: "22:00",
    lastAutoBackupDate: null,
  } as AutoBackupSettings,
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
      reset: () => set({ ...initial() }),
    }),
    {
      name: `${STORAGE_PREFIX}data`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
