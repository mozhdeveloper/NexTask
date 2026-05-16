"use client";
import { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { cn } from "@/lib/utils";
import { useAutoBackup } from "@/hooks/useAutoBackup";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useAutoBackup();

  const handleToggle = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, inline on desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
          "lg:relative lg:z-auto lg:translate-x-0 lg:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <Sidebar collapsed={collapsed} onClose={() => setMobileOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onToggleSidebar={handleToggle} />
        <main className="flex-1 overflow-x-hidden bg-surface-subtle">
          <div className="mx-auto max-w-[1440px] p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

