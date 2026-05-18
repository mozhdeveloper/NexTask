"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { authService } from "@/services/auth.service";
import { DEMO_ACCOUNTS, APP_TAGLINE, COMPANY } from "@/lib/constants";
import { useAuth, useHydrated } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const user = useAuth();
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && user) router.replace("/dashboard");
  }, [hydrated, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.login(email, password);
      toast.success("Welcome back!");
      router.replace("/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-[#66B2B2] via-[#5AA0A0] to-[#3F7C7C] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark size={40} className="bg-white p-1" />
          <div>
            <div className="text-xl font-semibold">NexTask</div>
            <div className="text-xs opacity-80">by {COMPANY}</div>
          </div>
        </div>
        <div>
          <div className="text-3xl font-semibold leading-tight">
            Effortless work submissions <br /> for the modern office.
          </div>
          <p className="mt-3 max-w-md text-sm text-white/85">
            Track daily work, manage compliance, run reports, and back up everything — all in one
            polished local-first workspace.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs">
            {["Compliance", "Backups", "Reports"].map((s) => (
              <div key={s} className="rounded-lg bg-white/10 p-3 backdrop-blur">
                <div className="text-sm font-semibold">{s}</div>
                <div className="opacity-75">Built-in</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs opacity-70">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <LogoMark size={36} />
            <div className="text-lg font-semibold">NexTask</div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-1 text-sm text-ink-muted">{APP_TAGLINE}</p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@nexvision.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-surface-subtle"
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Demo accounts
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="rounded-lg border border-surface-border p-3 text-left text-xs hover:border-primary hover:bg-primary-soft/50"
                >
                  <div className="font-semibold capitalize">{a.label}</div>
                  <div className="truncate text-ink-muted">{a.email}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-center text-[11px] text-ink-soft">
              Password for all demo accounts: <code className="rounded bg-surface-subtle px-1">password123</code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
