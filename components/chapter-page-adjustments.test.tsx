// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChapterPage } from "./chapter-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const chapter = { id: "chapter", idx: 0, title: "Separation", status: "passed", pretest: "What does the constant represent?", contentGenerationVersion: 1, contentGenerationStatus: "ready", generatedAt: "2026-01-01" };
const course = { course: { topic: "Differential equations" }, chapters: [chapter] };
const lesson = { chapter, html: "Canonical lesson" };
const original = { id: "original", ordinal: 1, kind: "original" as const, sourceContentVersion: 1, level: 2 as const, label: "Guided", content: "Guided explanation", html: "Guided explanation" };
const timeline = (overrides: Record<string, unknown> = {}) => ({
  canonicalVersion: 1,
  baselineExplanationId: original.id,
  effectiveLevel: 2 as 1 | 2 | 3 | 4 | 5 | 6,
  legacyBaseline: false,
  sections: [original],
  activeRequest: null,
  failedRequest: null,
  ...overrides,
});
const response = (status = 200, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

async function mount(options: { timeline?: ReturnType<typeof timeline>; chapter?: typeof chapter } = {}) {
  const currentTimeline = { value: options.timeline ?? timeline() };
  const currentChapter = options.chapter ?? chapter;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 2 } } });
  clients.push(client);
  client.setQueryData(["quiz-v2", "course", "0"], { existingAssessment: true });
  const post = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url.endsWith("/retry")) return response(202, { id: "retry-1", level: 1, status: "pending" });
    if (url.endsWith("/explanations")) return response(202, { id: "pending-1", level: 1, status: "pending" });
    return response(202, { status: "generating" });
  });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return post(url, init);
    if (url === "/api/courses/course") return response(200, { ...course, chapters: [currentChapter] });
    if (url === "/api/chapters/chapter") return response(200, { chapter: currentChapter, html: lesson.html });
    if (url === "/api/chapters/chapter/explanations") return response(200, currentTimeline.value);
    if (url === "/api/chapters/chapter/quiz") return response(200, { questions: [] });
    return response(404);
  });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={client}><ChapterPage /></QueryClientProvider>);
  expect(await screen.findByText("Guided explanation")).toBeVisible();
  const controls = within(screen.getByRole("region", { name: "Explanation controls" }));
  return { client, post, fetch, controls, currentTimeline };
}

