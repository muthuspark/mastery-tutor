// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { NewCourseForm } from "./new-course-form";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("offers course creation immediately without provider setup and keeps retry feedback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Please try again shortly." } }, { status: 503 })));
  HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
  render(<NewCourseForm />);
  expect(screen.queryByText(/agent|Configure/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("What do you want to learn?"), { target: { value: "Ecology" } });
  fireEvent.click(screen.getByRole("button", { name: /Create study/ }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please try again shortly."));
  expect(screen.getByLabelText("What do you want to learn?")).toHaveValue("Ecology");
  expect(fetch).toHaveBeenCalledTimes(1);
});
