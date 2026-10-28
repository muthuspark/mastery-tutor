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

it("announces loading inside the reading course overview landmark", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
  expect(screen.getByRole("status")).toHaveTextContent("Loading course…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("retries only course reads while preserving mastered progress", async () => {
  let finishRetry!: (response: unknown) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursePage /></QueryClientProvider>);

  expect(await screen.findByRole("heading", { level: 1, name: "Course unavailable" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load this course.");
  expect(screen.queryByRole("link", { name: /^Back to/ })).not.toBeInTheDocument();

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
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
  expect(screen.getByText("1 of 1 chapters mastered")).toBeInTheDocument();
  expect(screen.getByText("You completed this course.")).toBeInTheDocument();
  expect(screen.queryByText("Could not load this course.")).not.toBeInTheDocument();
  expect(fetch.mock.calls).toEqual([["/api/courses/course"], ["/api/courses/course"]]);
});

it("gives an empty course a descriptive heading without back controls or completion", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Empty course" }, chapters: [], progress: { passed: 0, total: 0 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(await screen.findByRole("heading", { level: 2, name: "No chapters available" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
  expect(screen.getByRole("region", { name: "No chapters available" })).toHaveTextContent("This course has no chapters yet.");
  expect(screen.queryByRole("link", { name: /^Back to/ })).not.toBeInTheDocument();
  expect(screen.getByText("0 of 0 chapters mastered")).toBeInTheDocument();
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
  const read = await screen.findByRole("link", { name: "Read → Separation" });
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
  expect(screen.getByText("1 of 1 chapters mastered")).toBeInTheDocument();
  expect(screen.getByText("You completed this course.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retake mastery check → Separation" })).toHaveAttribute("aria-haspopup", "dialog");
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
  expect(screen.queryByRole("link", { name: /Read/ })).not.toBeInTheDocument();
  expect(screen.getByText("Locked")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Integration/ })).not.toBeInTheDocument();
});

