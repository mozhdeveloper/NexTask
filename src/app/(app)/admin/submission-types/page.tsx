"use client";
import { useState } from "react";
import { ListChecks, Plus, Pencil, Trash2, Power } from "lucide-react";
import { useDataStore } from "@/store/dataStore";
import { useRequireRole } from "@/hooks/useAuth";
import { submissionTypeService } from "@/services/submissionType.service";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { SubmissionTypeFormModal } from "@/components/modals/SubmissionTypeFormModal";
import type { SubmissionType } from "@/types";
import { toast } from "sonner";

export default function SubmissionTypesPage() {
  const { ready } = useRequireRole(["admin"]);
  const types = useDataStore((s) => s.submissionTypes);
  const departments = useDataStore((s) => s.departments);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubmissionType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubmissionType | null>(null);

  if (!ready) return null;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (t: SubmissionType) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleToggleActive = async (t: SubmissionType) => {
    try {
      await submissionTypeService.toggleActive(t.id);
      toast.success(`"${t.name}" ${t.isActive ? "deactivated" : "activated"}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await submissionTypeService.remove(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const deptName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? id) : "All departments";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submission Types"
        description="Define what employees are required to submit and the rules that apply."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New type
          </Button>
        }
      />

      <Card>
        <CardContent>
          {types.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-ink-muted">
              <ListChecks className="h-10 w-10 opacity-30" />
              <p className="text-sm">No submission types yet. Create one to get started.</p>
              <Button variant="outline" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create first type
              </Button>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Department</TH>
                  <TH>Required Daily</TH>
                  <TH>Deadline</TH>
                  <TH>File Types</TH>
                  <TH>Max Size</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {types.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD className="text-sm text-ink-muted">{deptName(t.departmentId)}</TD>
                    <TD>
                      {t.requiredDaily ? (
                        <Badge variant="success">Yes</Badge>
                      ) : (
                        <Badge variant="muted">No</Badge>
                      )}
                    </TD>
                    <TD className="font-mono text-sm">{t.deadlineTime}</TD>
                    <TD className="max-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {t.allowedFileTypes.slice(0, 4).map((ft) => (
                          <span
                            key={ft}
                            className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] uppercase"
                          >
                            {ft}
                          </span>
                        ))}
                        {t.allowedFileTypes.length > 4 && (
                          <span className="text-xs text-ink-muted">
                            +{t.allowedFileTypes.length - 4}
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-sm">{t.maxFileSizeMB} MB · {t.maxFiles} file{t.maxFiles === 1 ? "" : "s"}</TD>
                    <TD>
                      {t.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="muted">Inactive</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t.isActive ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleActive(t)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Edit"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Delete"
                          className="text-danger hover:text-danger"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubmissionTypeFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Existing submissions will retain their type label but no new submissions can reference this type."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
