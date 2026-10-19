// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
  });

  it.each(["network", "HTTP"])("offers discovery recovery after a %s failure without installation advice", async (failure) => {
    const fetchMock = vi.fn();
    if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
    else fetchMock.mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check for learning agents. Try again.");
    expect(screen.queryByText(/Install the Codex/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry agent discovery" })).toHaveClass("button-secondary");
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
    expect(fetchMock.mock.calls).toEqual([["/api/agents"]]);
  });

  it("preserves the topic, announces a single pending retry, and recovers without creating a course", async () => {
    let resolveDiscovery!: (response: unknown) => void;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    const topic = screen.getByLabelText("I want to learn");
    fireEvent.change(topic, { target: { value: "Linear algebra" } });
    const retry = await screen.findByRole("button", { name: "Retry agent discovery" });
    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(screen.getByRole("status")).toHaveTextContent("Finding learning agents…");
    expect(screen.getByRole("button", { name: "Checking agents…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(topic).toHaveValue("Linear algebra");
    expect(topic).toBeEnabled();
    // Form submission must also be guarded while discovery is pending.
    fireEvent.submit(topic.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => resolveDiscovery({ ok: true, json: async () => ({ available: ["claude"], selected: "claude" }) }));
    expect(screen.getByRole("button", { name: "Begin" })).toBeEnabled();
    expect(screen.getByText("Using Claude CLI")).toBeVisible();
    expect(topic).toHaveValue("Linear algebra");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toEqual([["/api/agents"], ["/api/agents"]]);
  });

  it("allows another retry after repeated failure and shows installation guidance only after empty success", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: [], selected: null }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    fireEvent.change(screen.getByLabelText("I want to learn"), { target: { value: "Linear algebra" } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry agent discovery" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry agent discovery" })).toBeEnabled());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not check for learning agents");
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry agent discovery" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Install the Codex or Claude CLI to begin."));
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Begin" })).toBeDisabled();
    expect(screen.getByLabelText("I want to learn")).toHaveValue("Linear algebra");
    expect(fetchMock.mock.calls).toEqual([["/api/agents"], ["/api/agents"], ["/api/agents"]]);
  });
});
