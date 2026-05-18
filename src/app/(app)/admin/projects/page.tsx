"use client";
import { useState } from "react";
import { Plus, MoreVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { ProjectFormModal } from "@/components/modals/ProjectFormModal";
import { useRequireRole } from "@/hooks/useAuth";
import type { Project } from "@/types";
import { fmtDate } from "@/lib/dates";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";

const STATUS_VARIANTS: Record<Project["status"], "info" | "warning" | "success" | "muted" | "danger"> = {
  planning: "info",
  in_progress: "warning",
  review: "info",
  completed: "success",
  on_hold: "muted",
};

export default function ProjectsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const projects = useDataStore((s) => s.projects);
  const users = useDataStore((s) => s.users);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Track ongoing initiatives across the office."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New project</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const owner = users.find((u) => u.id === (p.ownerId ?? p.lead));
          const progress = p.progress ?? 0;
          return (
            <Card key={p.id} className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{p.description}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => { setEditing(p); setOpen(true); }}>Edit</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[p.status]} className="capitalize">{p.status.replace("_", " ")}</Badge>
                  {p.dueDate && <span className="text-xs text-ink-muted">Due {fmtDate(p.dueDate, "MMM dd")}</span>}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-ink-muted">
                    <span>Progress</span><span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  {owner && <Avatar className="h-7 w-7"><AvatarFallback className={owner.avatarColor}>{initials(owner.name)}</AvatarFallback></Avatar>}
                  <span className="text-sm">{owner?.name}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <ProjectFormModal open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}
