"use client";
import { useState } from "react";
import {
  Database, Play, Download, Clock, Mail,
  CheckCircle2, AlertCircle, BellRing, CalendarClock, Shield,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Label } from "@/components/ui/input";
import { workSettingsService } from "@/services/workSettings.service";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtBytes, fmtDate } from "@/lib/dates";
import { RunBackupModal } from "@/components/modals/RunBackupModal";
import { SendBackupEmailModal } from "@/components/modals/SendBackupEmailModal";
import { useRequireRole } from "@/hooks/useAuth";
import { StatCard } from "@/components/cards/StatCard";
import { downloadBlob } from "@/lib/helpers";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function fmt12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function nextScheduledLabel(time: string): string {
  const now = new Date();
  const [hh, mm] = time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hh, mm, 0, 0);
  if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
  return format(scheduled, "MMM d, yyyy 'at' h:mm a");
}

export default function BackupsPage() {
  const { ready } = useRequireRole(["admin"]);
  const backups = useDataStore((s) => s.backups);
  const abs = useDataStore((s) => s.autoBackupSettings);
  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<{ id?: string; fileName?: string }>({});

  const [abEnabled, setAbEnabled] = useState(() => abs.enabled);
  const [abTime, setAbTime] = useState(() => abs.time || "22:00");
  const [abEmail, setAbEmail] = useState(() => abs.email || "");
  const [dirty, setDirty] = useState(false);

  const saveAutoBackup = () => {
    workSettingsService.setAutoBackup({ enabled: abEnabled, time: abTime, email: abEmail });
    setDirty(false);
    toast.success("Auto backup settings saved.");
  };

  const last = [...backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const success = backups.filter((b) => b.status === "completed").length;
  if (!ready) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description="Configure scheduled backups and review the backup history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => { setSendTarget({ id: last?.id, fileName: last?.fileName }); setSendOpen(true); }}
            >
              <Mail className="h-4 w-4" /> Email backup
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Play className="h-4 w-4" /> Run backup now
            </Button>
          </div>
        }
      />

      {/* ── Auto Backup Schedule ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <BellRing className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Auto Backup Schedule</CardTitle>
              <CardDescription>
                Automatically bundle workspace data daily and deliver a notification to an email address.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-subtle/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Enable auto backup</p>
              <p className="text-xs text-ink-muted">Runs every day at the scheduled time</p>
            </div>
            <button
              role="switch"
              aria-checked={abEnabled}
              onClick={() => { setAbEnabled((v) => !v); setDirty(true); }}
              className={cn(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                abEnabled ? "bg-primary" : "bg-surface-border",
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                abEnabled ? "translate-x-6" : "translate-x-1",
              )} />
            </button>
          </div>

          {/* Time + Email */}
          <div className={cn(
            "grid gap-4 sm:grid-cols-2 transition-opacity duration-200",
            !abEnabled && "pointer-events-none opacity-40",
          )}>
            <div className="space-y-1.5">
              <Label
                htmlFor="ab-time"
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-muted"
              >
                <Clock className="h-3.5 w-3.5" /> Daily time
              </Label>
              <div className="relative">
                <Input
                  id="ab-time"
                  type="time"
                  value={abTime}
                  onChange={(e) => { setAbTime(e.target.value); setDirty(true); }}
                  className="pr-20"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary">
                  {fmt12(abTime)}
                </span>
              </div>
              <p className="text-[11px] text-ink-soft">Default: 10:00 PM — based on your local timezone</p>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="ab-email"
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-muted"
              >
                <Mail className="h-3.5 w-3.5" /> Delivery email
              </Label>
              <Input
                id="ab-email"
                type="email"
                placeholder="admin@company.com"
                value={abEmail}
                onChange={(e) => { setAbEmail(e.target.value); setDirty(true); }}
              />
              <p className="text-[11px] text-ink-soft">Receive a daily backup notification at this address</p>
            </div>
          </div>

          {/* Status + Save */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
            <div className="flex items-center gap-2">
              {abs.enabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                  <span className="text-xs text-ink-muted">
                    {abs.lastAutoBackupDate
                      ? `Last run: ${fmtDate(abs.lastAutoBackupDate)}`
                      : "Enabled — awaiting first run"}
                    <span className="mx-1.5 text-surface-border">·</span>
                    <span className="font-medium text-ink">Next: {nextScheduledLabel(abs.time)}</span>
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-ink-soft" />
                  <span className="text-xs text-ink-muted">Auto backup is disabled</span>
                </>
              )}
            </div>
            <Button size="sm" onClick={saveAutoBackup} disabled={!dirty}>
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <StatCard icon={Database} label="Total backups" value={backups.length} sublabel="all time" tint="indigo" />
        <StatCard
          icon={Shield}
          label="Successful"
          value={success}
          sublabel={`${Math.round((success / Math.max(backups.length, 1)) * 100)}% success rate`}
          tint="mint"
        />
        <StatCard
          icon={CalendarClock}
          label="Last backup"
          value={last ? fmtDate(last.createdAt, "MMM dd") : "—"}
          sublabel={last ? fmtBytes(last.sizeBytes) : "No backup yet"}
          tint="teal"
        />
      </div>

      {/* ── Backup history ── */}
      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
          <CardDescription>
            {backups.length} total backup{backups.length !== 1 ? "s" : ""} on record
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>File</TH>
                <TH className="hidden sm:table-cell">Size</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Created</TH>
                <TH className="w-10" />
              </TR>
            </THead>
            <TBody>
              {[...backups]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((b) => (
                  <TR key={b.id}>
                    <TD className="font-mono text-xs">{b.fileName}</TD>
                    <TD className="hidden sm:table-cell">{fmtBytes(b.sizeBytes)}</TD>
                    <TD>
                      {b.status === "completed" ? (
                        <Badge variant="success">Completed</Badge>
                      ) : b.status === "failed" ? (
                        <Badge variant="danger">Failed</Badge>
                      ) : (
                        <Badge variant="warning">Running</Badge>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell text-ink-muted">
                      {fmtDate(b.createdAt, "MMM dd, yyyy hh:mm a")}
                    </TD>
                    <TD>
                      {b.status === "completed" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Email this backup"
                            onClick={() => { setSendTarget({ id: b.id, fileName: b.fileName }); setSendOpen(true); }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Download"
                            onClick={() =>
                              downloadBlob(
                                b.fileName,
                                `Backup simulation\nFile: ${b.fileName}\nSize: ${fmtBytes(b.sizeBytes)}\nCreated: ${b.createdAt}`,
                                "text/plain",
                              )
                            }
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              {backups.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-10 text-center text-ink-muted">
                    No backup records yet. Run your first backup to get started.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <RunBackupModal open={open} onOpenChange={setOpen} />
      <SendBackupEmailModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        backupId={sendTarget.id}
        fileName={sendTarget.fileName}
      />
    </div>
  );
}
