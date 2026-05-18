"use client";
import { useState } from "react";
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

export default function ProfilePage() {
  const user = useAuth();
  const departments = useDataStore((s) => s.departments);
  const submissions = useDataStore((s) => s.submissions);
  const [editOpen, setEditOpen] = useState(false);

  if (!user) return null;
  const dept = departments.find((d) => d.id === user.departmentId);
  const mine = submissions.filter((s) => s.userId === user.id);
  const submitted = mine.filter((s) => s.locked).length;

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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Submissions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{submitted}</div>
            <div className="text-sm text-ink-muted">total submitted</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Department</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{dept?.name}</div>
            <div className="text-sm text-ink-muted">{dept?.description}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Joined</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{fmtDate(user.createdAt)}</div>
          </CardContent>
        </Card>
      </div>

      <EditProfileModal open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
