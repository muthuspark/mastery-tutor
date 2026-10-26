// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("saves only optional private background and preserves failed drafts", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ aboutMe: "Engineer" }))
    .mockResolvedValueOnce(Response.json({ error: { message: "Please try again." } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ aboutMe: "Biologist" }))
    .mockResolvedValue(Response.json({ aboutMe: "Biologist" }));
  vi.stubGlobal("fetch", fetcher);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileForm /></QueryClientProvider>);
  const input = await screen.findByLabelText(/About me/);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "Biologist" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("Biologist");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ aboutMe: "Biologist" });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Profile saved."));
});
