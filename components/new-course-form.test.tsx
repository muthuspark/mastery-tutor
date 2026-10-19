// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NewCourseForm } from "./new-course-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); push.mockClear(); });

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


describe("course generation modal", () => {
  beforeEach(() => {
    // jsdom does not implement native top-layer inertness or sequential focus.
    // These doubles verify use of the modal API; the host browser verifies inertness.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  async function beginGeneration() {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: ["codex"], selected: "codex" }) })
      .mockImplementationOnce(() => new Promise((res, rej) => { resolve = res; reject = rej; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    const topic = screen.getByLabelText("I want to learn");
    fireEvent.change(topic, { target: { value: "Linear algebra" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Begin" })).toBeEnabled());
    screen.getByRole("button", { name: "Begin" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    return { topic, fetchMock, resolve, reject };
  }

  it("opens a named native modal, contains both Tab directions, and prevents cancellation", async () => {
    await beginGeneration();
    const dialog = screen.getByRole("dialog", { name: "Building your learning path" });
    const heading = within(dialog).getByRole("heading", { name: "Building your learning path" });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(dialog).toHaveAttribute("open");
    expect(heading).toHaveFocus();
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(heading, { key: "Tab", shiftKey })).toBe(false);
      expect(heading).toHaveFocus();
    }
    expect(fireEvent(dialog, new Event("cancel", { cancelable: true }))).toBe(false);
    expect(dialog).toHaveAttribute("open");
  });

  it("announces changing progress separately from hidden decoration without moving focus", async () => {
    // Track only the generation interval, leaving discovery promises on real timers.
    const interval = vi.spyOn(window, "setInterval");
    await beginGeneration();
    const dialog = screen.getByRole("dialog");
    const heading = within(dialog).getByRole("heading");
    const status = within(dialog).getByRole("status");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Reading the shape of your topic.");
    act(() => { (interval.mock.calls.find((call) => call[1] === 6500)![0] as () => void)(); });
    expect(status).toHaveTextContent("Putting each idea where it can do the most work.");
    expect(heading).toHaveFocus();
    expect(dialog.querySelector(".generation-desk")).toHaveAttribute("aria-hidden", "true");
    expect(dialog.querySelector(".generation-progress")).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["HTTP", "network"])("closes after %s failure and restores an editable topic for recovery", async (failure) => {
    const { topic, resolve, reject, fetchMock } = await beginGeneration();
    await act(async () => {
      if (failure === "HTTP") resolve({ ok: false, json: async () => ({ error: { message: "Please try again." } }) });
      else reject(new Error("offline"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
    expect(topic).toHaveValue("Linear algebra");
    expect(topic).toBeEnabled();
    expect(topic).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(failure === "HTTP" ? "Please try again." : "Could not reach the tutor.");
    expect(screen.getByRole("button", { name: "Begin" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves the creation request and success navigation while staying modal until navigation", async () => {
    const { fetchMock, resolve } = await beginGeneration();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/courses", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "Linear algebra", agent: "codex" }),
    });
    await act(async () => resolve({ ok: true, json: async () => ({ courseId: "test-course" }) }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/course/test-course");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
