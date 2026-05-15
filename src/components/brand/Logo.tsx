import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/brand/ntlogo.jpg"
        alt="NexTask"
        width={size}
        height={size}
        className="rounded-md"
        priority
      />
      <span className="text-lg font-semibold tracking-tight text-ink">
        Nex<span className="text-primary">Task</span>
      </span>
    </div>
  );
}

export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/ntlogo.jpg"
      alt="NexTask"
      width={size}
      height={size}
      className={cn("rounded-md", className)}
      priority
    />
  );
}
