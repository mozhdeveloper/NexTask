"use client";
import { AppShell } from "@/components/layouts/AppShell";
import { useRequireAuth } from "@/hooks/useAuth";
import { useDataBootstrap } from "@/hooks/useDataBootstrap";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth();
  useDataBootstrap();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
