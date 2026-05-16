"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { workSettingsService } from "@/services/workSettings.service";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const reset = useDataStore((s) => s.reset);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const user = useAuth();
  const workSettings = useDataStore((s) => s.workSettings);
  const setWorkSettings = useDataStore((s) => s.setWorkSettings);
  const autoBackupSettings = useDataStore((s) => s.autoBackupSettings);
  const setAutoBackupSettings = useDataStore((s) => s.setAutoBackupSettings);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const toggleDay = (day: number) => {
    const days = workSettings.workingDays.includes(day)
      ? workSettings.workingDays.filter((d) => d !== day)
      : [...workSettings.workingDays, day].sort();
    setWorkSettings({ ...workSettings, workingDays: days });
    toast.success("Working days updated.");
  };

  const addHoliday = () => {
    if (!newHolidayDate) return toast.error("Select a date.");
    if (!newHolidayLabel.trim()) return toast.error("Add a label (e.g. Public Holiday).");
    workSettingsService.addHoliday(newHolidayDate, newHolidayLabel.trim());
    setNewHolidayDate("");
    setNewHolidayLabel("");
    toast.success("Holiday added.");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Workspace preferences and configuration." />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Visual options for your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">Light theme is active. Dark mode coming soon.</p>
        </CardContent>
      </Card>

      {/* ── Auto-backup ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <CardTitle>Automatic Daily Backup</CardTitle>
            <CardDescription>
              Schedule a backup every day at a set time. When triggered, the backup file downloads
              automatically and a mailto draft opens for sending it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={autoBackupSettings.enabled}
                onClick={() =>
                  setAutoBackupSettings({ ...autoBackupSettings, enabled: !autoBackupSettings.enabled })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoBackupSettings.enabled ? "bg-primary" : "bg-surface-border"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow transition-transform ${
                    autoBackupSettings.enabled ? "translate-x-6" : ""
                  }`}
                />
              </button>
              <span className="text-sm font-medium">
                {autoBackupSettings.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            {autoBackupSettings.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Backup time</Label>
                  <Input
                    type="time"
                    value={autoBackupSettings.time}
                    onChange={(e) =>
                      setAutoBackupSettings({ ...autoBackupSettings, time: e.target.value })
                    }
                  />
                  <p className="text-xs text-ink-muted">
                    Triggers while the app is open in the browser.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Recipient email</Label>
                  <Input
                    type="email"
                    placeholder="admin@nexvision.local"
                    value={autoBackupSettings.email}
                    onChange={(e) =>
                      setAutoBackupSettings({ ...autoBackupSettings, email: e.target.value })
                    }
                  />
                  <p className="text-xs text-ink-muted">
                    A mailto draft will open automatically so you can attach and send.
                  </p>
                </div>
              </div>
            )}

            {autoBackupSettings.lastAutoBackupDate && (
              <p className="text-xs text-ink-muted">
                Last auto-backup: {autoBackupSettings.lastAutoBackupDate}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Working Days ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <CardTitle>Working Days</CardTitle>
            <CardDescription>
              Set which days of the week employees are expected to submit. Non-working days are
              excluded from compliance calculations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    workSettings.workingDays.includes(i)
                      ? "border-primary bg-primary text-white"
                      : "border-surface-border bg-white text-ink hover:bg-surface-subtle"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Holidays ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <CardTitle>Holidays &amp; Non-Working Days</CardTitle>
            <CardDescription>
              Mark specific dates as holidays. Submissions on these days won&apos;t count as
              late or missing. Use this for sudden public holidays or closures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[140px]">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                />
              </div>
              <div className="flex-[2] min-w-[180px]">
                <Label>Label</Label>
                <Input
                  placeholder="e.g. National Day"
                  value={newHolidayLabel}
                  onChange={(e) => setNewHolidayLabel(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addHoliday} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            {workSettings.holidays.length === 0 ? (
              <p className="text-sm text-ink-muted">No holidays configured.</p>
            ) : (
              <ul className="space-y-1.5">
                {workSettings.holidays.map((h) => (
                  <li
                    key={h.date}
                    className="flex items-center justify-between rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{h.date}</span>
                      <span className="ml-2 text-ink-muted">{h.label}</span>
                    </span>
                    <button
                      onClick={() => {
                        workSettingsService.removeHoliday(h.date);
                        toast.success("Holiday removed.");
                      }}
                      className="rounded p-1 text-ink-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Demo data</CardTitle>
          <CardDescription>Reset the workspace to its initial seeded state.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-ink-muted">
            All users, submissions, revisions, projects, and logs will be regenerated.
          </p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </Button>
        </CardContent>
      </Card>

      <ConfirmModal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="This will clear all changes you've made in this session and return the workspace to defaults. You will be signed out."
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
