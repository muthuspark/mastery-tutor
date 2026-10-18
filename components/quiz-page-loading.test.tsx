// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { QuizPage } from "./quiz-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const course = { chapters: [{ id: "chapter", idx: 0, status: "open" }] };
const quiz = { questions: [{ id: "question", type: "mcq", prompt: "Which solution satisfies the equation?", options: ["First", "Second"], isReview: false }] };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mount(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuizPage /></QueryClientProvider>);
}
const loaded = () => screen.findByRole("heading", { name: quiz.questions[0].prompt });

it("shows loading while course lookup is pending, then renders questions", async () => {
  let resolve!: (value: unknown) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue(response(quiz));
  mount(fetch);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your QnA…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => resolve(response(course)));
  expect(await loaded()).toBeVisible();
});

it("automatically retries pending preparation and renders the recovered quiz", async () => {
  let resolve!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response(course))
    .mockResolvedValueOnce(response({ status: "generating" }, 202))
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mount(fetch);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("status")).toHaveTextContent("Preparing your QnA…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => resolve(response(quiz)));
  expect(await loaded()).toBeVisible();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/chapters/chapter/quiz", "/api/chapters/chapter/quiz"]);
});

it("offers manual recovery after the bounded preparation retries run out", async () => {
  const fetch = vi.fn(async (url: string) => response(url.includes("/quiz") ? { status: "generating" } : course, url.includes("/quiz") ? 202 : 200));
  mount(fetch);
  expect(await screen.findByRole("heading", { name: "QnA still preparing" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("still being prepared");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(6); // Course lookup plus initial quiz request and four retries.
  expect(screen.getByRole("link", { name: "Back to chapter" })).toHaveAttribute("href", "/course/course/ch/0");
  fetch.mockResolvedValueOnce(response(quiz));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await loaded()).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(7);
});

it.each(["http", "network"])("recovers a %s quiz failure by refetching only the quiz", async failure => {
  let resolve!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response(course));
  if (failure === "http") fetch.mockResolvedValueOnce(response({ error: { code: "not_found" } }, 503));
  else fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  mount(fetch);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this QnA.");
  const retry = screen.getByRole("button", { name: "Try again" });
  retry.focus();
  expect(retry).toHaveFocus();
  const back = screen.getByRole("link", { name: "Back to chapter" });
  expect(back).toHaveAttribute("href", "/course/course/ch/0");
  back.focus();
  expect(back).toHaveFocus();
  fireEvent.click(retry);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(await screen.findByRole("status")).toHaveTextContent("Preparing your QnA…");
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  await act(async () => resolve(response(quiz)));
  expect(await loaded()).toBeVisible();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/chapters/chapter/quiz", "/api/chapters/chapter/quiz"]);
});

it("retries the course lookup when it failed, then loads the quiz", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response(course)).mockResolvedValueOnce(response(quiz));
  mount(fetch);
  await screen.findByRole("alert");
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await loaded()).toBeVisible();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/courses/course", "/api/chapters/chapter/quiz"]);
});

it.each([
  { name: "missing chapter", body: { chapters: [] }, status: 200, message: "This chapter is unavailable." },
  { name: "locked chapter", body: { chapters: [{ ...course.chapters[0], status: "locked" }] }, status: 200, message: "This chapter is locked." },
  { name: "missing course", body: {}, status: 404, message: "This chapter is unavailable." },
])("shows an accurate unavailable state for $name without requesting a quiz", async ({ body, status, message }) => {
  const fetch = vi.fn().mockResolvedValue(response(body, status));
  mount(fetch);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([403, 404])("handles a chapter becoming unavailable at quiz fetch time (%s)", async status => {
  mount(vi.fn().mockResolvedValueOnce(response(course)).mockResolvedValueOnce(response({}, status)));
  expect(await screen.findByRole("heading", { name: "QnA unavailable" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(status === 403 ? "This chapter is locked." : "This chapter is unavailable.");
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
});

it("offers recovery for an empty quiz response", async () => {
  mount(vi.fn().mockResolvedValueOnce(response(course)).mockResolvedValueOnce(response({ questions: [] })).mockResolvedValueOnce(response(quiz)));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await loaded()).toBeVisible();
});
