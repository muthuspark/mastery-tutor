// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as testingRender, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
function render(ui: ReactNode) {
  return testingRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{ui}</QueryClientProvider>);
}
import { NewCourseForm } from "./new-course-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); push.mockClear(); });

describe("NewCourseForm", () => {
  it("shows one topic field and enables Begin once an agent is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: ["codex"], selected: "codex" }) }));
    render(<NewCourseForm />);
    expect(screen.getByLabelText("What do you want to learn?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Finding learning agents");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create study →" })).toBeEnabled());
    expect(screen.queryByText("Beginner")).not.toBeInTheDocument();
  });

  it("keeps Begin disabled when no agent is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: [], selected: null }) }));
    render(<NewCourseForm />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Configure a learning agent");
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
    expect(fetchMock.mock.calls).toEqual([["/api/agents", { cache: "no-store" }]]);
  });

  it("preserves the topic, announces a single pending retry, and recovers without creating a course", async () => {
    let resolveDiscovery!: (response: unknown) => void;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    const topic = screen.getByLabelText("What do you want to learn?");
    fireEvent.change(topic, { target: { value: "Linear algebra" } });
    const retry = await screen.findByRole("button", { name: "Retry agent discovery" });
    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(await screen.findByRole("status")).toHaveTextContent("Finding learning agents…");
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(topic).toHaveValue("Linear algebra");
    expect(topic).toBeEnabled();
    // Form submission must also be guarded while discovery is pending.
    fireEvent.submit(topic.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => resolveDiscovery({ ok: true, json: async () => ({ available: ["claude"], selected: "claude" }) }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create study →" })).toBeEnabled());
    expect(screen.getByText(/Using Claude CLI/)).toBeVisible();
    expect(topic).toHaveValue("Linear algebra");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toEqual([["/api/agents", { cache: "no-store" }], ["/api/agents", { cache: "no-store" }]]);
  });

  it("allows another retry after repeated failure and shows installation guidance only after empty success", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: [], selected: null }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    fireEvent.change(screen.getByLabelText("What do you want to learn?"), { target: { value: "Linear algebra" } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry agent discovery" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry agent discovery" })).toBeEnabled());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not check for learning agents");
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry agent discovery" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Configure a learning agent in Profile settings to begin."));
    expect(screen.queryByRole("button", { name: "Retry agent discovery" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
    expect(screen.getByLabelText("What do you want to learn?")).toHaveValue("Linear algebra");
    expect(fetchMock.mock.calls).toEqual([["/api/agents", { cache: "no-store" }], ["/api/agents", { cache: "no-store" }], ["/api/agents", { cache: "no-store" }]]);
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
    const topic = screen.getByLabelText("What do you want to learn?");
    fireEvent.change(topic, { target: { value: "Linear algebra" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create study →" })).toBeEnabled());
    screen.getByRole("button", { name: "Create study →" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Create study →" }));
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

  it("announces only the real request state without simulated review progress", async () => {
    // Track only the generation interval, leaving discovery promises on real timers.
    const interval = vi.spyOn(window, "setInterval");
    await beginGeneration();
    const dialog = screen.getByRole("dialog");
    const heading = within(dialog).getByRole("heading");
    const status = within(dialog).getByRole("status");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Creating your saved course.");
    expect(interval.mock.calls.some((call) => call[1] === 6500)).toBe(false);
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
    expect(screen.getByRole("button", { name: "Create study →" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves the creation request and success navigation while staying modal until navigation", async () => {
    const { fetchMock, resolve } = await beginGeneration();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/courses", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "Linear algebra" }),
    });
    await act(async () => resolve({ ok: true, json: async () => ({ courseId: "test-course" }) }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/course/test-course");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("DeepSeek selection", () => {
  it("supports DeepSeek alone and identifies it in the generation modal", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ available: ["deepseek"], selected: "deepseek" }) })
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewCourseForm />);
    expect(await screen.findByText(/Using DeepSeek API/)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What do you want to learn?"), { target: { value: "Linear algebra" } });
    fireEvent.click(screen.getByRole("button", { name: "Create study →" }));
    expect(within(screen.getByRole("dialog")).getByText("DeepSeek API")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/courses", expect.objectContaining({ body: JSON.stringify({ topic: "Linear algebra" }) }));
    cleanup();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("shows the saved agent with a settings link instead of a home selector", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: ["claude", "deepseek"], selected: "deepseek" }) }));
    render(<NewCourseForm />);
    expect(await screen.findByText(/Using DeepSeek API/)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change learning agent in profile settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows an unavailable saved agent and prevents course creation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: ["codex"], selected: "deepseek" }) }));
    render(<NewCourseForm />);
    expect(await screen.findByText(/Unavailable: DeepSeek API/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create study →" })).toBeDisabled();
  });
});
