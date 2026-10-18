// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileForm /></QueryClientProvider>);
}
it("loads, edits, saves trimmed text, and clears", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ aboutMe: "Engineer" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ aboutMe: "Scientist" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ aboutMe: "" }) });
  vi.stubGlobal("fetch", fetch);
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  const field = await screen.findByLabelText(/About me/);
  expect(field).toHaveValue("Engineer");
  expect(field).toHaveAttribute("maxlength", "2000");
  fireEvent.change(field, { target: { value: " Scientist " } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(field).toHaveValue("Scientist");
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ aboutMe: "" });
});
it("preserves draft text after a failed save", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ aboutMe: "" }) }).mockResolvedValueOnce({ ok: false }));
  mount();
  const field = await screen.findByLabelText(/About me/);
  fireEvent.change(field, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(field).toHaveValue("Keep this draft");
});
it("offers retry after a failed load", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ aboutMe: "Recovered" }) }));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText(/About me/)).toHaveValue("Recovered");
});
