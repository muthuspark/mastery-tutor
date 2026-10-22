"use client";

import { useLearningAgent } from "@/lib/use-learning-agent";
import { agentLabels } from "@/lib/agent-contracts";

export function LearningAgentStatus() {
  const status = useLearningAgent();
  const selected = status.data?.selected;
  const unavailable = selected && !status.data?.available.includes(selected);
  return <span className="ui text-xs text-[var(--muted)]" aria-live="polite">
    {status.isPending ? "Checking agent…" : status.isError ? "Agent status unavailable" : selected ? `${agentLabels[selected]}${unavailable ? " · unavailable" : ""}` : "No learning agent configured"}
  </span>;
}
