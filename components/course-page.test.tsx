// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CoursePage } from "./course-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course" }), useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("announces loading inside the wide course overview landmark", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(screen.getByRole("main")).toHaveClass("page-shell");
  expect(screen.getByRole("status")).toHaveTextContent("Loading course…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("offers a local exit and retries only course reads while preserving mastered progress", async () => {
  let finishRetry!: (response: unknown) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursePage /></QueryClientProvider>);

  expect(await screen.findByRole("heading", { level: 1, name: "Course unavailable" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("page-shell");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load this course.");
  const back = screen.getByRole("link", { name: "Back to learning" });
  expect(back).toHaveAttribute("href", "/");
  back.focus();
  expect(back).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  const pending = await screen.findByRole("button", { name: "Trying again…" });
  expect(pending).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Loading course…");
  fireEvent.click(pending);
  expect(fetch).toHaveBeenCalledTimes(2);

  await act(async () => finishRetry({ ok: true, json: async () => ({
    course: { topic: "Recovered course" },
    chapters: [{ id: "passed", idx: 0, title: "Foundations", status: "passed" }],
    progress: { passed: 1, total: 1 },
  }) }));
  expect(await screen.findByRole("heading", { name: "Recovered course" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("page-shell");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("You completed this course.")).toBeInTheDocument();
  expect(screen.queryByText("Could not load this course.")).not.toBeInTheDocument();
  expect(fetch.mock.calls).toEqual([["/api/courses/course"], ["/api/courses/course"]]);
});

it("gives an empty course a descriptive heading and focusable learning exit without completion", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Empty course" }, chapters: [], progress: { passed: 0, total: 0 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(await screen.findByRole("heading", { level: 2, name: "No chapters available" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("page-shell");
  expect(screen.getByRole("region", { name: "No chapters available" })).toHaveTextContent("This course has no chapters yet.");
  const back = screen.getByRole("link", { name: "Back to learning" });
  expect(back).toHaveAttribute("href", "/");
  back.focus();
  expect(back).toHaveFocus();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  expect(screen.queryByText("You completed this course.")).not.toBeInTheDocument();
});

it("offers completed chapters a normal reading link without invoking reset", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Differential equations" },
    chapters: [{ id: "passed", idx: 0, title: "Separation", status: "passed" }],
    progress: { passed: 1, total: 1 },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  const read = await screen.findByRole("link", { name: "Read lesson → Separation" });
  expect(read).toHaveAttribute("href", "/course/course/ch/0");
  expect(read).not.toHaveAttribute("aria-haspopup");
  read.focus();
  expect(read).toHaveFocus();
  // Cancel jsdom navigation after observing whether the component intercepted it.
  let intercepted: boolean | undefined;
  const observeNavigation = (event: MouseEvent) => { intercepted = event.defaultPrevented; event.preventDefault(); };
  document.addEventListener("click", observeNavigation);
  fireEvent.click(read);
  document.removeEventListener("click", observeNavigation);
  expect(intercepted).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/courses/course");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("You completed this course.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Separation\s*Mastered\s*Revisit →/ })).toHaveAttribute("aria-haspopup", "dialog");
});

it("keeps open and locked chapter actions unchanged", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Differential equations" }, chapters: [
      { id: "open", idx: 0, title: "Separation", status: "open" },
      { id: "locked", idx: 1, title: "Integration", status: "locked" },
    ], progress: { passed: 0, total: 2 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(await screen.findByRole("link", { name: /Separation\s*Continue →/ })).toHaveAttribute("href", "/course/course/ch/0");
  expect(screen.queryByRole("link", { name: /Read lesson/ })).not.toBeInTheDocument();
  expect(screen.getByText("Locked")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Integration/ })).not.toBeInTheDocument();
});
