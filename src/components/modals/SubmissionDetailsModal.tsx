"use client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { fmtBytes } from "@/lib/dates";
import { fmtDate, fmtTime } from "@/lib/dates";
import { useDataStore } from "@/store/dataStore";
import { Download, FileText, Lock, History } from "lucide-react";
import { downloadBlob } from "@/lib/helpers";
import type { Submission } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { RevisionRequestModal } from "./RevisionRequestModal";

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
  const [revOpen, setRevOpen] = useState(false);
  if (!submission) return null;
  const author = users.find((u) => u.id === submission.userId);
  const type = types.find((t) => t.id === submission.submissionTypeId);
  const subRevisions = revisions.filter((r) => r.submissionId === submission.id);

  const downloadAtt = (a: Submission["attachments"][number]) => {
    if (a.dataUrl) {
      const link = document.createElement("a");
      link.href = a.dataUrl;
      link.download = a.originalName;
      link.click();
    } else {
      downloadBlob(
        a.originalName + ".txt",
        `Stub file (original ${fmtBytes(a.sizeBytes)} not stored).\nFilename: ${a.originalName}\nHash: ${a.hashStub}`,
        "text/plain"
      );
    }
  };

  const canRequestRevision =
    me?.id === submission.userId && submission.locked && submission.status !== "revision_requested";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Submission details</DialogTitle>
              <StatusPill status={submission.status} />
            </div>
            <DialogDescription>
              {type?.name} — {fmtDate(submission.date)}
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
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Submitted</div>
                  <div>{fmtTime(submission.submittedAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Version</div>
                  <div>v{submission.versionNumber}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">IP</div>
                  <div>{submission.uploadedIp || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-muted">Lock</div>
                  <div className="flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> {submission.locked ? "Locked" : "Unlocked"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">Work summary</div>
            <p className="rounded-lg border border-surface-border bg-white p-3 text-sm">
              {submission.workSummary || <span className="text-ink-muted">—</span>}
            </p>
          </div>

          {submission.tasksDetails && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">Tasks / Details</div>
              <p className="whitespace-pre-wrap rounded-lg border border-surface-border bg-white p-3 text-sm">
                {submission.tasksDetails}
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
              Attachments ({submission.attachments.length})
            </div>
            {submission.attachments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-ink-muted">
                No attachments
              </div>
            ) : (
              <ul className="divide-y divide-surface-border rounded-lg border border-surface-border bg-white">
                {submission.attachments.map((a) => (
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

          {submission.filePath && (
            <div className="rounded-md bg-surface-subtle p-2 font-mono text-[11px] text-ink-muted">
              {submission.filePath}
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
      <RevisionRequestModal open={revOpen} onOpenChange={setRevOpen} submissionId={submission.id} />
    </>
  );
}
