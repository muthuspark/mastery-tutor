// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CoursePage } from "./course-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course" }), useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("offers completed chapters a normal reading link without invoking reset", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Differential equations" },
    chapters: [{ id: "passed", idx: 0, title: "Separation", status: "passed" }],
    progress: { passed: 1, total: 1 },
  }) });
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  const read = await screen.findByRole("link", { name: "Read lesson → Separation" });
  expect(read).toHaveAttribute("href", "/course/course/ch/0");
  expect(read).not.toHaveAttribute("aria-haspopup");
  read.focus();
  expect(read).toHaveFocus();
  // Cancel jsdom navigation after observing whether the component intercepted it.
  let intercepted: boolean | undefined;
  const observeNavigation = (event: MouseEvent) => { intercepted = event.defaultPrevented; event.preventDefault(); };
  document.addEventListener("click", observeNavigation);
  fireEvent.click(read);
  document.removeEventListener("click", observeNavigation);
  expect(intercepted).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/courses/course");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("You completed this course.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Separation\s*Mastered\s*Revisit →/ })).toHaveAttribute("aria-haspopup", "dialog");
});

it("keeps open and locked chapter actions unchanged", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    course: { topic: "Differential equations" }, chapters: [
      { id: "open", idx: 0, title: "Separation", status: "open" },
      { id: "locked", idx: 1, title: "Integration", status: "locked" },
    ], progress: { passed: 0, total: 2 },
  }) }));
  render(<QueryClientProvider client={new QueryClient()}><CoursePage /></QueryClientProvider>);
  expect(await screen.findByRole("link", { name: /Separation\s*Continue →/ })).toHaveAttribute("href", "/course/course/ch/0");
  expect(screen.queryByRole("link", { name: /Read lesson/ })).not.toBeInTheDocument();
  expect(screen.getByText("Locked")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Integration/ })).not.toBeInTheDocument();
});
