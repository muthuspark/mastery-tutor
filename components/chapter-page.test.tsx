// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ChapterPage } from "./chapter-page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "course", idx: "0" }) }));
vi.mock("./mermaid-content", () => ({ MermaidContent: ({ html }: { html: string }) => <article>{html}</article> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["passed", "open"])("loads a %s lesson and only prefetches assessments for active learning", async status => {
  const chapter = { id: "chapter", idx: 0, title: "Separation", status };
  const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () =>
    url === "/api/courses/course" ? { course: { topic: "Differential equations" }, chapters: [chapter, { id: "next", idx: 1, status: "open" }] }
      : { chapter: { ...chapter, pretest: null }, html: "Saved separation lesson" },
  }));
  vi.stubGlobal("fetch", fetch);
  render(<QueryClientProvider client={new QueryClient()}><ChapterPage /></QueryClientProvider>);
  await screen.findByText("Saved separation lesson");
  const title = screen.getByRole("heading", { level: 1, name: chapter.title });
  expect(title.compareDocumentPosition(screen.getByText("Saved separation lesson")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to course" })).toHaveAttribute("href", "/course/course");
  if (status === "passed") {
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/courses/course", "/api/chapters/chapter"]);
  } else {
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chapters/chapter/quiz"));
    expect(fetch).toHaveBeenCalledWith("/api/chapters/next");
  }
});
