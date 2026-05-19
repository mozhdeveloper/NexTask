"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { backupService } from "@/services/backup.service";
import { notificationService } from "@/services/notification.service";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Database } from "lucide-react";

export function RunBackupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const me = useAuth();

  const start = async () => {
    setRunning(true);
    setProgress(0);
    setDone(null);
    try {
      const log = await backupService.run((p) => setProgress(p));
      setDone(log.fileName);
      toast.success("Backup completed.");
      if (me?.id) {
        notificationService.push({
          userId: me.id,
          type: "success",
          title: "Backup completed",
          body: `${log.fileName} was backed up successfully.`,
          link: "/admin/backups",
        });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const close = (v: boolean) => {
    if (running) return;
    if (!v) { setProgress(0); setDone(null); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run backup</DialogTitle>
          <DialogDescription>
            Bundle today’s submission files into a downloadable archive (mock-only — generates a backup log entry).
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-surface-border bg-surface-subtle p-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Office uploads</span>
            <span className="ml-auto text-sm text-ink-muted">{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
          {done && (
            <div className="mt-3 rounded-md bg-white px-2 py-1.5 font-mono text-[11px] text-ink-muted">
              {done}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={running}>Close</Button>
          <Button onClick={start} disabled={running}>{running ? "Running…" : done ? "Run again" : "Start backup"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
