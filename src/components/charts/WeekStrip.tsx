"use client";
import { weekDays, fmtDate, isSameDay } from "@/lib/dates";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function WeekStrip({
  submittedDates,
}: {
  submittedDates: Set<string>;
}) {
  const days = weekDays();
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = d.toISOString().slice(0, 10);
        const submitted = submittedDates.has(iso);
        const today = isSameDay(d, new Date());
        return (
          <div
            key={iso}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-3",
              today ? "border-primary bg-primary-soft/50" : "border-surface-border bg-white"
            )}
          >
            <div className="text-xs font-medium text-ink-muted">{fmtDate(d, "EEE")}</div>
            <div className="text-xs text-ink">{fmtDate(d, "MMM dd")}</div>
            {submitted ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Circle className="h-5 w-5 text-ink-soft" />
            )}
            <span className={cn("text-[10px]", submitted ? "text-emerald-600" : "text-ink-soft")}>
              {submitted ? "Submitted" : "Pending"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
