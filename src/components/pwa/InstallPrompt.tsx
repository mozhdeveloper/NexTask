"use client";
import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "nextask.installPromptDismissed";

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses navigator.standalone; everyone else uses the matchMedia query
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS-only legacy field
    !!window.navigator.standalone
  );
}

/**
 * Lightweight "Add to Home Screen" prompt:
 * - Android / desktop Chrome: uses the captured `beforeinstallprompt`.
 * - iOS Safari: shows manual instructions (Share → Add to Home Screen).
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setEvent(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // For iOS Safari, beforeinstallprompt doesn't fire — show manual hint after a short delay
    if (isIos()) {
      const t = setTimeout(() => {
        setIosHint(true);
        setShow(true);
      }, 3000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBIP);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") localStorage.setItem(DISMISS_KEY, "1");
    setEvent(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-surface-border bg-white p-4 shadow-pop",
        "sm:left-auto sm:right-4 sm:mx-0 sm:w-[360px]",
      )}
      role="dialog"
      aria-label="Install NexTask"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Install NexTask</p>
          {iosHint ? (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Tap{" "}
              <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom text-primary" />{" "}
              Share, then{" "}
              <PlusSquare className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom text-primary" />{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Install the app for a faster, full-screen experience and offline access.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1 text-ink-soft hover:bg-surface-subtle hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!iosHint && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          <Button size="sm" onClick={install} disabled={!event}>
            Install
          </Button>
        </div>
      )}
    </div>
  );
}
