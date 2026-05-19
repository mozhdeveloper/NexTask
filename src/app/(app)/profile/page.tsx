"use client";
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { EditProfileModal } from "@/components/modals/EditProfileModal";
import { submissionService } from "@/services/submission.service";

export default function ProfilePage() {
  const user = useAuth();
  const departments = useDataStore((s) => s.departments);
  const submissions = useDataStore((s) => s.submissions);
  const [editOpen, setEditOpen] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => (user ? submissionService.todayStats(user.id) : null), [user?.id, submissions]);

  if (!user) return null;
  const dept = departments.find((d) => d.id === user.departmentId);
  const mine = submissions.filter((s) => s.userId === user.id);
  const submitted = mine.filter((s) => s.locked).length;
  const monthRate = stats && stats.month.expected > 0
    ? Math.round((stats.month.submitted / stats.month.expected) * 100)
    : null;
  const lateCount = mine.filter((s) => s.status === "late").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your account details."
        actions={
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit profile
          </Button>
        }
      />
      <Card>
        <CardContent>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20 text-xl">
              <AvatarFallback className={user.avatarColor}>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="text-2xl font-semibold">{user.name}</div>
              <div className="text-sm text-ink-muted">{user.email}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="info" className="capitalize">{user.role}</Badge>
                <Badge variant="muted">{dept?.name}</Badge>
                {user.jobTitle && <Badge variant="muted">{user.jobTitle}</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Total Submitted</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{submitted}</div>
            <div className="text-sm text-ink-muted">all time</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This Month</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {monthRate !== null ? `${monthRate}%` : "—"}
            </div>
            <div className="text-sm text-ink-muted">
              {stats?.month.submitted ?? 0}/{stats?.month.expected ?? 0} working days
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This Week</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.week.submitted ?? 0}/{stats?.week.expected ?? 0}
            </div>
            <div className="text-sm text-ink-muted">submissions</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Late Submissions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{lateCount}</div>
            <div className="text-sm text-ink-muted">all time</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Department</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{dept?.name ?? "—"}</div>
            {dept?.description && <div className="text-sm text-ink-muted">{dept.description}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Member Since</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{fmtDate(user.createdAt)}</div>
          </CardContent>
        </Card>
      </div>

      <EditProfileModal open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