it.each([
  { label: "mixed statuses", statuses: ["passed", "open", "locked"], current: 1 },
  { label: "multiple open chapters after a retake", statuses: ["open", "passed", "open", "locked"], current: 0 },
])("keeps continuation in the chapter outline with one progress summary: $label", async ({ statuses, current }) => {
  const chapters = statuses.map((status, idx) => ({ id: `chapter-${idx}`, idx, title: `Lesson ${idx + 1}`, status }));
  const passed = statuses.filter(status => status === "passed").length;
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Learning navigation" }, chapters, progress: { passed, total: chapters.length },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);

  const continuation = await screen.findByRole("link", { name: `Lesson ${current + 1} Continue →` });
  expect(screen.queryByRole("link", { name: /^Continue:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText("A course in")).not.toBeInTheDocument();
  expect(continuation).toHaveAttribute("href", `/course/course/ch/${current}`);
  expect(continuation).not.toHaveAttribute("aria-haspopup");
  expect(screen.getAllByText(`${passed} of ${chapters.length} chapters mastered`)).toHaveLength(1);
  continuation.focus();
  expect(continuation).toHaveFocus();

  const outline = screen.getByRole("list");
  const rows = within(outline).getAllByRole("listitem");
  expect(rows).toHaveLength(chapters.length);
  chapters.forEach((chapter, index) => {
    expect(within(rows[index]).getByText(chapter.title)).toBeInTheDocument();
    if (chapter.status === "open") {
      expect(within(rows[index]).getByRole("link", { name: `${chapter.title} Continue →` })).toHaveAttribute("href", `/course/course/ch/${chapter.idx}`);
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
  expect(screen.getByText(`${statuses.filter(status => status === "passed").length} of ${statuses.length} chapters mastered`)).toBeInTheDocument();
});

it("keeps the full chapter title in the outline Continue link", async () => {
  const title = "Understanding how differential equations describe interconnected systems and their behavior over time";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Long lesson titles" },
    chapters: [{ id: "long-title", idx: 3, title, status: "open" }],
    progress: { passed: 0, total: 1 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  const continuation = await screen.findByRole("link", { name: `${title} Continue →` });
  expect(continuation).toHaveAttribute("href", "/course/course/ch/3");
  expect(continuation).toHaveTextContent(title);
  expect(continuation).toHaveTextContent("Continue →");
});

async function renderMasteredCourse() {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({
    course: { topic: "Differential equations" },
    chapters: [{ id: "passed", idx: 0, title: "Separation", status: "passed" }],
    progress: { passed: 1, total: 1 },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursePage /></QueryClientProvider>);
  const trigger = await screen.findByRole("button", { name: "Retake mastery check → Separation" });
  trigger.focus();
  fireEvent.click(trigger);
  return { fetch, trigger, dialog: screen.getByRole("dialog", { name: "Reset Separation?" }) };
}

it.each([
  { label: "mixed", statuses: ["passed", "open", "passed", "locked"] },
  { label: "entirely mastered", statuses: ["passed", "passed", "passed"] },
])("keeps every chapter in order with separate reading and retake controls in each mastered row: $label", async ({ statuses }) => {
  const chapters = statuses.map((status, idx) => ({
    id: `chapter-${idx}`, idx, status, prerequisites: [],
    title: idx === 0 ? "Understanding interconnected systems and their behavior over time with a very long chapter title" : `Lesson ${idx + 1}`,
  }));
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Compact outline" }, chapters,
    progress: { passed: statuses.filter(status => status === "passed").length, total: chapters.length },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Compact outline" });
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows).toHaveLength(chapters.length);
  for (const [index, chapter] of chapters.entries()) {
    const row = rows[index];
    expect(within(row).getByText(chapter.title)).toBeVisible();
    if (chapter.status !== "passed") continue;
    expect(within(row).getByRole("img", { name: "Completed" })).toBeVisible();
    const read = within(row).getByRole("link", { name: `Read → ${chapter.title}` });
    const retake = within(row).getByRole("button", { name: `Retake mastery check → ${chapter.title}` });
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).getAllByRole("button")).toHaveLength(1);
    expect(read).toHaveAttribute("href", `/course/course/ch/${chapter.idx}`);
    expect(retake).toHaveAttribute("aria-haspopup", "dialog");
    expect(retake.closest(".chapter-row")).toBe(read.closest(".chapter-row"));
    expect(row.children).toHaveLength(1);
    read.focus();
    expect(read).toHaveFocus();
    retake.focus();
    fireEvent.click(retake);
    const dialog = screen.getByRole("dialog", { name: `Reset ${chapter.title}?` });
    expect(within(dialog).getByRole("button", { name: "Keep mastered" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep mastered" }));
    expect(retake).toHaveFocus();
  }
  expect(fetch.mock.calls).toEqual([["/api/courses/course"]]);
  expect(push).not.toHaveBeenCalled();
});

it("discloses the chapter quiz reset consequences visibly and in the dialog description", async () => {
  const { dialog } = await renderMasteredCourse();
  const disclosure = "This chapter’s current mastery result and quiz questions will be cleared, along with saved answers and review items associated with those questions. We’ll generate a fresh set of questions so you can measure what you know again.";
  expect(within(dialog).getByText(disclosure)).toBeVisible();
  expect(dialog).toHaveAccessibleDescription(disclosure);
});

it("safely cancels retaking with focus restored without mutation", async () => {
  const { fetch, trigger, dialog } = await renderMasteredCourse();
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
  expect(screen.getByText("1 of 1 chapters mastered")).toBeInTheDocument();
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

it.each([{ prerequisites: [] }, { prerequisites: [0] }, { prerequisites: [2, 0, 1] }, { prerequisites: [99, 0] }])("keeps locked chapters compact and non-navigable with prerequisites $prerequisites", async ({ prerequisites }) => {
  const chapters = [
    { id: "foundation", idx: 0, title: "Foundations", status: "passed", prerequisites: [] },
    { id: "practice", idx: 1, title: "Practice", status: "open", prerequisites: [] },
    { id: "advanced", idx: 3, title: "Advanced applications", status: "locked", prerequisites },
  ];
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Compact course" }, chapters, progress: { passed: 1, total: 3 },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  const row = (await screen.findByText("Advanced applications")).closest("li")!;
  expect(within(row).getByText("Locked")).toBeVisible();
  expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText(/unlocks|prerequisites/i)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Practice Continue →" })).toHaveAttribute("href", "/course/course/ch/1");
  fireEvent.click(within(row).getByText("Locked"));
  expect(push).not.toHaveBeenCalled();
  expect(fetch.mock.calls).toEqual([["/api/courses/course"]]);
});
