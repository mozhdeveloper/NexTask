import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { logService } from "./log.service";

export const authService = {
  login(email: string, password: string) {
    const users = useDataStore.getState().users;
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === password
    );
    if (!user) throw new Error("Invalid email or password.");
    if (!user.isActive) throw new Error("This account is disabled.");
    useAuthStore.getState().setUser(user);
    logService.append({
      userId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: null,
    });
    return user;
  },
  logout() {
    const u = useAuthStore.getState().user;
    if (u) {
      logService.append({
        userId: u.id,
        action: "auth.logout",
        targetType: "session",
        targetId: null,
      });
    }
    useAuthStore.getState().setUser(null);
  },
  me() {
    return useAuthStore.getState().user;
  },
};
