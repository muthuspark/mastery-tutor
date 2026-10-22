"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentStatus } from "./agent-contracts";

export function useLearningAgent() {
  return useQuery<AgentStatus>({
    queryKey: ["learning-agent"],
    queryFn: async () => {
      const response = await fetch("/api/agents", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not check learning agent");
      return response.json();
    },
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });
}
