// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
async function mount(submit = vi.fn().mockResolvedValue({ ok: true, json: async () => result }), quizQuestions = questions) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return submit(url, options);
    return { ok: true, json: async () => url.includes("/quiz") ? { questions: quizQuestions } : { chapters: [{ id: "chapter", idx: 0, status: "open" }] } };
  });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><QuizPage /></QueryClientProvider>);
  await screen.findByRole("heading", { name: quizQuestions[0].prompt });
  return submit;
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next question" }));
const previous = () => fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
const answer = (number: number) => fireEvent.click(screen.getByRole("radio", { name: `A. Answer ${number}` }));
const submitAnswers = () => fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

it("names each native answer group from its current prompt and focuses explicit navigation", async () => {
  await mount();
  expect(screen.getByRole("heading", { name: "Question 1" })).not.toHaveFocus();
  const group = screen.getByRole("radiogroup", { name: "Question 1" });
  expect(within(group).getAllByRole("radio").map(radio => radio.getAttribute("type"))).toEqual(["radio", "radio"]);
  const selected = within(group).getByRole("radio", { name: "B. Other 1" });
  selected.focus();
  fireEvent.click(selected);
  expect(selected).toHaveFocus();
  expect(selected).toBeChecked();
  next();
  expect(screen.getByRole("heading", { name: "Question 2" })).toHaveFocus();
  expect(screen.getByRole("radiogroup", { name: "Question 2" })).toContainElement(screen.getByRole("radio", { name: "A. Answer 2" }));
  previous();
  expect(screen.getByRole("heading", { name: "Question 1" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "B. Other 1" })).toBeChecked();
});

it.each([true, false])("focuses the result heading after grading (passed: %s)", async (passed) => {
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, passed }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  expect(await screen.findByRole("heading", { name: passed ? "Chapter complete" : "Keep going" })).toHaveFocus();
});

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
  expect(screen.getByRole("alert")).toHaveFocus();
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

it.each([true, false])("shows only unique missed concepts from the submitted attempt (passed: %s)", async (passed) => {
  const answers = ["Separation of variables", "Separation of variables", "Initial conditions", null, "  "].map((missedConcept, index) => ({
    prompt: `Graded question ${index + 1}`, response: "Response", score: missedConcept ? 0 : 1,
    feedback: "Recorded feedback", modelAnswer: "Expected response", missedConcept,
  }));
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...result, passed, score: passed ? 0.8 : 0.4, answers,
    remediation: passed ? null : "Use a worked example to revisit separation, then check the initial condition.",
  }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  const concepts = await screen.findByRole("region", { name: "Concepts to revisit" });
  expect(concepts.querySelectorAll("li")).toHaveLength(2);
  expect(concepts).toHaveTextContent("Separation of variables");
  expect(concepts).toHaveTextContent("Initial conditions");
  expect(screen.getByRole("link", { name: "Review chapter" })).toHaveAttribute("href", "/course/course/ch/0");
  if (passed) {
    expect(screen.getByText(/You passed this assessment\. Durable mastery needs evidence/)).toBeVisible();
    expect(screen.getByText(/Your score passes, but this attempt still shows gaps/)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Before trying again" })).not.toBeInTheDocument();
  } else {
    expect(screen.getByRole("region", { name: "Before trying again" })).toHaveTextContent("Use a worked example to revisit separation, then check the initial condition.");
    fireEvent.click(screen.getByRole("link", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Question 1" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Concepts to revisit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Before trying again" })).not.toBeInTheDocument();
  }
});

