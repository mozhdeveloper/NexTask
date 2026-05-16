"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";

export default function CalendarPage() {
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const [cursor, setCursor] = useState(new Date());
  const [picked, setPicked] = useState<Date | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const myMap = useMemo(() => {
    const m = new Map<string, typeof submissions[number]>();
    if (!user) return m;
    submissions.filter((s) => s.userId === user.id).forEach((s) => m.set(s.date, s));
    return m;
  }, [user, submissions]);

  const pickedSub = picked ? myMap.get(format(picked, "yyyy-MM-dd")) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Visualize your submissions across the month." />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
              <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-7 gap-1 text-xs font-medium text-ink-muted">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                  <div key={d} className="px-2 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const iso = format(d, "yyyy-MM-dd");
                  const sub = myMap.get(iso);
                  const inMonth = isSameMonth(d, cursor);
                  const today = isSameDay(d, new Date());
                  const isPicked = picked && isSameDay(picked, d);
                  const dotColor = sub
                    ? sub.status === "submitted" || sub.status === "revision_approved"
                      ? "bg-emerald-500"
                      : sub.status === "late"
                      ? "bg-amber-500"
                      : sub.status === "missing" || sub.status === "revision_rejected"
                      ? "bg-rose-500"
                      : "bg-violet-500"
                    : "";
                  return (
                    <button
                      key={iso}
                      onClick={() => setPicked(d)}
                      className={cn(
                        "aspect-square rounded-lg border p-2 text-left transition",
                        inMonth ? "border-surface-border bg-white hover:border-primary" : "border-transparent bg-surface-subtle text-ink-soft",
                        today && "ring-1 ring-primary",
                        isPicked && "border-primary bg-primary-soft/40"
                      )}
                    >
                      <div className="text-xs font-medium">{format(d, "d")}</div>
                      {sub && <div className={cn("mt-1 h-2 w-2 rounded-full", dotColor)} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {picked && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-ink-muted">{format(picked, "EEEE")}</div>
                <div className="text-lg font-semibold">{format(picked, "MMMM dd, yyyy")}</div>
              </div>
              {pickedSub && <StatusPill status={pickedSub.status} />}
            </div>
            {pickedSub ? (
              <>
                <div className="text-sm font-medium">{pickedSub.workSummary}</div>
                {pickedSub.tasksDetails && (
                  <p className="whitespace-pre-wrap rounded-md bg-surface-subtle p-3 text-sm">{pickedSub.tasksDetails}</p>
                )}
              </>
            ) : (
              <div className="text-sm text-ink-muted">No submission for this date.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
