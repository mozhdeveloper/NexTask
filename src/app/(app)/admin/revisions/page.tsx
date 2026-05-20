"use client";
import { useMemo, useState, useEffect } from "react";
import {
  Clock, CheckCircle2, XCircle, Search, MessageSquare,
  CalendarDays, RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RevisionDecisionModal } from "@/components/modals/RevisionDecisionModal";
import { useRequireRole, useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const TAB_CONFIG = {
  pending: {
    label: "Pending",
    Icon: Clock,
    badgeVariant: "warning" as const,
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconText: "text-amber-600",
    emptyTitle: "No pending requests",
    emptyDesc: "You are all caught up! New requests will appear here.",
  },
  approved: {
    label: "Approved",
    Icon: CheckCircle2,
    badgeVariant: "success" as const,
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
    emptyTitle: "No approved requests",
    emptyDesc: "Approved revision requests will appear here.",
  },
  rejected: {
    label: "Rejected",
    Icon: XCircle,
    badgeVariant: "danger" as const,
    dot: "bg-rose-500",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    iconBg: "bg-rose-100",
    iconText: "text-rose-600",
    emptyTitle: "No rejected requests",
    emptyDesc: "Rejected revision requests will appear here.",
  },
  resubmitted: {
    label: "Resubmitted",
    Icon: RefreshCw,
    badgeVariant: "success" as const,
    dot: "bg-teal-500",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    iconBg: "bg-teal-100",
    iconText: "text-teal-600",
    emptyTitle: "No resubmitted requests",
    emptyDesc: "Revisions where employees have re-uploaded their corrected work will appear here.",
  },
} as const;

type Tab = keyof typeof TAB_CONFIG;

export default function RevisionsPage() {
  const { ready } = useRequireRole(["admin", "manager"]);
  const me = useAuth();
  const scopeDeptId = me?.role === "manager" ? me?.departmentId ?? null : null;
  const allRevisions = useDataStore((s) => s.revisions);
  const submissions = useDataStore((s) => s.submissions);
  const users = useDataStore((s) => s.users);
  // Restrict revisions to those belonging to users in the manager's department.
  const revisions = useMemo(() => {
    if (!scopeDeptId) return allRevisions;
    return allRevisions.filter((r) => {
      const sub = submissions.find((s) => s.id === r.submissionId);
      const owner = users.find((u) => u.id === sub?.userId);
      return owner?.departmentId === scopeDeptId;
    });
  }, [allRevisions, submissions, users, scopeDeptId]);
  const [decision, setDecision] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const grouped = useMemo(() => ({
    pending: revisions.filter((r) => r.status === "pending"),
    approved: revisions.filter((r) => r.status === "approved"),
    rejected: revisions.filter((r) => r.status === "rejected"),
    resubmitted: revisions.filter((r) => r.status === "resubmitted"),
  }), [revisions]);

  const filtered = useMemo(() => {
    const base = grouped[tab];
    if (!q.trim()) return base;
    const lq = q.toLowerCase();
    return base.filter((r) => {
      const sub = submissions.find((s) => s.id === r.submissionId);
      const u = users.find((x) => x.id === sub?.userId);
      return (
        (u?.name ?? "").toLowerCase().includes(lq) ||
        r.reason.toLowerCase().includes(lq) ||
        (r.adminNote ?? "").toLowerCase().includes(lq)
      );
    });
  }, [grouped, tab, q, submissions, users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [tab, q]);

  if (!ready) return null;

  const activeCfg = TAB_CONFIG[tab];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revision Requests"
        description="Review, approve, or reject employee submission revision requests."
      />

      {/* Stat cards — click to switch tab */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pending", "approved", "rejected", "resubmitted"] as const).map((t) => {
          const cfg = TAB_CONFIG[t];
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "group rounded-xl border p-3 sm:p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? cn("shadow-sm", cfg.bg, cfg.border)
                  : "border-surface-border bg-white hover:bg-surface-subtle hover:shadow-sm"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                  active ? cn(cfg.iconBg) : "bg-surface-subtle"
                )}>
                  <cfg.Icon className={cn("h-4 w-4", active ? cfg.iconText : "text-ink-muted")} />
                </div>
                <span className={cn(
                  "text-2xl font-bold tabular-nums leading-none",
                  active ? cfg.text : "text-ink"
                )}>
                  {grouped[t].length}
                </span>
              </div>
              <div className={cn(
                "mt-2 text-xs font-semibold uppercase tracking-wide",
                active ? cfg.text : "text-ink-muted"
              )}>
                {cfg.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main card */}
      <Card>
        {/* Card toolbar */}
        <div className="flex flex-col gap-2 border-b border-surface-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium flex-shrink-0",
              activeCfg.bg, activeCfg.text, activeCfg.border
            )}>
              <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", activeCfg.dot)} />
              {activeCfg.label}
            </span>
            <span className="truncate text-sm text-ink-muted">
              {filtered.length} {filtered.length === 1 ? "request" : "requests"}
            </span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Search by name or reason…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <CardContent className="p-0">
          {pageRows.length === 0 ? (
            <EmptyState
              icon={q ? Search : activeCfg.Icon}
              title={q ? "No results found" : activeCfg.emptyTitle}
              description={q ? "Try a different search term." : activeCfg.emptyDesc}
              className="py-14"
            />
          ) : (
            <ul className="divide-y divide-surface-border">
              {pageRows.map((r, i) => {
                const sub = submissions.find((s) => s.id === r.submissionId);
                const u = users.find((x) => x.id === sub?.userId);
                const cfg = TAB_CONFIG[r.status as Tab];
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "px-4 py-4 transition-colors hover:bg-surface-subtle/60 sm:px-5",
                      i === 0 && "rounded-t-xl"
                    )}
                  >
                    {/* Top row: avatar + name + meta */}
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 flex-shrink-0 mt-0.5">
                        <AvatarFallback className={u?.avatarColor ?? "bg-surface-subtle"}>
                          {initials(u?.name ?? "?")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        {/* Name + date + badge row */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold text-ink">{u?.name ?? "Unknown employee"}</span>
                          {sub && (
                            <span className="flex items-center gap-1 text-xs text-ink-muted">
                              <CalendarDays className="h-3 w-3 flex-shrink-0" />
                              {fmtDate(sub.date, "MMM dd, yyyy")}
                            </span>
                          )}
                          <span className="ml-auto flex-shrink-0">
                            <Badge variant={cfg.badgeVariant} className="capitalize">{r.status}</Badge>
                          </span>
                        </div>

                        {/* Reason */}
                        <div className="mt-2 flex items-start gap-1.5">
                          <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-soft" />
                          <p className="text-sm text-ink-muted leading-relaxed">{r.reason}</p>
                        </div>

                        {/* Admin note (if resolved) */}
                        {r.adminNote && (
                          <div className={cn(
                            "mt-2 rounded-lg border px-3 py-2 text-xs",
                            cfg.bg, cfg.border
                          )}>
                            <span className={cn("font-semibold", cfg.text)}>
                              {r.status === "approved" ? "Approval note: " : "Rejection reason: "}
                            </span>
                            <span className="text-ink-muted">{r.adminNote}</span>
                          </div>
                        )}

                        {/* Timestamps */}
                        <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-ink-soft">
                          <span>Requested {fmtDate(r.createdAt, "MMM dd, yyyy")}</span>
                          {r.decidedAt && (
                            <span>
                              {r.status === "approved" ? "Approved" : "Rejected"} {fmtDate(r.decidedAt, "MMM dd, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons for pending */}
                    {r.status === "pending" && (
                      <div className="mt-3 flex gap-2 pl-12">
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none"
                          onClick={() => setDecision({ id: r.id, mode: "approve" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="flex-1 sm:flex-none"
                          onClick={() => setDecision({ id: r.id, mode: "reject" })}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="border-t border-surface-border px-5 py-3">
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </CardContent>
      </Card>

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