// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoursePage } from "./course-page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course" }), useRouter: () => ({ push }) }));
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);
beforeEach(() => {
  push.mockClear();
  // jsdom does not implement native dialog methods; browser focus containment
  // and Escape key dispatch remain the responsibility of host Playwright checks.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals();
  for (const method of ["showModal", "close"]) {
    if (dialogMethods[method]) Object.defineProperty(HTMLDialogElement.prototype, method, dialogMethods[method]);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  } });

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
  expect(screen.getByRole("link", { name: /Separation\s*Mastered\s*Retake mastery check →/ })).toHaveAttribute("aria-haspopup", "dialog");
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

it.each([
  { label: "mixed statuses", statuses: ["passed", "open", "locked"], current: 1 },
  { label: "multiple open chapters after a retake", statuses: ["open", "passed", "open", "locked"], current: 0 },
])("names the first open chapter near progress and preserves outline order: $label", async ({ statuses, current }) => {
  const chapters = statuses.map((status, idx) => ({ id: `chapter-${idx}`, idx, title: `Lesson ${idx + 1}`, status }));
  const passed = statuses.filter(status => status === "passed").length;
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Learning navigation" }, chapters, progress: { passed, total: chapters.length },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);

  const continuation = await screen.findByRole("link", { name: `Continue: Lesson ${current + 1} →` });
  expect(screen.getAllByRole("link", { name: /^Continue:/ })).toHaveLength(1);
  expect(continuation).toHaveAttribute("href", `/course/course/ch/${current}`);
  expect(continuation).not.toHaveAttribute("aria-haspopup");
  expect(within(continuation.parentElement!).getByText(`${passed} of ${chapters.length} chapters mastered`)).toBeInTheDocument();
  continuation.focus();
  expect(continuation).toHaveFocus();

  const outline = screen.getByRole("list");
  expect(continuation.compareDocumentPosition(outline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const rows = within(outline).getAllByRole("listitem");
  expect(rows).toHaveLength(chapters.length);
  chapters.forEach((chapter, index) => {
    expect(within(rows[index]).getByText(chapter.title)).toBeInTheDocument();
    if (chapter.status === "open") {
      expect(within(rows[index]).getByRole("link", { name: `${chapter.title}Continue →` })).toHaveAttribute("href", `/course/course/ch/${chapter.idx}`);
    }
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch.mock.calls).toEqual([["/api/courses/course"]]);
});

it.each([
  { label: "empty", statuses: [] },
  { label: "completed", statuses: ["passed", "passed"] },
  { label: "locked-only", statuses: ["locked", "locked"] },
  { label: "mastered and locked", statuses: ["passed", "locked"] },
])("omits the summary Continue link for a $label course", async ({ statuses }) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "No open chapters" },
    chapters: statuses.map((status, idx) => ({ id: `chapter-${idx}`, idx, title: `Lesson ${idx + 1}`, status })),
    progress: { passed: statuses.filter(status => status === "passed").length, total: statuses.length },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "No open chapters" });
  expect(screen.queryByRole("link", { name: /Continue/ })).not.toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Course mastery" })).toBeInTheDocument();
});

it("keeps the full chapter title in the summary Continue link", async () => {
  const title = "Understanding how differential equations describe interconnected systems and their behavior over time";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Long lesson titles" },
    chapters: [{ id: "long-title", idx: 3, title, status: "open" }],
    progress: { passed: 0, total: 1 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  const continuation = await screen.findByRole("link", { name: `Continue: ${title} →` });
  expect(continuation).toHaveAttribute("href", "/course/course/ch/3");
  expect(continuation).toHaveTextContent(`Continue: ${title} →`);
});

async function renderMasteredCourse() {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({
    course: { topic: "Differential equations" },
    chapters: [{ id: "passed", idx: 0, title: "Separation", status: "passed" }],
    progress: { passed: 1, total: 1 },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursePage /></QueryClientProvider>);
  const trigger = await screen.findByRole("link", { name: /Separation\s*Mastered\s*Retake mastery check →/ });
  trigger.focus();
  fireEvent.click(trigger);
  return { fetch, trigger, dialog: screen.getByRole("dialog", { name: "Reset Separation?" }) };
}

it("explains the retake reset and safely cancels with focus restored without mutation", async () => {
  const { fetch, trigger, dialog } = await renderMasteredCourse();
  expect(dialog).toHaveAccessibleDescription("Your current mastery result and quiz questions will be cleared. We’ll generate a fresh set of questions so you can measure what you know again.");
  expect(within(dialog).getByRole("button", { name: "Keep mastered" })).toHaveFocus();
  expect(within(dialog).getByRole("button", { name: "Reset and retake mastery check" })).toBeEnabled();
  // Native Escape dispatches cancel; test that handler independently of jsdom's keyboard support.
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Keep mastered" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(fetch.mock.calls).toEqual([["/api/courses/course"]]);
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
});

it("submits only on explicit retake confirmation and preserves pending and error recovery", async () => {
  const { fetch, dialog } = await renderMasteredCourse();
  let finish!: (response: { ok: boolean }) => void;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Reset and retake mastery check" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/chapters/passed/revisit", { method: "POST" });
  expect(within(dialog).getByRole("button", { name: "Resetting…" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Keep mastered" })).toBeDisabled();
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(dialog).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Could not reset this chapter. Please try again.");
  expect(within(dialog).getByRole("button", { name: "Keep mastered" })).toBeEnabled();
  fetch.mockResolvedValueOnce({ ok: true });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reset and retake mastery check" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/course/course/ch/0"));
  expect(fetch).toHaveBeenCalledTimes(3);
});
