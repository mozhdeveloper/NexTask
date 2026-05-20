"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/PageHeader";
import { useDataStore } from "@/store/dataStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useRequireRole, useAuth } from "@/hooks/useAuth";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { Role } from "@/lib/constants";
import { toast } from "sonner";
import { logService } from "@/services/log.service";
import { workSettingsService } from "@/services/workSettings.service";
import { cn } from "@/lib/utils";

type PermMap = Record<Role, string[]>;

export default function UsersRolesPage() {
  const { ready } = useRequireRole(["admin"]);
  const me = useAuth();
  const users = useDataStore((s) => s.users);
  const stored = useDataStore((s) => s.permissions);
  const dataHydrated = useDataStore((s) => s.hydrated);
  const setPermissions = useDataStore((s) => s.setPermissions);
  const [saving, setSaving] = useState(false);

  // Initialize draft to DEFAULT_PERMISSIONS; re-sync once after the data store
  // is fully hydrated from Supabase (avoids capturing stale localStorage value
  // that hasn't been overwritten by the DB load yet).
  const [draft, setDraft] = useState<PermMap>(DEFAULT_PERMISSIONS);
  const syncedRef = useRef(false);
  useEffect(() => {
    if (dataHydrated && !syncedRef.current) {
      syncedRef.current = true;
      setDraft(stored);
    }
  }, [dataHydrated, stored]);

  const dirty = useMemo(
    () =>
      (["admin", "manager", "employee"] as Role[]).some(
        (r) =>
          draft[r].length !== stored[r].length ||
          draft[r].some((k) => !stored[r].includes(k))
      ),
    [draft, stored]
  );

  const counts = {
    admin: users.filter((u) => u.role === "admin" && u.isActive).length,
    manager: users.filter((u) => u.role === "manager" && u.isActive).length,
    employee: users.filter((u) => u.role === "employee" && u.isActive).length,
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof ALL_PERMISSIONS>();
    ALL_PERMISSIONS.forEach((p) => {
      const arr = map.get(p.group) ?? [];
      arr.push(p);
      map.set(p.group, arr);
    });
    return Array.from(map.entries());
  }, []);

  const toggle = (role: Role, key: string) => {
    if (role === "admin") return;
    const perm = ALL_PERMISSIONS.find((p) => p.key === key);
    if (perm?.locked) return;
    setDraft((d) => {
      const cur = d[role];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...d, [role]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const err = await workSettingsService.savePermissions(draft);
      if (err) {
        toast.error("Failed to save permissions. Please try again.");
        return;
      }
      // Update local store/localStorage cache after successful DB write.
      setPermissions(draft);
      void logService.append({
        userId: me?.id ?? "",
        action: "settings.permissions_update",
        targetType: "permissions",
      });
      toast.success("Permissions saved.");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setDraft({ ...DEFAULT_PERMISSIONS });
    toast.info("Reverted to defaults — click Save to apply.");
  };

  if (!ready || !dataHydrated) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        description="Toggle permissions per role. Changes take effect immediately after saving."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving}>
              <RotateCcw className="h-4 w-4" /> Defaults
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {(["admin", "manager", "employee"] as Role[]).map((r) => (
          <Card key={r}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {r}
                </CardTitle>
                <Badge variant={r === "admin" ? "danger" : r === "manager" ? "warning" : "info"} className="capitalize">
                  {r}
                </Badge>
              </div>
              <CardDescription>{counts[r]} active member{counts[r] !== 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-ink-muted">
                {(r === "admin" ? ALL_PERMISSIONS.length : draft[r].length)} of {ALL_PERMISSIONS.length} permissions
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>
            Toggle cells to grant or revoke. Admin always has full access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {grouped.map(([group, perms]) => (
            <div key={group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</div>
              <div className="overflow-x-auto rounded-md border border-surface-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-subtle text-xs text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Permission</th>
                      <th className="px-3 py-2 text-center w-20">Admin</th>
                      <th className="px-3 py-2 text-center w-24">Manager</th>
                      <th className="px-3 py-2 text-center w-24">Employee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {perms.map((p) => (
                      <tr key={p.key}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span>{p.label}</span>
                            {p.locked && <Lock className="h-3 w-3 text-ink-soft" />}
                          </div>
                          {p.description && <div className="text-xs text-ink-muted">{p.description}</div>}
                        </td>
                        {(["admin", "manager", "employee"] as Role[]).map((r) => {
                          const checked = r === "admin" || draft[r].includes(p.key);
                          const disabled = r === "admin" || p.locked;
                          return (
                            <td key={r} className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggle(r, p.key)}
                                disabled={disabled}
                                aria-label={`${checked ? "Revoke" : "Grant"} ${p.label} for ${r}`}
                                className={cn(
                                  "inline-flex h-6 w-10 items-center rounded-full border transition",
                                  checked
                                    ? "border-emerald-500 bg-emerald-500/90 justify-end"
                                    : "border-surface-border bg-surface-subtle justify-start",
                                  disabled && "opacity-60 cursor-not-allowed"
                                )}
                              >
                                <span className="mx-0.5 inline-block h-5 w-5 rounded-full bg-white shadow" />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
