// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { QuizPage } from "./quiz-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const questions = [1, 2, 3].map(number => ({
  id: `q${number}`, type: "mcq", prompt: `Question ${number}`,
  options: [`Answer ${number}`, `Other ${number}`], isReview: false,
}));
const result = { score: 1, passed: true, answers: [] };
async function mount(submit = vi.fn().mockResolvedValue({ ok: true, json: async () => result })) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return submit(url, options);
    return { ok: true, json: async () => url.includes("/quiz") ? { questions } : { chapters: [{ id: "chapter", idx: 0, status: "open" }] } };
  });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><QuizPage /></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Question 1" });
  return submit;
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next question" }));
const previous = () => fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
const answer = (number: number) => fireEvent.click(screen.getByRole("radio", { name: `A. Answer ${number}` }));
const submitAnswers = () => fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

it("preserves and lets learners revise answers while moving backward and forward", async () => {
  await mount();
  expect(screen.getByRole("button", { name: "Previous question" })).toBeDisabled();
  answer(1); next(); answer(2); previous();
  expect(screen.getByRole("radio", { name: "A. Answer 1" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "B. Other 1" }));
  next();
  expect(screen.getByRole("radio", { name: "A. Answer 2" })).toBeChecked();
  previous();
  expect(screen.getByRole("radio", { name: "B. Other 1" })).toBeChecked();
});

it("recovers the earliest skipped question with a focused alert and submits all saved answers", async () => {
  const submit = await mount();
  next(); next(); answer(3); submitAnswers();
  expect(screen.getByRole("heading", { name: "Question 1" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Answer question 1 before submitting. Your other answers are saved.");
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();
  answer(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  next(); next(); submitAnswers();
  expect(screen.getByRole("heading", { name: "Question 2" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();
  answer(2); next();
  expect(screen.getByRole("radio", { name: "A. Answer 3" })).toBeChecked();
  submitAnswers();
  await screen.findByRole("heading", { name: "Chapter complete" });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(JSON.parse(submit.mock.calls[0][1].body)).toEqual({ answers: questions.map((question, index) => ({ questionId: question.id, response: `Answer ${index + 1}` })) });
});

it("locks navigation and answers during submission, then preserves answers after failure", async () => {
  let resolve!: (value: unknown) => void;
  const submit = vi.fn(() => new Promise(done => { resolve = done; }));
  await mount(submit);
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  expect(screen.getByRole("button", { name: "Previous question" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Grading your answers…" })).toBeDisabled();
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  const back = screen.getByRole("link", { name: "Back to chapter" });
  expect(back).toHaveAttribute("aria-disabled", "true");
  expect(back).toHaveAttribute("tabindex", "-1");
  expect(fireEvent.click(back)).toBe(false);
  previous();
  expect(screen.getByRole("heading", { name: "Question 3" })).toBeVisible();
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: false, json: async () => ({ error: { message: "Try submitting again." } }) }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try submitting again.");
  expect(screen.getByRole("button", { name: "Submit answers" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Previous question" })).toBeEnabled();
  expect(back).toHaveAttribute("aria-disabled", "false");
  previous();
  expect(screen.getByRole("radio", { name: "A. Answer 2" })).toBeChecked();
});


it.each([
  { name: "completed course", fields: { complete: true, nextChapterIdx: null }, label: "View completed course", href: "/course/course" },
  { name: "completion takes priority over a next chapter", fields: { complete: true, nextChapterIdx: 1 }, label: "View completed course", href: "/course/course" },
  { name: "server-selected next chapter", fields: { complete: false, nextChapterIdx: 4 }, label: "Continue", href: "/course/course/ch/4" },
  { name: "zero next chapter index", fields: { complete: false, nextChapterIdx: 0 }, label: "Continue", href: "/course/course/ch/0" },
  { name: "no available next chapter", fields: { complete: false, nextChapterIdx: null }, label: "Back to course", href: "/course/course" },
  { name: "missing next chapter information", fields: {}, label: "Back to course", href: "/course/course" },
])("uses the correct passing action for $name", async ({ fields, label, href }) => {
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, ...fields }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", href);
});

it("keeps failed attempts on the retry flow", async () => {
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, passed: false, complete: false, nextChapterIdx: null }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  const retry = await screen.findByRole("link", { name: "Try again" });
  expect(retry).toHaveAttribute("href", "/course/course/ch/0/quiz");
});
