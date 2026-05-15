import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { Project } from "@/types";
import { uid } from "@/lib/helpers";
import { nowISO } from "@/lib/dates";
import { logService } from "./log.service";

export const projectService = {
  list() {
    return useDataStore.getState().projects;
  },
  create(input: Omit<Project, "id" | "createdAt">) {
    const me = useAuthStore.getState().user;
    if (!me) throw new Error("Forbidden");
    const { projects, setProjects } = useDataStore.getState();
    const p: Project = { id: uid("p"), createdAt: nowISO(), ...input };
    setProjects([p, ...projects]);
    logService.append({ userId: me.id, action: "project.create", targetType: "project", targetId: p.id });
    return p;
  },
  update(id: string, patch: Partial<Project>) {
    const { projects, setProjects } = useDataStore.getState();
    setProjects(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  },
};
