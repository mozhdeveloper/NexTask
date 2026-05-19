"use client";
import { useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { cn } from "@/lib/utils";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { useBootstrap } from "@/hooks/useBootstrap";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useBootstrap();
  useAutoBackup();

  const handleToggle = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, sticky flex column on desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
          "lg:relative lg:z-auto lg:translate-x-0 lg:transition-none lg:flex-shrink-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <Sidebar collapsed={collapsed} onClose={() => setMobileOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onToggleSidebar={handleToggle} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-surface-subtle">
          <div className="mx-auto max-w-[1440px] p-4 pb-24 md:p-6 lg:pb-6">{children}</div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

