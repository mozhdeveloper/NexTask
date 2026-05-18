"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/lib/constants";

export function useHydrated() {
  const hydrated = useAuthStore((s) => s.hydrated);
  // Fallback: also flip after mount in case persist is sync
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return hydrated || mounted;
}

export function useAuth() {
  return useAuthStore((s) => s.user);
}

export function useRequireAuth() {
  const router = useRouter();
  const user = useAuth();
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);
  return { user, ready: hydrated && !!user };
}

export function useRequireRole(roles: Role[]) {
  const router = useRouter();
  const user = useAuth();
  const hydrated = useHydrated();
  // Freeze roles on first render — callers always pass a literal array
  const rolesRef = useRef(roles);
  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace("/login");
    else if (!rolesRef.current.includes(user.role)) router.replace("/dashboard");
  }, [hydrated, user, router]);
  return { user, ready: hydrated && !!user && (user ? rolesRef.current.includes(user.role) : false) };
}
