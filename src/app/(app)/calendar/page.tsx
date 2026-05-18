"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
} from "date-fns";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import type { Submission } from "@/types";

export default function CalendarPage() {
  const router = useRouter();
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  const [cursor, setCursor] = useState(new Date());
  const [picked, setPicked] = useState<Date | null>(null);
  const [details, setDetails] = useState<Submission | null>(null);
  const [viewUserId, setViewUserId] = useState<string | null>(null);

  if (!user) return null;
  const canSelectUser = user.role === "admin" || user.role === "manager";
  const effectiveUserId = canSelectUser && viewUserId ? viewUserId : user.id;
  const effectiveUser = users.find((u) => u.id === effectiveUserId) ?? user;
  const isSelf = effectiveUserId === user.id;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const dayMap = useMemo(() => {
    const m = new Map<string, Submission>();
    submissions.filter((s) => s.userId === effectiveUserId).forEach((s) => m.set(s.date, s));
    return m;
  }, [effectiveUserId, submissions]);

  const pickedSub = picked ? dayMap.get(format(picked, "yyyy-MM-dd")) : undefined;
  const today = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description={isSelf ? "Visualize your submissions across the month." : `Viewing ${effectiveUser.name}'s calendar.`}
        actions={
          canSelectUser && (
            <Select value={viewUserId ?? user.id} onValueChange={(v) => setViewUserId(v === user.id ? null : v)}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={user.id}>My calendar</SelectItem>
                {users.filter((u) => u.isActive && u.id !== user.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />
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
                  const sub = dayMap.get(iso);
                  const inMonth = isSameMonth(d, cursor);
                  const isToday = isSameDay(d, today);
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
                      onClick={() => {
                        setPicked(d);
                        if (sub) setDetails(sub);
                      }}
                      className={cn(
                        "aspect-square rounded-lg border p-2 text-left transition",
                        inMonth ? "border-surface-border bg-white hover:border-primary" : "border-transparent bg-surface-subtle text-ink-soft",
                        isToday && "ring-1 ring-primary",
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
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                <Button size="sm" variant="outline" onClick={() => setDetails(pickedSub)}>View details</Button>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink-muted">No submission for this date.</div>
                {isSelf && !isAfter(picked, today) && (
                  <Button size="sm" onClick={() => router.push(`/my-work?date=${format(picked, "yyyy-MM-dd")}`)}>
                    <Plus className="h-4 w-4" /> Submit work
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SubmissionDetailsModal
        open={!!details}
        onOpenChange={(v) => !v && setDetails(null)}
        submission={details}
      />
    </div>
  );
}
