import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";
import { uid } from "@/lib/helpers";
import { nowISO } from "@/lib/dates";
import { AVATAR_COLORS } from "@/lib/status";
import { logService } from "./log.service";

export const userService = {
  list() {
    return useDataStore.getState().users;
  },
  get(id: string) {
    return useDataStore.getState().users.find((u) => u.id === id) ?? null;
  },
  create(input: Omit<User, "id" | "createdAt" | "avatarColor" | "isActive" | "passwordHash"> & { password?: string }) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { users, setUsers } = useDataStore.getState();
    if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase()))
      throw new Error("Email already exists");
    const u: User = {
      id: uid("u"),
      passwordHash: input.password || "password123",
      avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
      isActive: true,
      createdAt: nowISO(),
      ...input,
    };
    setUsers([u, ...users]);
    logService.append({ userId: me.id, action: "user.create", targetType: "user", targetId: u.id });
    return u;
  },
  update(id: string, patch: Partial<User>) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { users, setUsers } = useDataStore.getState();
    setUsers(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    logService.append({ userId: me.id, action: "user.update", targetType: "user", targetId: id });
  },
  toggleActive(id: string) {
    const me = useAuthStore.getState().user;
    if (!me || me.role !== "admin") throw new Error("Forbidden");
    const { users, setUsers } = useDataStore.getState();
    setUsers(users.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u)));
    logService.append({
      userId: me.id,
      action: "user.toggle_active",
      targetType: "user",
      targetId: id,
    });
  },
};
