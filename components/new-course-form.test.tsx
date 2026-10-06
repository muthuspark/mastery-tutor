// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NewCourseForm } from "./new-course-form";

describe("NewCourseForm", () => {
  it("shows one topic field and one primary action", () => {
    render(<NewCourseForm />);
    expect(screen.getByLabelText("I want to learn")).toBeVisible();
    expect(screen.getByRole("button", { name: "Begin" })).toBeVisible();
    expect(screen.queryByText("Beginner")).not.toBeInTheDocument();
  });
});
