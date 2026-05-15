"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitWorkForm } from "@/components/forms/SubmitWorkForm";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { StatusPill } from "@/components/ui/status-pill";
import { useState } from "react";
import { SubmissionDetailsModal } from "@/components/modals/SubmissionDetailsModal";
import type { Submission } from "@/types";

export default function MyWorkPage() {
  const user = useAuth();
  const submissions = useDataStore((s) => s.submissions);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const today = todayISO();
  const recent = submissions.filter((s) => s.userId === user.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return (
    <div className="space-y-6">
      <PageHeader title="My Work" description={`Submit and review your daily work for ${fmtDate(today)}.`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Today’s Submission</CardTitle></CardHeader>
          <CardContent><SubmitWorkForm /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Date</TH><TH>Status</TH><TH>At</TH></TR></THead>
              <TBody>
                {recent.map((s) => (
                  <TR key={s.id} className="cursor-pointer hover:bg-surface-subtle" onClick={() => { setSelected(s); setOpen(true); }}>
                    <TD>{fmtDate(s.date, "MMM dd")}</TD>
                    <TD><StatusPill status={s.status} /></TD>
                    <TD className="text-ink-muted">{fmtTime(s.submittedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <SubmissionDetailsModal open={open} onOpenChange={setOpen} submission={selected} />
    </div>
  );
}
