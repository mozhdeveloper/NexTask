"use client";
import { useState } from "react";
import { Database, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtBytes, fmtDate } from "@/lib/dates";
import { RunBackupModal } from "@/components/modals/RunBackupModal";
import { useRequireRole } from "@/hooks/useAuth";
import { StatCard } from "@/components/cards/StatCard";

export default function BackupsPage() {
  useRequireRole(["admin"]);
  const backups = useDataStore((s) => s.backups);
  const [open, setOpen] = useState(false);

  const last = backups[backups.length - 1];
  const success = backups.filter((b) => b.status === "completed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backups"
        description="Generate and review office-wide backup runs."
        actions={<Button onClick={() => setOpen(true)}><Play className="h-4 w-4" /> Run backup</Button>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Database} label="Total backups" value={backups.length} sublabel="all time" tint="indigo" />
        <StatCard icon={Database} label="Successful" value={success} sublabel={`${Math.round((success/Math.max(backups.length,1))*100)}% success rate`} tint="mint" />
        <StatCard icon={Database} label="Last backup" value={last ? fmtDate(last.createdAt, "MMM dd") : "—"} sublabel={last ? fmtBytes(last.sizeBytes) : ""} tint="teal" />
      </div>
      <Card>
        <CardContent>
          <Table>
            <THead><TR><TH>File</TH><TH>Size</TH><TH>Status</TH><TH>Created</TH></TR></THead>
            <TBody>
              {[...backups].reverse().map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs">{b.fileName}</TD>
                  <TD>{fmtBytes(b.sizeBytes)}</TD>
                  <TD>
                    {b.status === "completed"
                      ? <Badge variant="success">Completed</Badge>
                      : b.status === "failed"
                      ? <Badge variant="danger">Failed</Badge>
                      : <Badge variant="warning">Running</Badge>}
                  </TD>
                  <TD>{fmtDate(b.createdAt, "MMM dd, yyyy hh:mm a")}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <RunBackupModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
