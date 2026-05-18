"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { revisionService } from "@/services/revision.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MODE_CONFIG = {
  approve: {
    title: "Approve Revision",
    description:
      "The submission will be unlocked so the employee can re-upload an updated version.",
    Icon: CheckCircle2,
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
    headerBorder: "border-emerald-100",
    notePlaceholder: "Optional note for the employee (e.g. what to fix)…",
    noteLabel: "Note (optional)",
    noteRequired: false,
    confirmLabel: "Approve",
    confirmVariant: "default" as const,
    confirmClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  reject: {
    title: "Reject Revision",
    description:
      "The employee will be notified of the rejection. Please explain why the request was declined.",
    Icon: XCircle,
    iconBg: "bg-rose-100",
    iconText: "text-rose-600",
    headerBorder: "border-rose-100",
    notePlaceholder: "Explain why the revision request is being rejected…",
    noteLabel: "Reason (required)",
    noteRequired: true,
    confirmLabel: "Reject",
    confirmVariant: "danger" as const,
    confirmClass: "",
  },
} as const;

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
  const cfg = MODE_CONFIG[mode];

  const submit = async () => {
    if (cfg.noteRequired && note.trim().length < 3) {
      toast.error("Please provide a rejection reason (at least 3 characters).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "approve") {
        await revisionService.approve(revisionId, note.trim() || undefined);
      } else {
        await revisionService.reject(revisionId, note.trim());
      }
      toast.success(mode === "approve" ? "Revision approved successfully." : "Revision rejected.");
      setNote("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setNote(""); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        {/* Mode header */}
        <DialogHeader className={cn("border-b pb-4", cfg.headerBorder)}>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", cfg.iconBg)}>
              <cfg.Icon className={cn("h-5 w-5", cfg.iconText)} />
            </div>
            <div>
              <DialogTitle className="text-base">{cfg.title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {cfg.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Note field */}
        <div className="space-y-1.5 py-1">
          <Label htmlFor="decision-note">{cfg.noteLabel}</Label>
          <Textarea
            id="decision-note"
            rows={4}
            placeholder={cfg.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          {cfg.noteRequired && note.trim().length > 0 && note.trim().length < 3 && (
            <p className="flex items-center gap-1 text-xs text-danger">
              <AlertTriangle className="h-3 w-3" />
              Please provide at least 3 characters.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setNote(""); onOpenChange(false); }} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={cfg.confirmVariant}
            className={cfg.confirmClass}
            onClick={submit}
            disabled={busy || (cfg.noteRequired && note.trim().length < 3)}
          >
            <cfg.Icon className="h-4 w-4" />
            {busy ? (mode === "approve" ? "Approving…" : "Rejecting…") : cfg.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}