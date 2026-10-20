"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PROFILE_MAX_LENGTH } from "@/lib/profile-schema";

type Profile = { aboutMe: string };

export function ProfileForm() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
    mutationFn: async (aboutMe: string): Promise<Profile> => {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aboutMe }) });
      if (!response.ok) throw new Error("Could not save your profile. Please try again.");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      setDraft(null);
      setSaved(true);
    },
  });

  if (profile.isPending) return <p className="loading-state ui mt-8 text-sm text-[var(--muted)]" role="status">Loading profile…</p>;
  if (profile.isError) return <div className="mt-8"><p className="ui text-sm text-[var(--accent-dark)]" role="alert">Could not load your profile.</p><button className="button-secondary mt-4" onClick={() => void profile.refetch()}>Try again</button></div>;

  const aboutMe = draft ?? profile.data.aboutMe;
  return (
    <form className="profile-form mt-8" onSubmit={(event) => { event.preventDefault(); setSaved(false); save.mutate(aboutMe); }}>
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
