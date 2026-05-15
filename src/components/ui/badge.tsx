import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted";
}) {
  const map = {
    default: "bg-primary-soft text-primary",
    success: "bg-success-soft text-emerald-700",
    warning: "bg-warning-soft text-amber-700",
    danger: "bg-danger-soft text-red-700",
    info: "bg-info-soft text-indigo-700",
    muted: "bg-surface-subtle text-ink-muted",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        map[variant],
        className
      )}
      {...props}
    />
  );
}
