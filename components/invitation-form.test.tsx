// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvitationForm } from "./invitation-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("sends an invitation and confirms provider acceptance", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ email: "new@example.com", message: "Invitation accepted for sending." })); vi.stubGlobal("fetch", fetcher);
  render(<InvitationForm />);
  fireEvent.change(screen.getByLabelText("Learner’s email address"), { target: { value: "new@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("new@example.com: Invitation accepted for sending."));
  expect(screen.getByLabelText("Learner’s email address")).toHaveValue("");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ email: "new@example.com" });
});
it("preserves the email for retry when delivery fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Access is enabled, but email could not be sent. Try again." } }, { status: 503 })));
  render(<InvitationForm />); fireEvent.change(screen.getByLabelText("Learner’s email address"), { target: { value: "new@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Access is enabled"));
  expect(screen.getByLabelText("Learner’s email address")).toHaveValue("new@example.com"); expect(screen.getByRole("button", { name: "Send invitation" })).toBeEnabled();
});
