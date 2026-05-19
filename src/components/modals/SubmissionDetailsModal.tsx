"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { fmtBytes } from "@/lib/dates";
import { fmtDate, fmtTime } from "@/lib/dates";
import { useDataStore } from "@/store/dataStore";
import { submissionService } from "@/services/submission.service";
import { Download, FileText, Lock, History, Pencil, X } from "lucide-react";
import { downloadBlob } from "@/lib/helpers";
import type { Submission } from "@/types";
import type { SubmissionStatus } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { RevisionRequestModal } from "./RevisionRequestModal";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase/client";
import { logService } from "@/services/log.service";
import { toast } from "sonner";

const OVERRIDE_STATUSES: SubmissionStatus[] = [
  "submitted", "late", "pending", "missing",
  "revision_requested", "revision_approved", "revision_rejected", "excused",
];

export function SubmissionDetailsModal({
  open,
  onOpenChange,
  submission,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  submission: Submission | null;
}) {
  const me = useAuth();
  const users = useDataStore((s) => s.users);
  const types = useDataStore((s) => s.submissionTypes);
  const revisions = useDataStore((s) => s.revisions);
  // Read live submission from store so status updates after override
  const liveSubmission = useDataStore((s) => s.submissions.find((x) => x.id === submission?.id)) ?? submission;
  const [revOpen, setRevOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<SubmissionStatus>("submitted");
  if (!submission || !liveSubmission) return null;
  const author = users.find((u) => u.id === liveSubmission.userId);
  const type = types.find((t) => t.id === liveSubmission.submissionTypeId);
  const subRevisions = revisions.filter((r) => r.submissionId === liveSubmission.id);
  const canOverride = me?.role === "admin" || me?.role === "manager";

  const applyOverride = () => {
    try {
      submissionService.markStatus(liveSubmission.id, pendingStatus);
      toast.success(`Status updated to "${pendingStatus.replace(/_/g, " ")}".`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setOverriding(false);
  };

  const downloadAtt = async (a: Submission["attachments"][number]) => {
    if (a.dataUrl) {
      const link = document.createElement("a");
      link.href = a.dataUrl;
      link.download = a.originalName;
      link.click();
    } else if (a.storagePath) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(a.storagePath, 300);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      } else {
        downloadBlob(
          a.originalName + ".txt",
          `Unable to retrieve file.\nFilename: ${a.originalName}\nHash: ${a.hashStub}`,
          "text/plain"
        );
      }
    } else {
      downloadBlob(
        a.originalName + ".txt",
        `Stub file (original ${fmtBytes(a.sizeBytes)} not stored).\nFilename: ${a.originalName}\nHash: ${a.hashStub}`,
        "text/plain"
      );
    }
    void logService.append({ action: "download.file", targetType: "attachment", targetId: a.id, userId: me!.id });
  };

  const canRequestRevision =
    me?.id === liveSubmission.userId &&
    liveSubmission.locked &&
    !["revision_requested", "revision_rejected"].includes(liveSubmission.status);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setOverriding(false); onOpenChange(v); }}>
        <DialogContent className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Submission details</DialogTitle>
              <div className="flex items-center gap-2">
                <StatusPill status={liveSubmission.status} />
                {canOverride && !overriding && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                    onClick={() => { setPendingStatus(liveSubmission.status); setOverriding(true); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>
            </div>
            {overriding && canOverride && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
                <span className="text-xs font-medium text-ink shrink-0">Change status:</span>
                <Select value={pendingStatus} onValueChange={(v) => setPendingStatus(v as SubmissionStatus)}>
                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERRIDE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={applyOverride}>Apply</Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 px-0 shrink-0" onClick={() => setOverriding(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <DialogDescription>
              {type?.name} — {fmtDate(liveSubmission.date)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-muted">Author</div>
              <div className="mt-1 flex items-center gap-2">
                {author && (
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={author.avatarColor}>{initials(author.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <div className="text-sm font-medium">{author?.name}</div>
                  <div className="text-xs text-ink-muted">{author?.email}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Started</div>
                  <div>{liveSubmission.startedAt ? fmtTime(liveSubmission.startedAt) : "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Submitted</div>
                  <div>{fmtTime(liveSubmission.submittedAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Version</div>
                  <div>v{liveSubmission.versionNumber}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">IP</div>
                  <div>{liveSubmission.uploadedIp || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Lock</div>
                  <div className="flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> {liveSubmission.locked ? "Locked" : "Unlocked"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {liveSubmission.taskTitle && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">Task</div>
              <p className="rounded-lg border border-surface-border bg-white p-3 text-sm font-medium text-ink">
                {liveSubmission.taskTitle}
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">Work summary</div>
            <p className="rounded-lg border border-surface-border bg-white p-3 text-sm">
              {liveSubmission.workSummary || <span className="text-ink-muted">—</span>}
            </p>
          </div>

          {liveSubmission.tasksDetails && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">Tasks / Details</div>
              <p className="whitespace-pre-wrap rounded-lg border border-surface-border bg-white p-3 text-sm">
                {liveSubmission.tasksDetails}
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
              Attachments ({liveSubmission.attachments.length})
            </div>
            {liveSubmission.attachments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-ink-muted">
                No attachments
              </div>
            ) : (
              <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-white">
                {liveSubmission.attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{a.originalName}</span>
                      <Badge variant="muted">{fmtBytes(a.sizeBytes)}</Badge>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => downloadAtt(a)}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {liveSubmission.filePath && (
            <div className="rounded-md bg-surface-subtle p-2 font-mono text-[11px] text-ink-muted">
              {liveSubmission.filePath}
            </div>
          )}

          {subRevisions.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-ink-muted">
                <History className="h-3.5 w-3.5" /> Revision history
              </div>
              <ul className="space-y-1.5">
                {subRevisions.map((r) => (
                  <li key={r.id} className="rounded-md border border-surface-border bg-white p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{r.status}</span>
                      <span className="text-ink-muted">{fmtDate(r.createdAt, "MMM dd, hh:mm a")}</span>
                    </div>
                    <div className="text-ink-muted">{r.reason}</div>
                    {r.adminNote && <div className="mt-1 text-ink-muted">Admin: {r.adminNote}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            {canRequestRevision && (
              <Button variant="outline" onClick={() => setRevOpen(true)}>
                Request revision
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <RevisionRequestModal open={revOpen} onOpenChange={setRevOpen} submissionId={liveSubmission.id} />
    </>
  );
}
