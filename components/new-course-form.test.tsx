// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NewCourseForm } from "./new-course-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NewCourseForm", () => {
  it("shows one topic field and enables Begin once an agent is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: ["codex"], selected: "codex" }) }));
    render(<NewCourseForm />);
    expect(screen.getByLabelText("I want to learn")).toBeVisible();
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Finding learning agents");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Begin" })).toBeEnabled());
    expect(screen.queryByText("Beginner")).not.toBeInTheDocument();
  });

  it("keeps Begin disabled when no agent is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: [], selected: null }) }));
    render(<NewCourseForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Install the Codex or Claude CLI");
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
  });
});
