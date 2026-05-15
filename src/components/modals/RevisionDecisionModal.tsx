"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { revisionService } from "@/services/revision.service";
import { toast } from "sonner";

export function RevisionDecisionModal({
  open,
  onOpenChange,
  revisionId,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  revisionId: string;
  mode: "approve" | "reject";
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    try {
      if (mode === "approve") revisionService.approve(revisionId, note || undefined);
      else {
        if (note.trim().length < 3) {
          toast.error("Please add a short rejection note.");
          setBusy(false);
          return;
        }
        revisionService.reject(revisionId, note);
      }
      toast.success(mode === "approve" ? "Revision approved." : "Revision rejected.");
      setNote("");
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
          <DialogTitle>{mode === "approve" ? "Approve revision" : "Reject revision"}</DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? "Unlock the submission so the employee can re-upload. Add an optional note."
              : "Decline the request and let the employee know why."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="note">{mode === "approve" ? "Note (optional)" : "Reason"}</Label>
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={mode === "reject" ? "danger" : "default"} onClick={submit} disabled={busy}>
            {mode === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