it("renders every explanation once and places depth controls after the pretest and before the quiz", async () => {
  const applied = { id: "applied", ordinal: 2, kind: "alternative" as const, sourceContentVersion: 1, level: 3 as const, label: "Applied", content: "Applied explanation", html: "Applied explanation" };
  await mount({ timeline: timeline({ baselineExplanationId: applied.id, effectiveLevel: 3, sections: [original, applied] }) });
  expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(["Guided explanation", "Applied explanation"]);
  expect(screen.getByText("Current explanation: Applied (3 of 6)")).toBeVisible();
  const main = screen.getByRole("main");
  const pretest = within(main).getByText(/What does the constant represent/);
  const controls = within(main).getByRole("region", { name: "Explanation controls" });
  const quiz = within(main).getByRole("link", { name: "Check your understanding →" });
  expect(pretest.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(controls.compareDocumentPosition(quiz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("sends an adjacent request once, announces progress, keeps focus, and appends after a reload", async () => {
  const { post, client, controls, currentTimeline } = await mount();
  post.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(url).toBe("/api/chapters/chapter/explanations");
    expect(body).toMatchObject({ direction: "simpler", expectedContentVersion: 1, baselineExplanationId: "original" });
    currentTimeline.value = timeline({ activeRequest: { id: "pending-1", status: "pending", level: 1 } });
    return response(202, { id: "pending-1", level: 1, status: "pending" });
  });
  const button = controls.getByRole("button", { name: "Simpler" });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent("Preparing"));
  expect(post).toHaveBeenCalledTimes(1);
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("Guided explanation")).toBeVisible();
  expect(client.getQueryData(["quiz-v2", "course", "0"])).toEqual({ existingAssessment: true });

  const intuitive = { id: "intuitive", ordinal: 2, kind: "alternative" as const, sourceContentVersion: 1, level: 1 as const, label: "Intuitive", content: "Intuitive explanation", html: "Intuitive explanation" };
  await act(async () => {
    currentTimeline.value = timeline({ baselineExplanationId: intuitive.id, effectiveLevel: 1, sections: [original, intuitive] });
    client.setQueryData(["chapter-explanations", "chapter"], currentTimeline.value);
  });
  await waitFor(() => expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(["Guided explanation", "Intuitive explanation"]));
  expect(screen.getByText("Current explanation: Intuitive (1 of 6)")).toBeVisible();
  expect(controls.getByText("This is the simplest level (1 of 6)." )).toBeVisible();
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toHaveFocus();
});

it("shows boundaries and legacy depth without inventing a level", async () => {
  const intuitive = { ...original, level: 1 as const, label: "Intuitive" };
  const { controls, client } = await mount({ timeline: timeline({ effectiveLevel: 1, sections: [intuitive] }) });
  expect(controls.getByRole("button", { name: "Simpler" })).toHaveAttribute("aria-disabled", "true");
  expect(controls.getByText("This is the simplest level (1 of 6)." )).toBeVisible();
  await act(async () => client.setQueryData(["chapter-explanations", "chapter"], timeline({
    baselineExplanationId: "legacy", legacyBaseline: true, effectiveLevel: 2,
    sections: [{ ...original, id: "legacy", kind: "legacy", level: null, label: null }],
  })));
  expect(screen.queryByText("Depth not recorded. Adjustments start from Guided (2 of 6).")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Explanation" })).toBeVisible();
});

it("offers explicit retry at the saved target and preserves the accepted history", async () => {
  const failedTimeline = timeline({ failedRequest: { id: "failed-1", status: "failed" as const, level: 1 as const, jobVersion: 2 } });
  const { post, controls, currentTimeline, client } = await mount({ timeline: failedTimeline });
  post.mockImplementation(async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/chapters/chapter/explanations/failed-1/retry");
    expect(JSON.parse(String(init?.body))).toMatchObject({ expectedJobVersion: 2 });
    currentTimeline.value = timeline({ activeRequest: { id: "failed-1", status: "pending", level: 1 } });
    return response(202, { id: "failed-1", level: 1, status: "pending" });
  });
  const retry = controls.getByRole("button", { name: "Retry explanation" });
  retry.focus();
  fireEvent.click(retry);
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent("Preparing"));
  expect(post).toHaveBeenCalledTimes(1);
  expect(retry).toHaveFocus();
  expect(screen.getByText("Guided explanation")).toBeVisible();
  expect(client.getQueryData(["quiz-v2", "course", "0"])).toEqual({ existingAssessment: true });
});

it("retains cached explanation text when status reads fail and exposes a read-only retry", async () => {
  const { client } = await mount();
  const cached = client.getQueryData(["chapter-explanations", "chapter"]);
  const fetch = vi.mocked(globalThis.fetch);
  fetch.mockImplementationOnce(async () => response(503, { error: { message: "offline", retryable: false } }));
  await act(async () => { await client.invalidateQueries({ queryKey: ["chapter-explanations", "chapter"] }); });
  expect(screen.getByText("Guided explanation")).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not refresh explanation status");
  expect(client.getQueryData(["chapter-explanations", "chapter"])).toEqual(cached);
  expect(screen.getByRole("button", { name: "Retry status check" })).toBeVisible();
});

it("keeps the quiz link and preserves the current text if a request fails", async () => {
  const { controls, post, client } = await mount();
  post.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fireEvent.click(controls.getByRole("button", { name: "More depth" }));
  expect(await controls.findByRole("alert")).toHaveTextContent("Failed to fetch");
  expect(screen.getByText("Guided explanation")).toBeVisible();
  expect(screen.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/course/ch/0/quiz");
  expect(client.getQueryData(["quiz-v2", "course", "0"])).toEqual({ existingAssessment: true });
  expect(post).toHaveBeenCalledTimes(1);
});
