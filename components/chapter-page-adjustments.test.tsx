// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChapterPage } from "./chapter-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const chapter = { id: "chapter", idx: 0, title: "Separation", status: "passed", pretest: null };
const course = { course: { topic: "Differential equations" }, chapters: [chapter] };
const lesson = { chapter, html: "Saved separation lesson" };
const response = (status = 200) => ({ ok: status >= 200 && status < 300, status });
const actions = [
  { name: "Too easy", action: "easy", path: "/api/chapters/chapter", success: "Feedback saved: too easy. Chapter update requested." },
  { name: "Too hard", action: "hard", path: "/api/chapters/chapter", success: "Feedback saved: too hard. Chapter update requested." },
  { name: "Regenerate chapter", action: "regenerate", path: "/api/chapters/chapter/regenerate", success: "Chapter regenerated." },
];

async function mount() {
  // Seed ready, completed content to isolate actions from generation and prefetching.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 3 } } });
  clients.push(client);
  client.setQueryData(["course", "course"], course);
  client.setQueryData(["chapter", "chapter"], lesson);
  client.setQueryData(["quiz-v2", "course", "0"], { evidence: "existing assessment" });
  const post = vi.fn();
  const fetch = vi.fn((url: string, init?: RequestInit) => init?.method === "POST" ? post(url, init) : Promise.resolve({ ...response(), json: async () => lesson }));
  vi.stubGlobal("fetch", fetch);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><ChapterPage /></QueryClientProvider>);
  expect(await screen.findByText(lesson.html)).toBeVisible();
  const controls = within(screen.getByRole("region", { name: "Chapter adjustments" }));
  return { client, post, fetch, invalidate, controls };
}

it.each(actions)("announces $name progress, blocks duplicate/conflicting actions, and acknowledges success", async ({ name, action, path, success }) => {
  const { controls, post, fetch, invalidate, client } = await mount();
  let resolve!: (value: unknown) => void;
  post.mockImplementation(() => new Promise(done => { resolve = done; }));
  const button = controls.getByRole("button", { name });
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent(action === "regenerate" ? "Regenerating chapter…" : "Saving difficulty feedback and updating chapter…"));
  for (const control of controls.getAllByRole("button")) {
    expect(control).toBeDisabled();
    fireEvent.click(control);
  }
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(path, action === "regenerate" ? { method: "POST" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty: action }) });
  expect(screen.getByText(lesson.html)).toBeVisible();
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => resolve(response()));
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent(success));
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ["chapter", "chapter"] });
  expect(fetch.mock.calls.filter(([, init]) => !init)).toEqual([["/api/chapters/chapter"]]);
  controls.getAllByRole("button").forEach(control => expect(control).toBeEnabled());
  expect(controls.queryByRole("alert")).not.toBeInTheDocument();
  expect(client.getQueryData(["course", "course"])).toEqual(course);
  expect(client.getQueryData(["quiz-v2", "course", "0"])).toEqual({ evidence: "existing assessment" });
});

it.each(actions.flatMap(action => ["http", "network"].map(failure => ({ ...action, failure }))))("keeps the lesson after $name $failure failure and only retries on explicit action", async ({ name, action, failure, success }) => {
  const { controls, post, fetch, invalidate, client } = await mount();
  if (failure === "http") post.mockResolvedValue(response(503));
  else post.mockRejectedValue(new TypeError("Failed to fetch"));
  fireEvent.click(controls.getByRole("button", { name }));
  expect(await controls.findByRole("alert")).toHaveTextContent(action === "regenerate" ? "Could not regenerate this chapter. Select Regenerate chapter to try again." : `Could not save difficulty feedback. Select Too ${action} to try again.`);
  expect(controls.getByRole("status")).toBeEmptyDOMElement();
  expect(screen.getByText(lesson.html)).toBeVisible();
  expect(screen.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/course/ch/0/quiz");
  expect(invalidate).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.isMutating()).toBe(0); // Explicit retry:false overrides even a retrying provider.
  expect(client.getQueryData(["chapter", "chapter"])).toEqual(lesson);
  expect(client.getQueryData(["quiz-v2", "course", "0"])).toEqual({ evidence: "existing assessment" });
  controls.getAllByRole("button").forEach(control => expect(control).toBeEnabled());
  post.mockResolvedValue(response());
  fireEvent.click(controls.getByRole("button", { name }));
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent(success));
  expect(controls.queryByRole("alert")).not.toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledTimes(1);
});

