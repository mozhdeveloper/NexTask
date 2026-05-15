"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { RevisionDecisionModal } from "@/components/modals/RevisionDecisionModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { useRequireRole } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/empty-state";

export default function RevisionsPage() {
  useRequireRole(["admin", "manager"]);
  const revisions = useDataStore((s) => s.revisions);
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  const [decision, setDecision] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");

  const grouped = useMemo(() => ({
    pending: revisions.filter((r) => r.status === "pending"),
    approved: revisions.filter((r) => r.status === "approved"),
    rejected: revisions.filter((r) => r.status === "rejected"),
  }), [revisions]);

  const rows = grouped[tab];

  return (
    <div className="space-y-6">
      <PageHeader title="Revision Requests" description="Review and act on employee revision requests." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="inline-flex rounded-lg bg-surface-subtle p-1">
          {(["pending", "approved", "rejected"] as const).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="rounded-md px-3 py-1.5 text-sm capitalize data-[state=active]:bg-white data-[state=active]:shadow-card"
            >
              {t} <Badge variant="muted" className="ml-2">{grouped[t].length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent>
              {rows.length === 0 ? (
                <EmptyState title={`No ${tab} requests`} description="You're all caught up." />
              ) : (
                <Table>
                  <THead><TR><TH>Employee</TH><TH>Submission date</TH><TH>Reason</TH><TH>Requested</TH><TH /></TR></THead>
                  <TBody>
                    {rows.map((r) => {
                      const sub = submissions.find((s) => s.id === r.submissionId);
                      const u = users.find((x) => x.id === sub?.userId);
                      return (
                        <TR key={r.id}>
                          <TD>
                            <div className="flex items-center gap-2">
                              {u && <Avatar className="h-7 w-7"><AvatarFallback className={u.avatarColor}>{initials(u.name)}</AvatarFallback></Avatar>}
                              <span>{u?.name}</span>
                            </div>
                          </TD>
                          <TD>{sub ? fmtDate(sub.date) : "—"}</TD>
                          <TD className="max-w-md truncate">{r.reason}</TD>
                          <TD className="text-ink-muted">{fmtDate(r.createdAt, "MMM dd, hh:mm a")}</TD>
                          <TD>
                            {r.status === "pending" ? (
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => setDecision({ id: r.id, mode: "approve" })}>
                                  <Check className="h-4 w-4" /> Approve
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => setDecision({ id: r.id, mode: "reject" })}>
                                  <X className="h-4 w-4" /> Reject
                                </Button>
                              </div>
                            ) : (
                              <Badge variant={r.status === "approved" ? "success" : "danger"}>{r.status}</Badge>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {decision && (
        <RevisionDecisionModal
          open={!!decision}
          onOpenChange={(v) => !v && setDecision(null)}
          revisionId={decision.id}
          mode={decision.mode}
        />
      )}
    </div>
  );
}
