// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CoursePage } from "./course-page";
import { ChapterPage } from "./chapter-page";
import { QuizPage } from "./quiz-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }), useRouter: () => ({ push: vi.fn() }) }));
// Practice has its own request lifecycle, covered in socratic-session.test.tsx.
vi.mock("./socratic-session", () => ({ SocraticSession: () => <section aria-label="Chapter practice" /> }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mount(component: React.ReactNode, fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}
it.each(["planning", "reviewing", "repairing"])("uses persisted %s state rather than an empty-course error", async stage => {
  mount(<CoursePage />, vi.fn().mockResolvedValue(response({ course: { topic: "OS", preparationStatus: "generating", preparationStage: stage }, chapters: [], progress: { passed: 0, total: 0 } })));
  expect(await screen.findByRole("heading", { name: "Preparing your course" })).toBeVisible();
  expect(screen.queryByText("No chapters available")).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(stage === "reviewing" ? "Checking coverage" : stage === "repairing" ? "Refining" : "Building a focused path");
});
it("explicitly retries failed preparation and disables duplicate submissions", async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response({ course: { topic: "OS", preparationStatus: "failed", preparationError: "Review did not finish." }, chapters: [], progress: { passed: 0, total: 0 } }))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(response({ course: { topic: "OS", preparationStatus: "pending" }, chapters: [], progress: { passed: 0, total: 0 } }));
  mount(<CoursePage />, fetch);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Trying again…" })).toBeDisabled();
  await act(async () => finish(response({ status: "pending" }, 202)));
  expect(await screen.findByRole("heading", { name: "Preparing your course" })).toBeVisible();
  expect(fetch).toHaveBeenCalledWith("/api/courses/course/retry", { method: "POST" });
});
it.each(["lesson", "quiz"])("requires an explicit action to restart a failed reviewed %s", async artifact => {
  const chapter = { id: "chapter", idx: 0, title: "Isolation", status: "passed", pretest: null };
  const course = { course: { topic: "OS", qualityPolicyVersion: 1 }, chapters: [chapter] };
  const content = artifact === "lesson" ? { chapter, html: "Accepted lesson" } : { questions: [{ id: "q", type: "mcq", prompt: "Which mapping?", options: ["Private", "Shared"], isReview: false }] };
  const fetch = vi.fn().mockResolvedValueOnce(response(course))
    .mockResolvedValueOnce(response({ error: { code: "generation_failed", retryable: true } }, 503))
    .mockResolvedValueOnce(response({ status: "generating" }, 202)).mockResolvedValue(response(content));
  mount(artifact === "lesson" ? <ChapterPage /> : <QuizPage />, fetch);
  const button = await screen.findByRole("button", { name: "Try again" });
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(button);
  expect(await screen.findByText(artifact === "lesson" ? "Accepted lesson" : "Which mapping?")).toBeVisible();
  expect(fetch).toHaveBeenCalledWith(`/api/chapters/chapter/${artifact === "lesson" ? "regenerate" : "quiz/retry"}`, { method: "POST" });
});
