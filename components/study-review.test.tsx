// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
import { StudyReview } from "./study-review";
const review = {
  id: "session",
  status: "open",
  questions: [
    {
      id: "q",
      prompt: "What is an event?",
      options: ["A set of outcomes", "An equation"],
      concept: "Events",
      course: "Probability",
      reason: "Scheduled for today",
    },
  ],
  result: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <StudyReview id="session" />
    </QueryClientProvider>,
  );
  return client;
}
it("validates full coverage and retains answers on transport failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (_url, init) =>
        init?.method === "POST"
          ? Response.json({ error: { message: "Try again" } }, { status: 500 })
          : Response.json(review),
      ),
  );
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Submit review" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Answer question 1",
  );
  fireEvent.click(screen.getByLabelText("A set of outcomes"));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Try again"),
  );
  expect(screen.getByLabelText("A set of outcomes")).toBeChecked();
  client.clear();
});
it("shows saved feedback and dates after submission", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (url, init) =>
        url === "/api/study/today"
          ? Response.json({ nextLesson: null })
          : init?.method === "POST"
            ? Response.json({
                answers: [
                  {
                    id: "q",
                    concept: "Events",
                    prompt: "What is an event?",
                    response: "A set of outcomes",
                    correct: true,
                    feedback: "Correct. A set of outcomes.",
                    modelAnswer: "A set of outcomes",
                    dueDate: "2026-11-03",
                  },
                ],
              })
            : Response.json(review),
      ),
  );
  const client = mount();
  fireEvent.click(await screen.findByLabelText("A set of outcomes"));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  expect(
    await screen.findByRole("heading", { name: "Review complete" }),
  ).toHaveFocus();
  expect(screen.getByText("2026-11-03")).toBeVisible();
  client.clear();
});
