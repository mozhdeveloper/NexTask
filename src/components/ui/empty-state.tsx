import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle">
          <Icon className="h-5 w-5 text-ink-muted" />
        </div>
      )}
      <div className="text-sm font-medium text-ink">{title}</div>
      {description && <div className="max-w-sm text-xs text-ink-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
