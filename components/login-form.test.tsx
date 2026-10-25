// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("supports code paste/autofill, failed verification, replacement, and email correction", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ success: true }))
    .mockResolvedValueOnce(Response.json({ error: { message: "This code is incorrect." } }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetcher);
  render(<QueryClientProvider client={new QueryClient()}><LoginForm /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  const input = await screen.findByLabelText("Login code"); expect(input).toHaveFocus(); expect(input).toHaveAttribute("autocomplete", "one-time-code"); expect(input).toHaveAttribute("inputmode", "numeric");
  fireEvent.change(input, { target: { value: "123 456" } }); expect(input).toHaveValue("123456");
  fireEvent.submit(input.closest("form")!); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This code is incorrect."));
  expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "second@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" })); await screen.findByLabelText("Login code");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ email: "second@example.com", type: "sign-in" });
});
it("keeps delivery failures retryable and shows invitation errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Invitation-only." } }, { status: 403 })));
  render(<QueryClientProvider client={new QueryClient()}><LoginForm /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "unknown@example.com" } }); fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invitation-only.")); expect(screen.getByRole("button", { name: "Email me a code" })).toBeEnabled();
});
