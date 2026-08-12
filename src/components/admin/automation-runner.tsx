"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AutomationRunner() {
  const [pending, startTransition] = useTransition();
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const response = await fetch("/api/admin/automation", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        toast.error(payload.message ?? "Unable to run automation.");
        return;
      }
      const summary = payload.summary as Record<string, number>;
      const text = Object.entries(summary)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ");
      setLastSummary(text);
      toast.success("Automation completed.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={run} disabled={pending}>
        {pending ? "Running..." : "Run automation"}
      </Button>
      {lastSummary ? (
        <p className="text-sm text-[var(--ink-muted)]">{lastSummary}</p>
      ) : null}
    </div>
  );
}
