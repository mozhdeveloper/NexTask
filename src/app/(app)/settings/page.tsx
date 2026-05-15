"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { toast } from "sonner";
import { Label } from "@/components/ui/input";

export default function SettingsPage() {
  const reset = useDataStore((s) => s.reset);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Workspace preferences and demo data controls." />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Visual options for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Theme</Label>
          <p className="text-sm text-ink-muted">Light theme is currently active. Dark mode is coming soon.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>How NexTask alerts you about activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-md bg-surface-subtle px-3 py-2">In-app toast notifications <span className="text-ink-muted">Enabled</span></li>
            <li className="flex items-center justify-between rounded-md bg-surface-subtle px-3 py-2">Bell badge for unread items <span className="text-ink-muted">Enabled</span></li>
            <li className="flex items-center justify-between rounded-md bg-surface-subtle px-3 py-2">Email digests <span className="text-ink-muted">Coming soon</span></li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo data</CardTitle>
          <CardDescription>Reset the workspace to its initial seeded state.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">All users, submissions, revisions, projects, and logs will be regenerated.</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset demo data</Button>
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="This will clear all changes you’ve made in this session and return the workspace to defaults. You will be signed out."
        confirmLabel="Reset and sign out"
        destructive
        onConfirm={() => {
          reset();
          setUser(null);
          toast.success("Demo data reset.");
          router.replace("/login");
        }}
      />
    </div>
  );
}
