"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { agentLabels, type Agent } from "@/lib/agent-contracts";
import { useLearningAgent } from "@/lib/use-learning-agent";
import { PROFILE_MAX_LENGTH } from "@/lib/profile-schema";

type Profile = { aboutMe: string; learningAgent: Agent | null };

export function ProfileForm() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<Agent | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const agents = useLearningAgent();
  const profile = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load your profile.");
      return response.json();
    },
    staleTime: 0,
  });
  const save = useMutation({
    mutationFn: async (values: Profile): Promise<Profile> => {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not save your profile. Please try again.");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      void queryClient.invalidateQueries({ queryKey: ["learning-agent"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      setAgentDraft(undefined);
      setDraft(null);
      setSaved(true);
    },
  });

  if (profile.isPending || agents.isPending) return <p className="loading-state ui mt-8 text-sm text-[var(--muted)]" role="status">Loading profile…</p>;
  if (profile.isError || agents.isError) return <div className="mt-8"><p className="ui text-sm text-[var(--accent-dark)]" role="alert">Could not load your profile.</p><button className="button-secondary mt-4" onClick={() => { void profile.refetch(); void agents.refetch(); }}>Try again</button></div>;

  const aboutMe = draft ?? profile.data.aboutMe;
  const currentAgent = agents.data.selected;
  const learningAgent = agentDraft ?? currentAgent;
  const available = agents.data.available;
  return (
    <form className="profile-form mt-8" onSubmit={(event) => { event.preventDefault(); setSaved(false); save.mutate({ aboutMe, learningAgent }); }}>
      <label className="ui text-sm font-bold" htmlFor="learning-agent">Learning agent</label>
      <p id="agent-help" className="mt-2 text-[var(--muted)]">Used for future generation, practice, and grading in all courses. Existing content and progress stay unchanged. Calls already running finish with their starting agent.</p>
      <select id="learning-agent" className="field mt-4" value={learningAgent ?? ""} disabled={save.isPending || available.length === 0} aria-describedby="agent-help agent-current" onChange={(event) => { setAgentDraft(event.target.value as Agent); setSaved(false); save.reset(); }}>
        {!learningAgent ? <option value="">No agent configured</option> : null}
        {learningAgent && !available.includes(learningAgent) ? <option value={learningAgent}>{agentLabels[learningAgent]} — unavailable</option> : null}
        {available.map((agent) => <option key={agent} value={agent}>{agentLabels[agent]}</option>)}
      </select>
      <p id="agent-current" className="ui mt-2 mb-8 text-sm text-[var(--muted)]">{currentAgent ? `Current agent: ${agentLabels[currentAgent]}${available.includes(currentAgent) ? "." : " (unavailable). Configure it on the server or select another agent."}` : "Install Codex or Claude CLI, or configure DEEPSEEK_API_KEY on the server."}</p>
      <label className="ui text-sm font-bold" htmlFor="about-me">About me <span className="font-normal text-[var(--muted)]">(optional)</span></label>
      <p id="profile-help" className="mt-2 text-[var(--muted)]">Describe your work or study background, subjects you know, learning goals, and how you like things explained.</p>
      <textarea id="about-me" className="field mt-4" rows={7} maxLength={PROFILE_MAX_LENGTH} value={aboutMe} disabled={save.isPending} aria-describedby="profile-help profile-count profile-effect" onChange={(event) => { setDraft(event.target.value); setSaved(false); save.reset(); }} placeholder="I’m a software engineer with five years of experience. I’m comfortable with code but new to statistics. Practical examples help me learn." />
      <p id="profile-count" className="ui mt-2 text-right text-xs text-[var(--muted)]">{aboutMe.length.toLocaleString()} / 2,000 characters</p>
      <p id="profile-effect" className="ui mt-5 text-sm text-[var(--muted)]">Your background is saved and shared with your selected AI agent when generating content. Changes apply to future generation; saved lessons and progress stay as they are. Clear this field and save to remove personalization.</p>
      {save.isError ? <p className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{save.error.message}</p> : null}
      {saved ? <p className="ui mt-4 text-sm text-[var(--success)]" role="status">Profile saved.</p> : null}
      <button className="button-primary mt-6" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
