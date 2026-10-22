// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";
import { LearningAgentStatus } from "./learning-agent-status";
import type { Agent } from "@/lib/agent-contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(options: { failSave?: boolean; unavailable?: boolean; failLoad?: boolean } = {}) {
  let profile: { aboutMe: string; learningAgent: Agent | null } = { aboutMe: "Engineer", learningAgent: "codex" };
  let failLoad = options.failLoad;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/agents") return Response.json({ available: options.unavailable ? ["deepseek"] : ["codex", "deepseek"], selected: profile.learningAgent });
    if (init?.method === "PUT") {
      if (options.failSave) return Response.json({ error: { message: "Could not save your profile. Please try again." } }, { status: 503 });
      const values = JSON.parse(init.body as string);
      profile = { ...values, aboutMe: values.aboutMe.trim() };
      return Response.json(profile);
    }
    if (failLoad) { failLoad = false; return new Response(null, { status: 500 }); }
    return Response.json(profile);
  });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LearningAgentStatus /><ProfileForm /></QueryClientProvider>);
  return { fetch, profile: () => profile };
}
it("saves the agent and background together and refreshes the visible current agent", async () => {
  const { fetch } = setup();
  const field = await screen.findByLabelText(/About me/);
  expect(field).toHaveAttribute("maxlength", "2000");
  const selector = screen.getByRole("combobox", { name: "Learning agent" });
  expect(selector).toHaveValue("codex");
  fireEvent.change(selector, { target: { value: "deepseek" } });
  expect(screen.getByText(/Current agent: Codex CLI/)).toBeVisible();
  fireEvent.change(field, { target: { value: " Scientist " } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  await waitFor(() => expect(screen.getByText(/Current agent: DeepSeek API/)).toBeVisible());
  expect(screen.getByText("DeepSeek API", { selector: "span" })).toBeVisible();
  expect(field).toHaveValue("Scientist");
  const put = fetch.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(JSON.parse(put[1]!.body as string)).toEqual({ aboutMe: " Scientist ", learningAgent: "deepseek" });
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(field).toHaveValue("");
});
it("preserves unsaved text and agent after a failed save without changing the active label", async () => {
  setup({ failSave: true });
  const field = await screen.findByLabelText(/About me/);
  fireEvent.change(field, { target: { value: "Keep this draft" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "deepseek" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(field).toHaveValue("Keep this draft");
  expect(screen.getByRole("combobox")).toHaveValue("deepseek");
  expect(screen.getByText(/Current agent: Codex CLI/)).toBeVisible();
});
it("offers retry after a failed load", async () => {
  setup({ failLoad: true });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText(/About me/)).toHaveValue("Engineer");
});
it("keeps unavailable saved agents visible until the user chooses a replacement", async () => {
  setup({ unavailable: true });
  const selector = await screen.findByRole("combobox");
  expect(selector).toHaveValue("codex");
  expect(screen.getByRole("option", { name: "Codex CLI — unavailable" })).toBeVisible();
  expect(screen.getByText("Codex CLI · unavailable")).toBeVisible();
});
