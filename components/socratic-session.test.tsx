// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SocraticSession } from "./socratic-session";
import type { SocraticSessionView } from "@/lib/socratic-contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const first: SocraticSessionView = {
  id: "session",
  question: { id: "question-1", setup: "You need to find one topic in a long book.", prompt: "How can you reduce search work?", options: ["Use an index", "Copy every row", "Increase storage"], hint: "Think of a book's index." },
  turns: [], summary: null,
};
const turn = { prompt: first.question!.prompt, response: "Use an index", correct: true, usedHint: true, feedback: "An index helps locate the relevant rows." };

function mount() {
  return render(<QueryClientProvider client={new QueryClient()}><SocraticSession chapterId="chapter" version={2} /></QueryClientProvider>);
}
function stubResponses(...responses: { status?: number; body: unknown }[]) {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce({ ok: !response.status || response.status < 400, status: response.status ?? 200, json: async () => response.body });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function start() {
  await screen.findByRole("heading", { name: first.question!.prompt });
}

it("starts guided practice automatically, shows one question, and submits a choice with hint usage", async () => {
  const second = { ...first, question: { ...first.question!, id: "question-2", prompt: "Why not index every column?" }, turns: [turn] };
  const fetch = stubResponses({ body: first }, { body: second });
  mount();
  await start();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(screen.getByRole("heading", { name: first.question!.prompt })).toHaveFocus();
  expect(screen.getByRole("heading", { name: first.question!.prompt })).toHaveAccessibleDescription(first.question!.setup);
  fireEvent.click(screen.getByRole("button", { name: "Give me a hint" }));
  expect(screen.getByRole("status")).toHaveTextContent(first.question!.hint);
  fireEvent.click(screen.getByRole("radio", { name: "A. Use an index" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const nextHeading = await screen.findByRole("heading", { name: second.question.prompt });
  await waitFor(() => expect(nextHeading).toHaveFocus());
  expect(screen.queryByRole("heading", { name: first.question!.prompt })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "answer", version: 2, sessionId: "session", questionId: "question-1", choiceIndex: 0, usedHint: true });
});

it("sends uncertainty without guessing and presents the final explanation", async () => {
  const complete = { ...first, question: null, summary: "Indexes reduce search work but add maintenance cost.", turns: [turn, turn, turn] };
  const fetch = stubResponses({ body: first }, { body: complete });
  mount();
  await start();
  fireEvent.click(screen.getByRole("radio", { name: "I'm not sure" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Putting it together" });
  expect(JSON.parse(fetch.mock.calls[1][1].body).choiceIndex).toBeNull();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByText(complete.summary)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try another guided session" })).not.toBeInTheDocument();
});

it("keeps the selected answer on errors and retries only after the learner acts", async () => {
  const fetch = stubResponses({ body: first }, { status: 503, body: { error: { message: "The tutor timed out. Try again." } } }, { body: { ...first, question: { ...first.question!, id: "question-2", prompt: "Consider the trade-off." }, turns: [turn] } });
  mount();
  await start();
  fireEvent.click(screen.getByRole("radio", { name: "B. Copy every row" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The tutor timed out.");
  expect(screen.getByRole("radio", { name: "B. Copy every row" })).toBeChecked();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Consider the trade-off." });
  expect(fetch.mock.calls[2][1].body).toEqual(fetch.mock.calls[1][1].body);
});

it("disables choices and prevents duplicate submissions while preparing the next step", async () => {
  const fetch = stubResponses({ body: first });
  fetch.mockImplementation(() => new Promise(() => {}));
  mount();
  await start();
  fireEvent.click(screen.getByRole("radio", { name: "A. Use an index" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("status");
  expect(screen.getByRole("radio", { name: "A. Use an index" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Thinking it through…" })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("resumes a saved legacy question without replacing the conversation", async () => {
  const legacy = { ...first, question: { ...first.question!, setup: undefined } };
  const fetch = stubResponses({ body: legacy });
  mount();
  await start();
  expect(screen.getByRole("radio", { name: "A. Use an index" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