it("acknowledges accepted regeneration without claiming it has completed", async () => {
  const { controls, post } = await mount();
  post.mockResolvedValue(response(202));
  fireEvent.click(controls.getByRole("button", { name: "Regenerate chapter" }));
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent("Chapter regeneration requested. The chapter is being prepared."));
  expect(controls.getByRole("status")).not.toHaveTextContent("Chapter regenerated.");
});

it("clears a previous action's outcome when another adjustment starts", async () => {
  const { controls, post } = await mount();
  post.mockResolvedValueOnce(response());
  fireEvent.click(controls.getByRole("button", { name: "Too easy" }));
  await waitFor(() => expect(controls.getByRole("status")).toHaveTextContent("Feedback saved: too easy."));
  post.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fireEvent.click(controls.getByRole("button", { name: "Too hard" }));
  expect(await controls.findByRole("alert")).toHaveTextContent("Select Too hard to try again.");
  expect(controls.getByRole("status")).not.toHaveTextContent("Feedback saved");
});

it.each([
  { action: "easy", name: "Too easy", label: "Deeper explanation" },
  { action: "hard", name: "Too hard", label: "Simpler explanation" },
])("keeps the original text visible while $name generates and appends the accepted version", async ({ action, name, label }) => {
  const { client, post, fetch, controls } = await mount();
  client.setQueryData(["course", "course"], { ...course, course: { ...course.course, qualityPolicyVersion: 1 } });
  const original = { generationVersion: 1, depthHint: null, html: lesson.html };
  const pending = { ...lesson, chapter: { ...chapter, contentGenerationVersion: 2, contentGenerationStatus: "generating", depthHint: action }, versions: [original] };
  const ready = { ...pending, chapter: { ...pending.chapter, contentGenerationStatus: "ready" }, versions: [original, { generationVersion: 2, depthHint: action, html: "Adjusted lesson text" }] };
  post.mockResolvedValue(response());
  let reads = 0;
  fetch.mockImplementation((url: string, init?: RequestInit) => init?.method === "POST" ? post(url, init) : Promise.resolve({ ...response(), json: async () => ++reads === 1 ? pending : ready }));

  fireEvent.click(controls.getByRole("button", { name }));
  expect(await screen.findByText(/Your earlier text is still available above/)).toBeVisible();
  expect(screen.getByText(lesson.html)).toBeVisible();
  expect(screen.getByRole("heading", { name: "Original explanation" })).toBeVisible();
  controls.getAllByRole("button").forEach(control => expect(control).toBeDisabled());

  expect(await screen.findByText("Adjusted lesson text", {}, { timeout: 4_000 })).toBeVisible();
  expect(screen.getByText(lesson.html)).toBeVisible();
  expect(screen.getByRole("heading", { name: label })).toBeVisible();
  expect(screen.getAllByRole("article").map(article => article.textContent)).toEqual([lesson.html, "Adjusted lesson text"]);
  controls.getAllByRole("button").forEach(control => expect(control).toBeEnabled());
});

it("keeps the original explanation visible if the adjusted version fails", async () => {
  const { client, controls } = await mount();
  await act(async () => client.setQueryData(["chapter", "chapter"], {
    ...lesson,
    chapter: { ...chapter, contentGenerationVersion: 2, contentGenerationStatus: "failed", depthHint: "hard" },
    versions: [{ generationVersion: 1, depthHint: null, html: lesson.html }],
  }));
  expect(screen.getByText(lesson.html)).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare the new explanation. Your earlier text is still available.");
  expect(screen.queryByRole("heading", { name: "Could not load chapter" })).not.toBeInTheDocument();
  expect(controls.getByRole("button", { name: "Regenerate chapter" })).toBeEnabled();
});
