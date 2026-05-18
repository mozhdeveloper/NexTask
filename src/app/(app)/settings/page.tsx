"use client";
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { workSettingsService } from "@/services/workSettings.service";
import { toast } from "sonner";
import {
  Trash2, Plus, Pencil, X, Check, CalendarDays, HardDrive,
  Palette, AlertTriangle, Download, Globe, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Holiday } from "@/types";
import type { LucideIcon } from "lucide-react";

const DAY_LABELS = [
  { short: "Sun", full: "Sunday" },
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
];

type PhHoliday = Holiday & { type: "regular" | "special" | "variable" };

const PH_HOLIDAYS_2026: PhHoliday[] = [
  // Regular Holidays
  { date: "2026-01-01", label: "New Year's Day", type: "regular" },
  { date: "2026-04-02", label: "Maundy Thursday", type: "regular" },
  { date: "2026-04-03", label: "Good Friday", type: "regular" },
  { date: "2026-04-09", label: "Araw ng Kagitingan (Day of Valor)", type: "regular" },
  { date: "2026-05-01", label: "Labor Day", type: "regular" },
  { date: "2026-06-12", label: "Independence Day", type: "regular" },
  { date: "2026-08-31", label: "National Heroes Day", type: "regular" },
  { date: "2026-11-30", label: "Bonifacio Day", type: "regular" },
  { date: "2026-12-25", label: "Christmas Day", type: "regular" },
  { date: "2026-12-30", label: "Rizal Day", type: "regular" },
  // Special Non-Working Holidays
  { date: "2026-01-29", label: "Chinese New Year", type: "special" },
  { date: "2026-02-25", label: "EDSA People Power Revolution Anniversary", type: "special" },
  { date: "2026-04-04", label: "Black Saturday", type: "special" },
  { date: "2026-08-21", label: "Ninoy Aquino Day", type: "special" },
  { date: "2026-11-01", label: "All Saints' Day", type: "special" },
  { date: "2026-11-02", label: "All Souls' Day", type: "special" },
  { date: "2026-12-08", label: "Feast of the Immaculate Conception", type: "special" },
  { date: "2026-12-24", label: "Christmas Eve", type: "special" },
  { date: "2026-12-31", label: "New Year's Eve", type: "special" },
  // Variable Islamic Holidays (estimated)
  { date: "2026-03-20", label: "Eid al-Fitr (tentative)", type: "variable" },
  { date: "2026-05-27", label: "Eid al-Adha (tentative)", type: "variable" },
];

function fmtHolidayDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function monthLabel(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("en-PH", {
    month: "long", year: "numeric",
  });
}

function SectionIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function ImportRow({
  holiday, exists, selected, onToggle,
}: { holiday: PhHoliday; exists: boolean; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={exists}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        exists ? "cursor-not-allowed opacity-50" : selected ? "bg-primary-soft" : "hover:bg-surface-subtle",
      )}
    >
      <span className={cn(
        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-white",
        exists ? "border-ink-soft bg-surface-subtle" : selected ? "border-primary bg-primary" : "border-surface-border",
      )}>
        {(selected || exists) && <Check className="h-3 w-3" />}
      </span>
      <span className="flex-1 text-ink">{holiday.label}</span>
      <span className="flex-shrink-0 text-xs tabular-nums text-ink-muted">{fmtHolidayDate(holiday.date)}</span>
      {exists && <span className="flex-shrink-0 text-xs text-ink-soft">(added)</span>}
    </button>
  );
}

