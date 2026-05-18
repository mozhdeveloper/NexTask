"use client";
import { useDataStore } from "@/store/dataStore";
import { useAuth } from "./useAuth";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/constants";

/**
 * Returns whether the current authenticated user has the given permission key.
 * Admin always has all permissions regardless of toggle state.
 */
export function usePermission(key: string): boolean {
  const user = useAuth();
  const permissions = useDataStore((s) => s.permissions);
  if (!user) return false;
  if (user.role === "admin") return true;
  return hasPermission(permissions, user.role, key);
}

export function useRolePermissions(role: Role): string[] {
  const permissions = useDataStore((s) => s.permissions);
  return permissions[role] ?? [];
}
