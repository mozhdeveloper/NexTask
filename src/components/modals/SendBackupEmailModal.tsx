"use client";
import { useEffect, useState } from "react";
import { Mail, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { backupService } from "@/services/backup.service";
import { useDataStore } from "@/store/dataStore";
import { toast } from "sonner";

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
  const defaultEmail = useDataStore((s) => s.autoBackupSettings.email || "");
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const send = async () => {
    if (!validEmail) return;
    setSending(true);
    try {
      const result = await backupService.sendByEmail(email, backupId);
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
              ? `Email the snapshot for ${fileName} as a JSON attachment.`
              : "Generates a fresh JSON snapshot of all workspace data and emails it as an attachment."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="send-email" className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
            Recipient email
          </Label>
          <Input
            id="send-email"
            type="email"
            placeholder="admin@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <p className="text-[11px] text-ink-soft">
            {defaultEmail
              ? <span>Pre-filled from your backup settings. Change it below for a one-time send.</span>
              : <span>No default set — save a delivery email in Backup Settings to pre-fill this automatically.</span>
            }
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!validEmail || sending}>
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