export default function SettingsPage() {
  const reset = useDataStore((s) => s.reset);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const user = useAuth();
  const workSettings = useDataStore((s) => s.workSettings);
  const autoBackupSettings = useDataStore((s) => s.autoBackupSettings);

  const [confirmReset, setConfirmReset] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const toggleDay = (day: number) => {
    const days = workSettings.workingDays.includes(day)
      ? workSettings.workingDays.filter((d) => d !== day)
      : [...workSettings.workingDays, day].sort((a, b) => a - b);
    workSettingsService.setWorkingDays(days);
    toast.success("Working days updated.");
  };

  const addHoliday = () => {
    if (!newHolidayDate) return toast.error("Select a date.");
    if (!newHolidayLabel.trim()) return toast.error("Enter a holiday label.");
    workSettingsService.addHoliday(newHolidayDate, newHolidayLabel.trim());
    setNewHolidayDate("");
    setNewHolidayLabel("");
    toast.success("Holiday added.");
  };

  const startEdit = (h: Holiday) => {
    setEditingHoliday(h);
    setEditDate(h.date);
    setEditLabel(h.label);
  };

  const saveEdit = () => {
    if (!editingHoliday || !editDate || !editLabel.trim()) return;
    workSettingsService.removeHoliday(editingHoliday.date);
    workSettingsService.addHoliday(editDate, editLabel.trim());
    setEditingHoliday(null);
    toast.success("Holiday updated.");
  };

  const openImportDialog = () => {
    const existing = new Set(workSettings.holidays.map((h) => h.date));
    setSelectedImports(new Set(PH_HOLIDAYS_2026.filter((h) => !existing.has(h.date)).map((h) => h.date)));
    setImportOpen(true);
  };

  const toggleImportSelect = (date: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const importSelected = () => {
    let count = 0;
    PH_HOLIDAYS_2026.forEach((h) => {
      if (selectedImports.has(h.date)) { workSettingsService.addHoliday(h.date, h.label); count++; }
    });
    setImportOpen(false);
    if (count > 0) toast.success(`${count} holiday${count !== 1 ? "s" : ""} imported.`);
    else toast.info("No new holidays to import.");
  };

  const holidaysByMonth = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    [...workSettings.holidays].sort((a, b) => a.date.localeCompare(b.date)).forEach((h) => {
      const m = monthLabel(h.date);
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(h);
    });
    return map;
  }, [workSettings.holidays]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure workspace preferences, schedule, and holidays."
      />

      {/* ── Appearance ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <SectionIcon icon={Palette} className="bg-violet-50 text-violet-600" />
            <div>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Visual settings for your workspace.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Theme</p>
              <p className="text-xs text-ink-muted">Light mode is currently active.</p>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              Light
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-soft">Dark mode support is coming in a future update.</p>
        </CardContent>
      </Card>

      {/* ── Working Days ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={CalendarCheck} className="bg-blue-50 text-blue-600" />
              <div>
                <CardTitle>Working Days</CardTitle>
                <CardDescription>
                  Days employees are expected to submit. Non-working days are excluded from compliance calculations.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map(({ short, full }, i) => {
                const active = workSettings.workingDays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    title={full}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "flex h-10 w-14 items-center justify-center rounded-lg border text-xs font-semibold transition-all",
                      active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-surface-border bg-white text-ink-muted hover:border-primary/40 hover:bg-primary-soft hover:text-primary",
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              {workSettings.workingDays.length} day{workSettings.workingDays.length !== 1 ? "s" : ""} selected per week.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Auto Backup ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={HardDrive} className="bg-emerald-50 text-emerald-600" />
              <div>
                <CardTitle>Automatic Daily Backup</CardTitle>
                <CardDescription>
                  Schedule a backup every day at a set time. The backup file downloads automatically
                  and a mailto draft opens for sending it.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-subtle px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {autoBackupSettings.enabled ? "Enabled" : "Disabled"}
                </p>
                <p className="text-xs text-ink-muted">
                  {autoBackupSettings.enabled
                    ? "Auto backup will run at the scheduled time."
                    : "Enable to automatically back up daily."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoBackupSettings.enabled}
                onClick={() => workSettingsService.setAutoBackup({ enabled: !autoBackupSettings.enabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  autoBackupSettings.enabled ? "bg-primary" : "bg-surface-border",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    autoBackupSettings.enabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>

            {autoBackupSettings.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Backup time</Label>
                  <Input
                    type="time"
                    value={autoBackupSettings.time}
                    onChange={(e) => workSettingsService.setAutoBackup({ time: e.target.value })}
                  />
                  <p className="text-xs text-ink-muted">Triggers while the app is open in the browser.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Recipient email</Label>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={autoBackupSettings.email}
                    onChange={(e) => workSettingsService.setAutoBackup({ email: e.target.value })}
                  />
                  <p className="text-xs text-ink-muted">
                    A mailto draft will open so you can attach and send.
                  </p>
                </div>
              </div>
            )}

            {autoBackupSettings.lastAutoBackupDate && (
              <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs text-success">
                <HardDrive className="h-3.5 w-3.5" />
                Last backup: {autoBackupSettings.lastAutoBackupDate}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Holidays ── */}
      {isAdminOrManager && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <SectionIcon icon={CalendarDays} className="bg-orange-50 text-orange-500" />
                <div>
                  <CardTitle>Holidays &amp; Non-Working Days</CardTitle>
                  <CardDescription>
                    Mark specific dates as holidays. Submissions on these days won&apos;t count as
                    late or missing.
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openImportDialog}>
                <Globe className="h-3.5 w-3.5" />
                Import 2026 PH Holidays
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Add form */}
            <div className="rounded-lg border border-dashed border-surface-border bg-surface-subtle p-4">
              <p className="mb-3 text-sm font-medium text-ink">Add custom holiday</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                  />
                </div>
                <div className="flex-[2] space-y-1.5">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g. Local Fiesta"
                    value={newHolidayLabel}
                    onChange={(e) => setNewHolidayLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHoliday()}
                  />
                </div>
                <Button onClick={addHoliday} className="gap-1.5 sm:flex-shrink-0">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>

            {/* Holiday list */}
            {workSettings.holidays.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-border py-10 text-center">
                <CalendarDays className="mb-2 h-8 w-8 text-ink-soft" />
                <p className="text-sm font-medium text-ink-muted">No holidays configured</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Add a custom date above or import the 2026 PH holiday list.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Array.from(holidaysByMonth.entries()).map(([month, holidays]) => (
                  <div key={month}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {month}
                    </p>
                    <ul className="space-y-1.5">
                      {holidays.map((h) =>
                        editingHoliday?.date === h.date ? (
                          <li key={h.date} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft p-2">
                            <Input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="h-8 w-36 flex-shrink-0"
                            />
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-8 flex-1"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") setEditingHoliday(null);
                              }}
                              autoFocus
                            />
                            <button onClick={saveEdit} className="flex-shrink-0 rounded p-1 text-success hover:bg-success-soft">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => setEditingHoliday(null)} className="flex-shrink-0 rounded p-1 text-ink-muted hover:bg-surface-border">
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ) : (
                          <li
                            key={h.date}
                            className="group flex items-center justify-between rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm hover:border-primary/20 hover:bg-surface-subtle"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex-shrink-0 rounded-md bg-surface-subtle px-2 py-1 font-mono text-xs font-semibold tabular-nums text-ink-muted">
                                {fmtHolidayDate(h.date)}
                              </span>
                              <span className="truncate font-medium text-ink">{h.label}</span>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => startEdit(h)}
                                className="rounded p-1 text-ink-muted hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => { workSettingsService.removeHoliday(h.date); toast.success("Holiday removed."); }}
                                className="rounded p-1 text-ink-muted hover:text-danger"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                ))}
                <p className="text-xs text-ink-soft">
                  {workSettings.holidays.length} holiday{workSettings.holidays.length !== 1 ? "s" : ""} configured.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Danger Zone ── */}
      {user?.role === "admin" && (
        <Card className="border-danger/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={AlertTriangle} className="bg-red-50 text-danger" />
              <div>
                <CardTitle className="text-danger">Danger Zone</CardTitle>
                <CardDescription>Irreversible actions that affect all workspace data.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-danger/20 bg-red-50/40 p-4">
              <div>
                <p className="text-sm font-medium text-ink">Reset demo data</p>
                <p className="text-xs text-ink-muted">
                  All users, submissions, revisions, projects, and logs will be regenerated.
                  You will be signed out.
                </p>
              </div>
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                Reset demo data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Import Dialog ── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Import 2026 Philippine Holidays
            </DialogTitle>
            <DialogDescription>
              Select which holidays to add. Dates already in your list are disabled.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1">
            <p className="sticky top-0 bg-white pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Regular Holidays
            </p>
            {PH_HOLIDAYS_2026.filter((h) => h.type === "regular").map((h) => {
              const exists = workSettings.holidays.some((x) => x.date === h.date);
              return (
                <ImportRow
                  key={h.date}
                  holiday={h}
                  exists={exists}
                  selected={selectedImports.has(h.date)}
                  onToggle={() => !exists && toggleImportSelect(h.date)}
                />
              );
            })}
            <p className="sticky top-0 bg-white pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Special Non-Working Holidays
            </p>
            {PH_HOLIDAYS_2026.filter((h) => h.type === "special").map((h) => {
              const exists = workSettings.holidays.some((x) => x.date === h.date);
              return (
                <ImportRow
                  key={h.date}
                  holiday={h}
                  exists={exists}
                  selected={selectedImports.has(h.date)}
                  onToggle={() => !exists && toggleImportSelect(h.date)}
                />
              );
            })}
            <p className="sticky top-0 bg-white pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Islamic Holidays (Tentative)
            </p>
            {PH_HOLIDAYS_2026.filter((h) => h.type === "variable").map((h) => {
              const exists = workSettings.holidays.some((x) => x.date === h.date);
              return (
                <ImportRow
                  key={h.date}
                  holiday={h}
                  exists={exists}
                  selected={selectedImports.has(h.date)}
                  onToggle={() => !exists && toggleImportSelect(h.date)}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 text-xs text-ink-muted">
            <span>
              {selectedImports.size} holiday{selectedImports.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => {
                const existing = new Set(workSettings.holidays.map((h) => h.date));
                setSelectedImports(new Set(PH_HOLIDAYS_2026.filter((h) => !existing.has(h.date)).map((h) => h.date)));
              }}
            >
              Select all available
            </button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={importSelected} disabled={selectedImports.size === 0} className="gap-1.5">
              <Download className="h-4 w-4" />
              Import {selectedImports.size > 0 ? selectedImports.size : ""} Holiday{selectedImports.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="This will clear all changes you've made and return the workspace to defaults. You will be signed out."
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
