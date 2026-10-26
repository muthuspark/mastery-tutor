// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChapterPage } from "./chapter-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
// Practice has its own request lifecycle, covered in socratic-session.test.tsx.
vi.mock("./socratic-session", () => ({ SocraticSession: () => <section aria-label="Chapter practice" /> }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); });

const chapter = { id: "chapter", idx: 0, title: "Separation", status: "passed", pretest: null };
const course = { course: { topic: "Differential equations" }, chapters: [chapter] };
const lesson = { chapter, html: "Saved separation lesson" };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const explanations = { canonicalVersion: 1, baselineExplanationId: "original", effectiveLevel: 2, legacyBaseline: false, sections: [{ id: "original", ordinal: 1, kind: "original", sourceContentVersion: 1, level: 2, label: "Guided", content: "Saved separation lesson", html: "Saved separation lesson" }], activeRequest: null, failedRequest: null };
function mount(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><ChapterPage /></QueryClientProvider>);
  return client;
}
const main = () => within(screen.getByRole("main"));

it("announces loading during both course lookup and chapter loading in the reading shell", async () => {
  let resolveCourse!: (value: unknown) => void;
  let resolveLesson!: (value: unknown) => void;
  mount(vi.fn().mockImplementationOnce(() => new Promise(done => { resolveCourse = done; }))
    .mockImplementationOnce(() => new Promise(done => { resolveLesson = done; }))
    .mockResolvedValue(response(explanations)));
  expect(main().getByRole("status")).toHaveTextContent("Loading chapter…");
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
  await act(async () => resolveCourse(response(course)));
  await waitFor(() => expect(resolveLesson).toBeDefined());
  expect(main().getByRole("status")).toHaveTextContent("Loading chapter…");
  await act(async () => resolveLesson(response(lesson)));
  expect(await screen.findByText(lesson.html)).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("reading-shell");
});

it.each(["http", "network"])("recovers a %s chapter failure with a disabled pending button and read-only requests", async failure => {
  let resolve!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response(course));
  if (failure === "http") fetch.mockResolvedValueOnce(response({}, 503));
  else fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const client = mount(fetch);
  expect(await screen.findByRole("heading", { name: "Could not load chapter" })).toBeVisible();
  expect(main().getByRole("alert")).toHaveTextContent("Could not load this chapter.");
  const retry = main().getByRole("button", { name: "Try again" });
  retry.focus();
  expect(retry).toHaveFocus();
  const back = main().getByRole("link", { name: "Back to course" });
  expect(back).toHaveAttribute("href", "/course/course");
  back.focus();
  expect(back).toHaveFocus();
  fireEvent.click(retry);
  expect(await screen.findByRole("button", { name: "Trying again…" })).toBeDisabled();
  expect(main().getByRole("status")).toHaveTextContent("Trying again…");
  fireEvent.click(main().getByRole("button", { name: "Trying again…" }));
  await act(async () => resolve(response(lesson)));
  expect(await screen.findByText(lesson.html)).toBeVisible();
  expect(main().queryByRole("alert")).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chapters/chapter/explanations"));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/chapters/chapter", "/api/chapters/chapter", "/api/chapters/chapter/explanations"]);
  expect(client.getQueryData(["course", "course"])).toEqual(course);
});

it("retries a failed course lookup before fetching the chapter", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response(course)).mockResolvedValueOnce(response(lesson)).mockResolvedValue(response(explanations));
  mount(fetch);
  await screen.findByRole("alert");
  fireEvent.click(main().getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(lesson.html)).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chapters/chapter/explanations"));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/courses/course", "/api/chapters/chapter", "/api/chapters/chapter/explanations"]);
});

it.each([
  { body: { ...course, chapters: [] }, status: 200 },
  { body: {}, status: 404 },
])("provides course navigation for an unavailable course or chapter ($status)", async ({ body, status }) => {
  const fetch = vi.fn().mockResolvedValue(response(body, status));
  mount(fetch);
  expect(await screen.findByRole("heading", { name: "Chapter unavailable" })).toBeVisible();
  expect(main().getByRole("alert")).toHaveTextContent("This chapter is unavailable.");
  expect(main().getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
  expect(main().queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([403, 404])("handles a terminal chapter response (%s) without offering a futile retry", async status => {
  mount(vi.fn().mockResolvedValueOnce(response(course)).mockResolvedValueOnce(response({}, status)));
  await screen.findByRole("heading", { name: "Chapter unavailable" });
  expect(main().getByRole("alert")).toHaveTextContent(status === 403 ? "This chapter is locked." : "This chapter is unavailable.");
  expect(main().getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
  expect(main().queryByRole("button")).not.toBeInTheDocument();
});

it("preserves all 45 automatic preparation retries, then allows manual recovery", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(response(course)).mockResolvedValue(response({}, 202));
  mount(fetch);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(main().getByRole("status")).toHaveTextContent("Loading chapter…");
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
  expect(fetch).toHaveBeenCalledTimes(47); // course + initial chapter request + 45 retries
  expect(main().getByRole("heading", { name: "Chapter still preparing" })).toBeVisible();
  expect(main().getByRole("status")).toHaveTextContent("still being prepared");
  expect(main().queryByRole("alert")).not.toBeInTheDocument();
  fetch.mockResolvedValueOnce(response(lesson));
  fireEvent.click(main().getByRole("button", { name: "Try again" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(main().getByText(lesson.html)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(49); // recovery also reads the explanation timeline
});

it("automatically recovers a retryable service failure without manual intervention", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(response(course))
    .mockResolvedValueOnce(response({ error: { retryable: true } }, 503)).mockResolvedValueOnce(response(lesson)).mockResolvedValue(response(explanations));
  mount(fetch);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(main().getByRole("status")).toHaveTextContent("Loading chapter…");
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(main().getByText(lesson.html)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("restores the recovery controls when a manual retry also fails", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(course)).mockResolvedValue(response({}, 500));
  mount(fetch);
  await screen.findByRole("alert");
  fireEvent.click(main().getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(await screen.findByRole("button", { name: "Try again" })).toBeEnabled();
  expect(main().getByRole("heading", { name: "Could not load chapter" })).toBeVisible();
  expect(main().getByRole("alert")).toHaveTextContent("Could not load this chapter.");
  fetch.mockResolvedValueOnce(response(lesson)).mockResolvedValue(response(explanations));
  fireEvent.click(main().getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(lesson.html)).toBeVisible();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/chapters/chapter", "/api/chapters/chapter", "/api/chapters/chapter", "/api/chapters/chapter/explanations"]);
});
