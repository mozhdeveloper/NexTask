import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/status";
import type { SubmissionStatus } from "@/lib/constants";

export function StatusPill({ status, className }: { status: SubmissionStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        m.bg,
        m.fg,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