it.each([true, false])("does not invent concept gaps or remediation when absent (passed: %s)", async (passed) => {
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, passed }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  await screen.findByRole("heading", { name: passed ? "Chapter complete" : "Keep going" });
  expect(screen.queryByRole("region", { name: "Concepts to revisit" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Before trying again" })).not.toBeInTheDocument();
  expect(screen.queryByText(/this attempt still shows gaps/)).not.toBeInTheDocument();
});

it("shows returned remediation even when the failed attempt has no concept tags", async () => {
  await mount(vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...result, passed: false, remediation: "Review the explanations, then try a fresh QnA.",
  }) }));
  answer(1); next(); answer(2); next(); answer(3); submitAnswers();
  expect(await screen.findByRole("region", { name: "Before trying again" })).toHaveTextContent("Review the explanations, then try a fresh QnA.");
  expect(screen.queryByRole("region", { name: "Concepts to revisit" })).not.toBeInTheDocument();
});


it.each([
  { name: "correct answer", response: "Independent retrieval", modelAnswer: "Independent retrieval", score: 1 },
  { name: "incorrect answer", response: "Assisted practice", modelAnswer: "Independent retrieval", score: 0 },
  { name: "numeric option text", response: "0", modelAnswer: "0", score: 1 },
  { name: "long option text", response: "A long explanation of separation of variables. ".repeat(20) + "x".repeat(200), modelAnswer: "Separate the variables.", score: 0 },
  { name: "literal markup", response: '<img src=x onerror="alert(1)"> **answer** <script>alert(1)</script>', modelAnswer: "<strong>Expected</strong>", score: 0 },
])("shows the submitted $name beside its feedback and model answer", async ({ response, modelAnswer, score }) => {
  const graded = { prompt: "Question 1", response, modelAnswer, score, feedback: score ? "Correct." : "Review this answer.", missedConcept: null };
  const submit = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, answers: [graded] }) });
  await mount(submit, [{ ...questions[0], options: [response, "Other"] }]);
  fireEvent.click(screen.getByRole("radio", { name: `A. ${response}` }));
  submitAnswers();
  await screen.findByRole("heading", { name: "Chapter complete" });
  expect(JSON.parse(submit.mock.calls[0][1].body).answers).toEqual([{ questionId: "q1", response }]);
  const submitted = screen.getByText("Your answer:").closest("p")!;
  expect(submitted.textContent).toBe(`Your answer: ${response}`);
  const review = submitted.parentElement!;
  expect(review).toContainElement(screen.getByText(graded.feedback));
  expect(review).toContainElement(screen.getByText(`Model answer: ${modelAnswer}`));
  expect(review.querySelector("img, script, strong")).toBeNull();
});


it.each([
  { name: "long prose", text: "Explain how repeated retrieval supports learning across different contexts. ".repeat(12).trim() },
  { name: "URL", text: `https://example.test/assessment/${"long-path-segment".repeat(20)}?context=practice` },
  { name: "uninterrupted token", text: "x".repeat(300) },
])("keeps the full $name prompt and option associated while navigating and submitting", async ({ text }) => {
  const quizQuestions = [
    { ...questions[0], prompt: text, options: [text, "Alternative answer"] },
    questions[1],
  ];
  const submit = await mount(undefined, quizQuestions);
  expect(screen.getByRole("heading", { name: text }).textContent).toBe(text);
  expect(screen.getByRole("radiogroup", { name: text })).toHaveAccessibleName(text);
  const radio = screen.getByRole<HTMLInputElement>("radio", { name: `A. ${text}` });
  expect(radio.labels).toHaveLength(1);
  const label = radio.labels![0];
  expect(label.textContent).toBe(`A. ${text}`);
  expect(label).toContainElement(radio);
  radio.focus();
  expect(radio).toHaveFocus();
  // Click the text, exercising the implicit native label association after wrapping it.
  fireEvent.click(screen.getByText(`A. ${text}`));
  expect(radio).toBeChecked();
  next(); answer(2); previous();
  expect(screen.getByRole("radio", { name: `A. ${text}` })).toBeChecked();
  next(); submitAnswers();
  await screen.findByRole("heading", { name: "Chapter complete" });
  expect(JSON.parse(submit.mock.calls[0][1].body)).toEqual({ answers: [
    { questionId: "q1", response: text },
    { questionId: "q2", response: "Answer 2" },
  ] });
});
