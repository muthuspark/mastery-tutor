// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { CourseList } from "./course-list";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renders the known empty layout immediately and keeps it on background fetch failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 503 })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(<QueryClientProvider client={client}><CourseList initialCourses={[]}><section>Creation form</section></CourseList></QueryClientProvider>);
  expect(container.querySelector(".learning-workspace--empty")).not.toBeNull();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("Creation form")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load your studies"));
  expect(container.querySelector(".learning-workspace--empty")).not.toBeNull();
  expect(screen.getByText("Creation form")).toBeVisible();
  client.clear();
});

it("renders initial studies immediately and still accepts a fresh background result", async () => {
  const course = { id: "initial", topic: "Initial study", createdAt: "2026-10-01", progress: { passed: 0, total: 1 } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ courses: [{ ...course, topic: "Updated study" }] })));
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><CourseList initialCourses={[course]} /></QueryClientProvider>);
  expect(screen.getByRole("heading", { level: 2, name: "Initial study" })).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Updated study" })).toBeVisible());
  client.clear();
});
