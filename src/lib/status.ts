import type { SubmissionStatus } from "@/lib/constants";

export const STATUS_META: Record<
  SubmissionStatus,
  { label: string; bg: string; fg: string; dot: string }
> = {
  pending: { label: "Pending", bg: "bg-warning-soft", fg: "text-amber-700", dot: "bg-amber-500" },
  submitted: { label: "Submitted", bg: "bg-success-soft", fg: "text-emerald-700", dot: "bg-emerald-500" },
  revised: { label: "Revised", bg: "bg-sky-50", fg: "text-sky-700", dot: "bg-sky-500" },
  missing: { label: "Missing", bg: "bg-danger-soft", fg: "text-red-700", dot: "bg-red-500" },
  revision_requested: { label: "Revision Requested", bg: "bg-chip-violet", fg: "text-violet-700", dot: "bg-violet-500" },
  revision_approved: { label: "Revision Approved", bg: "bg-chip-mint", fg: "text-emerald-700", dot: "bg-emerald-500" },
  revision_rejected: { label: "Revision Rejected", bg: "bg-chip-rose", fg: "text-rose-700", dot: "bg-rose-500" },
  locked: { label: "Locked", bg: "bg-chip-indigo", fg: "text-indigo-700", dot: "bg-indigo-500" },
  excused: { label: "Excused", bg: "bg-surface-subtle", fg: "text-ink-muted", dot: "bg-ink-soft" },
};

export const AVATAR_COLORS = [
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-sky-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-fuchsia-500",
];

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
