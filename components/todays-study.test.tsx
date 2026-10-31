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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { TodaysStudy } from "./todays-study";
import type { TodayStudy } from "@/lib/study-contracts";
const data: TodayStudy = {
  setupRequired: false,
  today: "2026-10-31",
  timeZone: "UTC",
  nextRollover: new Date(Date.now() + 86400000).toISOString(),
  dueCount: 1,
  unavailableCount: 0,
  items: [
    {
      id: "s",
      concept: "Probability",
      course: "Math",
      chapter: "Events",
      courseId: "c",
      chapterIdx: 0,
      dueDate: "2026-10-31",
      reason: "Scheduled for today",
    },
  ],
  nextLesson: {
    course: "Math",
    title: "Conditional events",
    href: "/course/c/ch/1",
    reason: "Continue Math. Its prerequisites are complete.",
  },
  nextDueDate: null,
  openReviewId: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(value = data) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TodaysStudy />
    </QueryClientProvider>,
  );
  return client;
}
it("leads with due review and explains the optional lesson", async () => {
  const client = mount();
  expect(
    await screen.findByRole("button", { name: "Start review" }),
  ).toBeVisible();
  expect(screen.getByText("Scheduled for today")).toBeVisible();
  expect(screen.getByRole("link", { name: "Continue lesson" })).toHaveAttribute(
    "href",
    "/course/c/ch/1",
  );
  expect(screen.getByText(/Questions may repeat/)).toBeVisible();
  client.clear();
});
it("shows future-only dates without a review action", async () => {
  const client = mount({
    ...data,
    dueCount: 0,
    items: [],
    nextDueDate: "2026-11-03",
  });
  expect(
    await screen.findByText(/next review is scheduled for 2026-11-03/),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
  client.clear();
});
it("offers inline saved time-zone setup", async () => {
  const client = mount({ ...data, setupRequired: true });
  expect(await screen.findByLabelText("Review time zone")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Review time zone"), {
    target: { value: "Asia/Kolkata" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save review time zone" }),
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/study/preferences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ timeZone: "Asia/Kolkata" }),
      }),
    ),
  );
  client.clear();
});
it("keeps a failed recommendation read recoverable", async () => {
  const client = mount();
  await screen.findByRole("button", { name: "Start review" });
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ error: { message: "Unavailable" } }, { status: 500 }),
  );
  await client.invalidateQueries();
  expect(await screen.findByRole("alert")).toBeVisible();
  client.clear();
});
