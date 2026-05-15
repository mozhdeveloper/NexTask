import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const TINTS = {
  teal: { bg: "bg-chip-teal", fg: "text-primary" },
  violet: { bg: "bg-chip-violet", fg: "text-violet-700" },
  peach: { bg: "bg-chip-peach", fg: "text-orange-600" },
  amber: { bg: "bg-chip-amber", fg: "text-amber-700" },
  rose: { bg: "bg-chip-rose", fg: "text-rose-700" },
  indigo: { bg: "bg-chip-indigo", fg: "text-indigo-700" },
  mint: { bg: "bg-chip-mint", fg: "text-emerald-700" },
} as const;

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tint = "teal",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  icon: LucideIcon;
  tint?: keyof typeof TINTS;
  className?: string;
}) {
  const t = TINTS[tint];
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-surface-border bg-white p-5 shadow-card",
        className
      )}
    >
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", t.bg)}>
        <Icon className={cn("h-6 w-6", t.fg)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
        <div className="mt-0.5 text-xl font-semibold leading-tight text-ink">{value}</div>
        {sublabel && <div className="mt-0.5 text-xs text-ink-muted">{sublabel}</div>}
      </div>
    </div>
  );
}
