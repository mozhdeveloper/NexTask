"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { revisionService } from "@/services/revision.service";
import { toast } from "sonner";

export function RevisionRequestModal({
  open,
  onOpenChange,
  submissionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  submissionId: string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (reason.trim().length < 5) {
      toast.error("Please give a brief reason (≥ 5 chars).");
      return;
    }
    setBusy(true);
    try {
      revisionService.request(submissionId, reason);
      toast.success("Revision requested.");
      setReason("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a revision</DialogTitle>
          <DialogDescription>
            Tell the admin why this submission needs to be re-uploaded. Once approved you can edit and re-upload.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Uploaded the wrong file."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
