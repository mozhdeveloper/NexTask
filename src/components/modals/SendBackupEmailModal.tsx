"use client";
import { useState } from "react";
import { Mail, Send, Loader2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { backupService } from "@/services/backup.service";
import { toast } from "sonner";

// Manual "Email backup" deliveries are permanently locked to this address on
// both the client and the server (see /api/backups/send). Keep in sync.
const MANUAL_BACKUP_RECIPIENT = "premium.global.official@gmail.com";

export function SendBackupEmailModal({
  open,
  onOpenChange,
  backupId,
  fileName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  backupId?: string;
  fileName?: string;
}) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const result = await backupService.sendByEmail(MANUAL_BACKUP_RECIPIENT, backupId);
      toast.success(`Backup sent to ${result.email}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send backup via email
          </DialogTitle>
          <DialogDescription>
            {fileName
              ? `Email the snapshot for ${fileName} as a ZIP attachment.`
              : "Generates a fresh ZIP snapshot of all workspace data and emails it as an attachment."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
            Recipient (locked)
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-subtle/60 px-3 py-2.5">
            <Lock className="h-4 w-4 flex-shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="truncate text-sm font-semibold text-ink">{MANUAL_BACKUP_RECIPIENT}</span>
          </div>
          <p className="text-[11px] text-ink-soft">
            Manual backup emails are permanently sent to this address only.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send backup
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
